import { Redis } from '@upstash/redis';

type AIAPIConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxConcurrency: number;
  minIntervalMs: number;
};

export class AIAPIError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status = 500, details?: string) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const configCache: { value: AIAPIConfig | null } = { value: null };
const semaphoreByKey = new Map<string, AsyncSemaphore>();
const lastRequestAtByKey = new Map<string, number>();

class AsyncSemaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(capacity: number) {
    this.available = capacity;
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const grant = () => {
        this.available -= 1;
        resolve(() => this.release());
      };
      if (this.available > 0) {
        grant();
      } else {
        this.queue.push(grant);
      }
    });
  }

  private release() {
    this.available += 1;
    if (this.available > 0 && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const getNumberFromEnv = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const toTimeoutMs = (value: number) => {
  if (value <= 0) return 300000;
  if (value <= 1000) return Math.round(value * 1000);
  return Math.round(value);
};

export const getAIAPIConfig = () => {
  if (configCache.value) return configCache.value;

  const baseUrl = (process.env.AI_API_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/+$/, '');
  const apiKey = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  const model = (process.env.AI_API_MODEL || process.env.OPENAI_MODEL || 'gpt-4o').trim();
  const timeoutMs = toTimeoutMs(
    getNumberFromEnv(
      process.env.AI_API_TIMEOUT_MS || process.env.AI_API_TIMEOUT || process.env.OPENAI_TIMEOUT_MS,
      300
    )
  );
  const maxConcurrency = Math.max(
    1,
    Math.min(50, Math.round(getNumberFromEnv(process.env.AI_API_MAX_CONCURRENCY, 50)))
  );
  const minIntervalMs = Math.max(0, getNumberFromEnv(process.env.AI_API_MIN_INTERVAL_MS, 0));

  if (!baseUrl || !apiKey || !model) {
    throw new AIAPIError('AI API 配置不完整', 500);
  }

  const config = { baseUrl, apiKey, model, timeoutMs, maxConcurrency, minIntervalMs };
  configCache.value = config;
  return config;
};

const getKey = (config: AIAPIConfig) =>
  `${config.baseUrl}|${config.apiKey}|${config.maxConcurrency}`;

const getVideoTaskMapKey = (config: AIAPIConfig, taskId: string) =>
  `video_task_map:${getKey(config)}:${taskId}`;

const getSemaphore = (config: AIAPIConfig) => {
  const key = getKey(config);
  const existing = semaphoreByKey.get(key);
  if (existing) return existing;
  const semaphore = new AsyncSemaphore(config.maxConcurrency);
  semaphoreByKey.set(key, semaphore);
  return semaphore;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type VideoReferenceAsset = {
  name?: string | null;
  type?: string | null;
  imageUrl?: string | null;
};

type VideoPromptSection = {
  label: string;
  value?: string | null;
};

const encodeVideoImageUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    return encodeURI(decodeURI(trimmed));
  } catch {
    return encodeURI(trimmed);
  }
};

const dedupeEncodedImageUrls = (urls: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const encodedUrl = encodeVideoImageUrl(url);
    if (!encodedUrl || seen.has(encodedUrl)) continue;
    seen.add(encodedUrl);
    result.push(encodedUrl);
  }
  return result;
};

const normalizeVideoReferenceAssets = (referenceAssets: VideoReferenceAsset[] = []) =>
  referenceAssets
    .map((asset) => ({
      name: typeof asset.name === 'string' ? asset.name.trim() : '',
      type: typeof asset.type === 'string' ? asset.type.trim().toLowerCase() : '',
      imageUrl: typeof asset.imageUrl === 'string' ? encodeVideoImageUrl(asset.imageUrl) : '',
    }))
    .filter((asset) => asset.imageUrl)
    .filter(
      (asset, index, assets) =>
        assets.findIndex((candidate) => candidate.imageUrl === asset.imageUrl) === index
    );

const getVideoReferenceLabel = (
  asset: ReturnType<typeof normalizeVideoReferenceAssets>[number],
  index: number
) => {
  const fallbackName =
    asset.type === 'character'
      ? 'Character reference'
      : asset.type === 'location'
        ? 'Location reference'
        : 'Reference image';
  return `${asset.name || fallbackName}<<<image_${index + 1}>>>`;
};

const buildVideoGenerationMetadata = (
  metadata?: Record<string, unknown>,
  extraParams?: Record<string, unknown>
) => {
  const nextMetadata: Record<string, unknown> = metadata ? { ...metadata } : {};
  const imageUrls: string[] = [];

  if (typeof extraParams?.image_url === 'string' && extraParams.image_url.trim()) {
    imageUrls.push(extraParams.image_url);
  }

  if (Array.isArray(nextMetadata.images)) {
    for (const item of nextMetadata.images) {
      if (typeof item === 'string' && item.trim()) {
        imageUrls.push(item);
      }
    }
  }

  if (Array.isArray(nextMetadata.image_list)) {
    for (const item of nextMetadata.image_list) {
      if (
        item &&
        typeof item === 'object' &&
        'image_url' in item &&
        typeof item.image_url === 'string' &&
        item.image_url.trim()
      ) {
        imageUrls.push(item.image_url);
      }
    }
  }

  const encodedImageUrls = dedupeEncodedImageUrls(imageUrls);
  delete nextMetadata.images;

  if (encodedImageUrls.length > 0) {
    nextMetadata.image_list = encodedImageUrls.map((imageUrl) => ({ image_url: imageUrl }));
  } else {
    delete nextMetadata.image_list;
  }

  if (
    extraParams &&
    typeof extraParams.aspect_ratio === 'string' &&
    !nextMetadata.aspect_ratio
  ) {
    nextMetadata.aspect_ratio = extraParams.aspect_ratio;
  }

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
};

export const buildVideoGenerationPrompt = (
  sections: VideoPromptSection[],
  referenceAssets: VideoReferenceAsset[] = []
) => {
  const promptLines = sections
    .map((section) => ({
      label: section.label.trim(),
      value: typeof section.value === 'string' ? section.value.trim() : '',
    }))
    .filter((section) => section.label && section.value)
    .map((section) => `${section.label}: ${section.value}`);

  const promptText = promptLines.join('\n');
  if (promptText.includes('<<<image_')) {
    return promptText;
  }

  const normalizedAssets = normalizeVideoReferenceAssets(referenceAssets);
  if (normalizedAssets.length === 0) {
    return promptText;
  }

  const locationAssets = normalizedAssets
    .filter((asset) => asset.type !== 'character')
    .map((asset) => {
      const assetIndex = normalizedAssets.findIndex(
        (candidate) => candidate.imageUrl === asset.imageUrl
      );
      return getVideoReferenceLabel(asset, assetIndex);
    });
  const characterAssets = normalizedAssets
    .filter((asset) => asset.type === 'character')
    .map((asset) => {
      const assetIndex = normalizedAssets.findIndex(
        (candidate) => candidate.imageUrl === asset.imageUrl
      );
      return getVideoReferenceLabel(asset, assetIndex);
    });

  const assetLines: string[] = [];
  if (locationAssets.length > 0) {
    assetLines.push(`Locations: ${locationAssets.join(', ')}.`);
  }
  if (characterAssets.length > 0) {
    assetLines.push(`Visible characters/entities: ${characterAssets.join(', ')}.`);
  }
  if (assetLines.length === 0) {
    assetLines.push(
      `Reference images: ${normalizedAssets
        .map((asset, index) => getVideoReferenceLabel(asset, index))
        .join(', ')}.`
    );
  }
  assetLines.push(
    'Continuity rules: Match the referenced images exactly for subject identity, wardrobe, environment, and lighting continuity.'
  );

  return [...assetLines, ...promptLines].join('\n');
};

const acquireGlobalSemaphore = async (config: AIAPIConfig): Promise<() => void | Promise<void>> => {
  const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!isKVConfigured) {
    const semaphore = getSemaphore(config);
    return await semaphore.acquire();
  }

  const redis = Redis.fromEnv();
  const key = `global_concurrency:${getKey(config)}`;
  const maxConcurrency = config.maxConcurrency;
  const jobTimeout = Math.max(config.timeoutMs, 600000); // Max 10 mins
  const jobId = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}`;

  while (true) {
    try {
      const now = Date.now();
      // 1. Remove expired jobs
      await redis.zremrangebyscore(key, 0, now);
      
      // 2. Count current active jobs
      const count = await redis.zcard(key);
      
      if (count < maxConcurrency) {
        // 3. Try to add our job
        await redis.zadd(key, { score: now + jobTimeout, member: jobId });
        
        // 4. Verify we are within the limit (prevent race conditions)
        const rank = await redis.zrank(key, jobId);
        if (rank !== null && rank < maxConcurrency) {
          // Success
          return async () => {
            try {
              await redis.zrem(key, jobId);
            } catch (err) {
              console.error('Failed to release KV semaphore:', err);
            }
          };
        } else {
          // We got added but exceeded the limit, rollback
          await redis.zrem(key, jobId);
        }
      }
    } catch (err) {
      console.error('KV Semaphore error, waiting before retry:', err);
    }
    
    // Wait 2~3s with jitter before retrying
    await sleep(2000 + Math.random() * 1000);
  }
};

export const tryAcquireVideoSlot = async (config: AIAPIConfig, jobId: string): Promise<((taskId?: string) => Promise<void>) | null> => {
  const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!isKVConfigured) {
    // Fallback for local testing without Redis
    const semaphore = getSemaphore(config);
    // Non-blocking acquire is not implemented for AsyncSemaphore, just return a dummy if we can't do it right,
    // but actually let's just let it proceed for local
    const release = await semaphore.acquire();
    return async () => release();
  }

  const redis = Redis.fromEnv();
  const baseKey = `video_concurrency:${getKey(config)}`;
  const activeKey = `${baseKey}:active`;
  const maxConcurrency = config.maxConcurrency;

  try {
    const now = Date.now();
    // Remove tasks that have been active for > 15 mins (timeout safety)
    await redis.zremrangebyscore(activeKey, 0, now - 15 * 60 * 1000);

    const activeCount = await redis.zcard(activeKey);
    
    if (activeCount < maxConcurrency) {
      // My turn!
      const placeholderId = `pending:${jobId}`;
      await redis.zadd(activeKey, { score: now + 2 * 60 * 1000, member: placeholderId }); // 2 min placeholder

      return async (realTaskId?: string) => {
        try {
          if (realTaskId) {
            await redis.zadd(activeKey, { score: Date.now() + 15 * 60 * 1000, member: realTaskId });
            await redis.set(getVideoTaskMapKey(config, realTaskId), jobId, { ex: 60 * 60 * 24 });
          }
          await redis.zrem(activeKey, placeholderId);
        } catch (err) {
          console.error('Failed to commit real taskId:', err);
        }
      };
    }
  } catch (err) {
    console.error('KV Queue error:', err);
  }

  return null; // Cannot acquire slot immediately
};

export const enqueueVideoTaskAndWait = async (config: AIAPIConfig, jobId: string): Promise<((taskId?: string) => Promise<void>)> => {
  // Keeping this for backwards compatibility if needed, but we shouldn't use it in serverless
  const slot = await tryAcquireVideoSlot(config, jobId);
  if (slot) return slot;
  
  // If we must wait (not recommended in Vercel), just fallback to old logic or throw
  throw new Error("Queue is full. Please use async queueing.");
};

export const cancelVideoTask = async (jobId: string) => {
  const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!isKVConfigured) return;

  try {
    const config = getAIAPIConfig();
    const redis = Redis.fromEnv();
    const queueKey = `video_concurrency:${getKey(config)}:queue`;
    // Only remove from queue. Active tasks cannot be cancelled here
    // because they are already submitted to the upstream API.
    await redis.zrem(queueKey, jobId);
  } catch (err) {
    console.error('Failed to cancel video task:', err);
  }
};

export const completeVideoTask = async (taskId: string) => {
  const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!isKVConfigured) return;

  try {
    const config = getAIAPIConfig();
    const redis = Redis.fromEnv();
    const activeKey = `video_concurrency:${getKey(config)}:active`;
    await redis.zrem(activeKey, taskId);
    await redis.del(getVideoTaskMapKey(config, taskId));
  } catch (err) {
    console.error('Failed to complete video task:', err);
  }
};

export const getShotIdByVideoTaskId = async (taskId: string): Promise<string | null> => {
  const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!isKVConfigured) return null;

  try {
    const config = getAIAPIConfig();
    const redis = Redis.fromEnv();
    const shotId = await redis.get<string>(getVideoTaskMapKey(config, taskId));
    return shotId || null;
  } catch (err) {
    console.error('Failed to get shotId by taskId:', err);
    return null;
  }
};

const waitForInterval = async (key: string, minIntervalMs: number) => {
  if (minIntervalMs <= 0) return;
  const now = Date.now();
  const last = lastRequestAtByKey.get(key) ?? 0;
  const elapsed = now - last;
  if (elapsed < minIntervalMs) {
    await sleep(minIntervalMs - elapsed);
  }
  lastRequestAtByKey.set(key, Date.now());
};

const fetchWithTimeout = async (input: RequestInfo, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const withThrottle = async <T>(config: AIAPIConfig, fn: () => Promise<T>) => {
  const release = await acquireGlobalSemaphore(config);
  try {
    await waitForInterval(getKey(config), config.minIntervalMs);
    return await fn();
  } finally {
    await release();
  }
};

export type AIChatMessage = {
  role: string;
  content: string | any[];
};

type ChatCompletionParams = {
  messages: AIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  extraPayload?: Record<string, unknown>;
};

export const callAIChatCompletion = async ({
  messages,
  temperature = 0.7,
  maxTokens,
  extraPayload,
}: ChatCompletionParams) => {
  const config = getAIAPIConfig();
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature,
  };
  if (typeof maxTokens === 'number') payload.max_tokens = maxTokens;
  if (extraPayload) Object.assign(payload, extraPayload);

  return await withThrottle(config, async () => {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      config.timeoutMs
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIAPIError('AI API 请求失败', response.status, detail);
    }

    return await response.json();
  });
};

export const extractFirstMessageContent = (result: unknown) => {
  const choices = (result as { choices?: unknown })?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AIAPIError('AI API 响应缺少 choices', 502);
  }
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content !== 'string') {
    throw new AIAPIError('AI API 响应缺少可用的 content', 502);
  }
  return content;
};

export const callAIImageGeneration = async (prompt: string, aspectRatio: string = '1:1', n: number = 1, referenceImageUrl?: string) => {
  const config = getAIAPIConfig();
  const imageModel = process.env.AI_API_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || config.model;

  const finalPrompt = aspectRatio !== '1:1' ? `${prompt}, aspect ratio ${aspectRatio}` : prompt;

  let messages: AIChatMessage[] = [{ role: 'user', content: finalPrompt }];

  // 如果提供了参考图（并且不是普通的模型），可以通过图片消息格式传入
  if (referenceImageUrl) {
    messages = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: referenceImageUrl } },
          { type: 'text', text: finalPrompt }
        ]
      }
    ];
  }

  return await callAIChatCompletion({
    messages,
    extraPayload: { model: imageModel, n },
  });
};

export const callAIVideoGeneration = async (
  prompt: string,
  duration: number,
  metadata?: Record<string, unknown>,
  extraParams?: Record<string, unknown>,
  jobId?: string,
  allowQueueing: boolean = true // if true, it returns early if slot is not available
) => {
  const config = getAIAPIConfig();
  const videoModel = process.env.AI_API_VIDEO_MODEL || process.env.OPENAI_VIDEO_MODEL || config.model;

  const resolvedJobId = jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  const commitTask = await tryAcquireVideoSlot(config, resolvedJobId);

  if (!commitTask) {
    if (allowQueueing) {
      return { status: 'queued', message: 'Added to background queue', task_id: null };
    } else {
      throw new AIAPIError('Server is currently at maximum capacity, please try again later.', 429);
    }
  }

  try {
    const payload: Record<string, unknown> = {
      model: videoModel,
      prompt,
    };
    
    if (duration) payload.duration = duration;

    if (extraParams) {
      Object.assign(payload, extraParams);
    }

    delete payload.image_url;

    const finalMetadata = buildVideoGenerationMetadata(metadata, extraParams);
    if (finalMetadata) {
      payload.metadata = finalMetadata;
    }

    const response = await fetchWithTimeout(
      `${config.baseUrl}/video/generations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      config.timeoutMs
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIAPIError('AI 视频生成请求失败', response.status, detail);
    }

    const data = await response.json();
    const taskId = data.task_id || data.id || data.data?.task_id || data.data?.id;
    
    if (taskId) {
      // 🚀 The Bug Was Here: tryAcquireVideoSlot returns async (realTaskId?: string) => void
      // But we must pass it explicitly to commitTask
      await commitTask(taskId);
    } else {
      await commitTask(); // clean up if no task id
    }
    
    return data;
  } catch (err) {
    await commitTask(); // Remove placeholder on failure
    throw err;
  }
};

export const getAIVideoStatus = async (videoId: string) => {
  const config = getAIAPIConfig();
  return await withThrottle(config, async () => {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/video/generations/${videoId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      },
      config.timeoutMs
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIAPIError('查询视频状态失败', response.status, detail);
    }

    return await response.json();
  });
};

export const downloadAIVideo = async (videoId: string, variant: string) => {
  const config = getAIAPIConfig();
  return await withThrottle(config, async () => {
    const url = new URL(`${config.baseUrl}/videos/${videoId}/content`);
    if (variant) url.searchParams.set('variant', variant);
    const response = await fetchWithTimeout(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        redirect: 'manual', // Don't follow redirects, return the 302/307 to the client
      },
      config.timeoutMs
    );

    if (!response.ok && response.status >= 400) {
      const detail = await response.text().catch(() => '');
      throw new AIAPIError('下载视频失败', response.status, detail);
    }

    return response;
  });
};

export const extractImageUrls = (result: unknown) => {
  const urls: string[] = [];
  const dataItems = (result as { data?: unknown })?.data;
  if (Array.isArray(dataItems)) {
    for (const item of dataItems as Array<{ url?: unknown; b64_json?: unknown }>) {
      if (typeof item?.url === 'string') urls.push(item.url);
      if (typeof item?.b64_json === 'string') urls.push(`data:image/png;base64,${item.b64_json}`);
    }
  }
  if (urls.length > 0) return Array.from(new Set(urls));

  let content = '';
  try {
    content = extractFirstMessageContent(result);
  } catch {
    content = '';
  }

  if (content) {
    try {
      const parsed = JSON.parse(content) as {
        data?: Array<{ url?: string; b64_json?: string }>;
        url?: string;
        image?: { url?: string };
      };
      if (Array.isArray(parsed?.data)) {
        for (const item of parsed.data) {
          if (typeof item?.url === 'string') urls.push(item.url);
          if (typeof item?.b64_json === 'string') urls.push(`data:image/png;base64,${item.b64_json}`);
        }
      }
      if (typeof parsed?.url === 'string') urls.push(parsed.url);
      if (typeof parsed?.image?.url === 'string') urls.push(parsed.image.url);
    } catch {
      const dataUriMatch = content.match(/data:image\/[^;]+;base64,[a-zA-Z0-9+/=]+/);
      if (dataUriMatch) {
        urls.push(dataUriMatch[0]);
      } else {
        const matches = content.match(/https?:\/\/[^\s"'<>]+/g);
        if (matches) urls.push(...matches);
      }
    }
  }

  return Array.from(new Set(urls));
};
