import { Redis } from '@upstash/redis';
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  isSupportedImageGenerationModel,
  normalizeImageGenerationModel,
} from '@/lib/image-generation-models';
import { appendNoSubtitleDirective } from '@/lib/storyboard-generation';

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

const llmConfigCache: { value: AIAPIConfig | null } = { value: null };
const mediaConfigCache: { value: AIAPIConfig | null } = { value: null };
const imageConfigCache: { value: AIAPIConfig | null } = { value: null };
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

const getFirstDefinedEnv = (...values: Array<string | undefined>) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const buildAIAPIConfig = ({
  baseUrlValues,
  apiKeyValues,
  modelValues,
  timeoutValues,
  maxConcurrencyValues,
  minIntervalValues,
}: {
  baseUrlValues: Array<string | undefined>;
  apiKeyValues: Array<string | undefined>;
  modelValues: Array<string | undefined>;
  timeoutValues: Array<string | undefined>;
  maxConcurrencyValues: Array<string | undefined>;
  minIntervalValues: Array<string | undefined>;
}) => {
  const baseUrl = (getFirstDefinedEnv(...baseUrlValues) || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = getFirstDefinedEnv(...apiKeyValues);
  const model = getFirstDefinedEnv(...modelValues) || 'gpt-4o';
  const timeoutMs = toTimeoutMs(getNumberFromEnv(getFirstDefinedEnv(...timeoutValues), 300));
  const maxConcurrency = Math.max(1, Math.min(50, Math.round(getNumberFromEnv(getFirstDefinedEnv(...maxConcurrencyValues), 50))));
  const minIntervalMs = Math.max(0, getNumberFromEnv(getFirstDefinedEnv(...minIntervalValues), 0));

  if (!baseUrl || !apiKey || !model) {
    throw new AIAPIError('AI API 配置不完整', 500);
  }

  return { baseUrl, apiKey, model, timeoutMs, maxConcurrency, minIntervalMs };
};

export const getAILLMAPIConfig = () => {
  if (llmConfigCache.value) return llmConfigCache.value;

  const config = buildAIAPIConfig({
    baseUrlValues: [
      process.env.AI_LLM_API_BASE_URL,
      process.env.AI_TEXT_API_BASE_URL,
      process.env.AI_API_BASE_URL,
      process.env.OPENAI_BASE_URL,
    ],
    apiKeyValues: [
      process.env.AI_LLM_API_KEY,
      process.env.AI_TEXT_API_KEY,
      process.env.AI_API_KEY,
      process.env.OPENAI_API_KEY,
    ],
    modelValues: [
      process.env.AI_LLM_API_MODEL,
      process.env.AI_TEXT_API_MODEL,
      process.env.AI_API_MODEL,
      process.env.OPENAI_MODEL,
    ],
    timeoutValues: [
      process.env.AI_LLM_API_TIMEOUT_MS,
      process.env.AI_LLM_API_TIMEOUT,
      process.env.AI_TEXT_API_TIMEOUT_MS,
      process.env.AI_TEXT_API_TIMEOUT,
      process.env.AI_API_TIMEOUT_MS,
      process.env.AI_API_TIMEOUT,
      process.env.OPENAI_TIMEOUT_MS,
    ],
    maxConcurrencyValues: [
      process.env.AI_LLM_API_MAX_CONCURRENCY,
      process.env.AI_TEXT_API_MAX_CONCURRENCY,
      process.env.AI_API_MAX_CONCURRENCY,
    ],
    minIntervalValues: [
      process.env.AI_LLM_API_MIN_INTERVAL_MS,
      process.env.AI_TEXT_API_MIN_INTERVAL_MS,
      process.env.AI_API_MIN_INTERVAL_MS,
    ],
  });

  llmConfigCache.value = config;
  return config;
};

export const getAIAPIConfig = () => {
  if (mediaConfigCache.value) return mediaConfigCache.value;

  const config = buildAIAPIConfig({
    baseUrlValues: [process.env.AI_API_BASE_URL, process.env.OPENAI_BASE_URL],
    apiKeyValues: [process.env.AI_API_KEY, process.env.OPENAI_API_KEY],
    modelValues: [process.env.AI_API_MODEL, process.env.OPENAI_MODEL],
    timeoutValues: [process.env.AI_API_TIMEOUT_MS, process.env.AI_API_TIMEOUT, process.env.OPENAI_TIMEOUT_MS],
    maxConcurrencyValues: [process.env.AI_API_MAX_CONCURRENCY],
    minIntervalValues: [process.env.AI_API_MIN_INTERVAL_MS],
  });

  mediaConfigCache.value = config;
  return config;
};

export const getAIImageAPIConfig = () => {
  if (imageConfigCache.value) return imageConfigCache.value;

  const config = buildAIAPIConfig({
    baseUrlValues: [
      process.env.AI_IMAGE_API_BASE_URL,
      process.env.AI_API_BASE_URL,
      process.env.OPENAI_BASE_URL,
    ],
    apiKeyValues: [
      process.env.AI_IMAGE_API_KEY,
      process.env.AI_API_KEY,
      process.env.OPENAI_API_KEY,
    ],
    modelValues: [
      process.env.AI_IMAGE_API_MODEL,
      process.env.AI_API_IMAGE_MODEL,
      process.env.OPENAI_IMAGE_MODEL,
      process.env.AI_API_MODEL,
      process.env.OPENAI_MODEL,
    ],
    timeoutValues: [
      process.env.AI_IMAGE_API_TIMEOUT_MS,
      process.env.AI_IMAGE_API_TIMEOUT,
      process.env.AI_API_TIMEOUT_MS,
      process.env.AI_API_TIMEOUT,
      process.env.OPENAI_TIMEOUT_MS,
    ],
    maxConcurrencyValues: [
      process.env.AI_IMAGE_API_MAX_CONCURRENCY,
      process.env.AI_API_MAX_CONCURRENCY,
    ],
    minIntervalValues: [
      process.env.AI_IMAGE_API_MIN_INTERVAL_MS,
      process.env.AI_API_MIN_INTERVAL_MS,
    ],
  });

  imageConfigCache.value = config;
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

const getAIRequestRetryCount = () =>
  Math.max(
    0,
    Math.min(
      5,
      Math.round(
        getNumberFromEnv(
          getFirstDefinedEnv(
            process.env.AI_LLM_API_RETRY_COUNT,
            process.env.AI_TEXT_API_RETRY_COUNT,
            process.env.AI_API_RETRY_COUNT
          ),
          2
        )
      )
    )
  );

const getErrorChain = (error: unknown) => {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current && chain.length < 6) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
};

const getErrorDetails = (error: unknown) =>
  getErrorChain(error)
    .map((entry) => {
      if (entry instanceof Error) return `${entry.name}: ${entry.message}`;
      if (entry && typeof entry === 'object') {
        const code = (entry as { code?: unknown }).code;
        const syscall = (entry as { syscall?: unknown }).syscall;
        return [code, syscall].filter(Boolean).join(' ');
      }
      return String(entry);
    })
    .filter(Boolean)
    .join(' | ');

const isAbortError = (error: unknown) =>
  getErrorChain(error).some((entry) => {
    if (entry instanceof Error && entry.name === 'AbortError') return true;
    return (
      !!entry &&
      typeof entry === 'object' &&
      (entry as { name?: unknown }).name === 'AbortError'
    );
  });

const isRetryableNetworkError = (error: unknown) => {
  if (isAbortError(error)) return false;

  const retryableCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENOTFOUND',
    'UND_ERR_SOCKET',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
  ]);

  return getErrorChain(error).some((entry) => {
    const code =
      entry && typeof entry === 'object' ? (entry as { code?: unknown }).code : undefined;
    if (typeof code === 'string' && retryableCodes.has(code)) return true;

    const message = entry instanceof Error ? entry.message : String(entry);
    return /terminated|fetch failed|socket|network|connection|ECONNRESET/i.test(message);
  });
};

const isRetryableAIAPIError = (error: unknown) =>
  error instanceof AIAPIError &&
  [408, 409, 425, 429, 500, 502, 503, 504].includes(error.status);

const retryTransientAIRequest = async <T>(fn: () => Promise<T>) => {
  const maxAttempts = getAIRequestRetryCount() + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < maxAttempts &&
        (isRetryableAIAPIError(error) || isRetryableNetworkError(error));
      if (!canRetry) break;

      await sleep(Math.min(4000, 600 * 2 ** (attempt - 1)));
    }
  }

  if (lastError instanceof AIAPIError) throw lastError;
  if (isAbortError(lastError)) {
    throw new AIAPIError('AI API 请求超时，请稍后重试', 504, getErrorDetails(lastError));
  }
  if (isRetryableNetworkError(lastError)) {
    throw new AIAPIError('AI API 网络连接中断，请稍后重试', 502, getErrorDetails(lastError));
  }
  throw lastError;
};

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
    return appendNoSubtitleDirective(promptText);
  }

  const normalizedAssets = normalizeVideoReferenceAssets(referenceAssets);
  if (normalizedAssets.length === 0) {
    return appendNoSubtitleDirective(promptText);
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

  return appendNoSubtitleDirective([...assetLines, ...promptLines].join('\n'));
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
  content: string | unknown[];
};

type ChatCompletionParams = {
  messages: AIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  extraPayload?: Record<string, unknown>;
  config?: AIAPIConfig;
};

export const callAIChatCompletion = async ({
  messages,
  temperature = 0.7,
  maxTokens,
  extraPayload,
  config,
}: ChatCompletionParams) => {
  const currentConfig = config || getAILLMAPIConfig();
  const payload: Record<string, unknown> = {
    model: currentConfig.model,
    messages,
    temperature,
  };
  if (typeof maxTokens === 'number') payload.max_tokens = maxTokens;
  if (extraPayload) Object.assign(payload, extraPayload);

  return await withThrottle(currentConfig, async () =>
    retryTransientAIRequest(async () => {
      const response = await fetchWithTimeout(
        `${currentConfig.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentConfig.apiKey}`,
          },
          body: JSON.stringify(payload),
        },
        currentConfig.timeoutMs
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new AIAPIError('AI API 请求失败', response.status, detail);
      }

      return await response.json();
    })
  );
};

export const extractFirstMessageContent = (result: unknown) => {
  const choices = (result as { choices?: unknown })?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AIAPIError('AI API 响应缺少 choices', 502);
  }
  const firstChoice = choices[0] as {
    finish_reason?: unknown;
    message?: { content?: unknown };
  };
  if (firstChoice.finish_reason === 'length') {
    throw new AIAPIError('AI API 输出被 max_tokens 截断，请调高输出 token 上限', 502);
  }
  const message = firstChoice.message;
  const content = message?.content;
  if (typeof content !== 'string') {
    throw new AIAPIError('AI API 响应缺少可用的 content', 502);
  }
  if (!content.trim()) {
    throw new AIAPIError('AI API 返回空内容，请稍后重试或调整 JSON 提示词', 502);
  }
  return content;
};

const GPT_IMAGE_2_1K_SIZES = new Set(['1:1', '3:2', '2:3']);
const GPT_IMAGE_2_4K_SIZES = new Set(['16:9', '9:16', '2:1', '1:2', '21:9', '9:21']);

const getImageModelFromEnv = () =>
  normalizeImageGenerationModel(
    process.env.AI_IMAGE_API_MODEL ||
      process.env.AI_API_IMAGE_MODEL ||
      process.env.OPENAI_IMAGE_MODEL ||
      DEFAULT_IMAGE_GENERATION_MODEL
  );

const normalizeReferenceImageUrls = (referenceImageUrl?: string | string[]) => {
  if (!referenceImageUrl) return [];
  const urls = Array.isArray(referenceImageUrl)
    ? referenceImageUrl
    : [referenceImageUrl];
  return urls.filter(
    (url): url is string => typeof url === 'string' && url.trim().length > 0
  );
};

const getOrientationForAspectRatio = (aspectRatio: string) => {
  const [width, height] = aspectRatio.split(':').map((part) => Number(part));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width === height) {
    return undefined;
  }
  return width > height ? 'landscape' : 'portrait';
};

const getGPTImage2Resolution = (aspectRatio: string) => {
  if (GPT_IMAGE_2_1K_SIZES.has(aspectRatio)) return '1K';
  if (GPT_IMAGE_2_4K_SIZES.has(aspectRatio)) return '2K';
  return '2K';
};

type CreateImageTaskParams = {
  prompt: string;
  aspectRatio?: string;
  n?: number;
  model?: string;
  referenceImageUrl?: string | string[];
  clientBusinessId?: string;
};

const createAsyncImageTask = async ({
  prompt,
  aspectRatio = '1:1',
  n = 1,
  model,
  referenceImageUrl,
  clientBusinessId,
}: CreateImageTaskParams) => {
  const config = getAIImageAPIConfig();
  const resolvedModel = isSupportedImageGenerationModel(model)
    ? model
    : getImageModelFromEnv();
  const referenceImageUrls = normalizeReferenceImageUrls(referenceImageUrl);

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    prompt,
    size: aspectRatio,
    n,
  };

  if (clientBusinessId) {
    payload.client_business_id = clientBusinessId;
  }

  if (resolvedModel === 'gpt-image-2') {
    payload.resolution = getGPTImage2Resolution(aspectRatio);
    payload.response_format = 'url';
    if (referenceImageUrls.length > 0) {
      payload.reference_images = referenceImageUrls;
    }
  } else {
    const metadata: Record<string, unknown> = {
      resolution: '1K',
    };
    const orientation = getOrientationForAspectRatio(aspectRatio);
    if (orientation) metadata.orientation = orientation;
    payload.metadata = metadata;
    if (referenceImageUrls.length > 0) {
      payload.image_urls = referenceImageUrls.map((url) => ({ url }));
    }
  }

  return await withThrottle(config, async () => {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/images/generations`,
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
      throw new AIAPIError('AI 图片生成请求失败', response.status, detail);
    }

    return await response.json();
  });
};

const getAsyncImageTaskStatus = async (taskId: string) => {
  const config = getAIImageAPIConfig();

  const response = await fetchWithTimeout(
    `${config.baseUrl}/images/generations/${encodeURIComponent(taskId)}`,
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
    throw new AIAPIError('查询图片生成状态失败', response.status, detail);
  }

  return await response.json();
};

const waitForAsyncImageTask = async (
  taskId: string,
  {
    initialDelayMs = 2000,
    pollIntervalMs = 3000,
    maxWaitMs = 120000,
  }: {
    initialDelayMs?: number;
    pollIntervalMs?: number;
    maxWaitMs?: number;
  } = {}
) => {
  const startedAt = Date.now();

  if (initialDelayMs > 0) {
    await sleep(initialDelayMs);
  }

  while (Date.now() - startedAt <= maxWaitMs) {
    const task = await getAsyncImageTaskStatus(taskId);
    const status = String((task as { status?: unknown })?.status || '').toLowerCase();

    if (status === 'completed') {
      return task;
    }

    if (status === 'failed') {
      const error = (task as { error?: { message?: string; code?: string } }).error;
      const detail =
        error?.message || error?.code || JSON.stringify(task);
      throw new AIAPIError('AI 图片生成失败', 502, detail);
    }

    await sleep(pollIntervalMs);
  }

  throw new AIAPIError('AI 图片生成超时', 504, `task_id=${taskId}`);
};

const callLegacyAIImageGeneration = async (
  prompt: string,
  aspectRatio: string = '1:1',
  n: number = 1,
  referenceImageUrl?: string
) => {
  const config = getAIAPIConfig();
  const imageModel =
    process.env.AI_API_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || config.model;

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
    config,
    extraPayload: { model: imageModel, n },
  });
};

export const callAIImageGeneration = async (
  prompt: string,
  aspectRatio: string = '1:1',
  n: number = 1,
  referenceImageUrl?: string | string[],
  model?: string
) => {
  const resolvedModel = isSupportedImageGenerationModel(model)
    ? model
    : getImageModelFromEnv();

  if (!isSupportedImageGenerationModel(resolvedModel)) {
    return await callLegacyAIImageGeneration(
      prompt,
      aspectRatio,
      n,
      Array.isArray(referenceImageUrl) ? referenceImageUrl[0] : referenceImageUrl
    );
  }

  const task = await createAsyncImageTask({
    prompt,
    aspectRatio,
    n,
    model: resolvedModel,
    referenceImageUrl,
  });
  const taskId = (task as { id?: unknown; task_id?: unknown })?.id ||
    (task as { id?: unknown; task_id?: unknown })?.task_id;

  if (typeof taskId !== 'string' || !taskId) {
    throw new AIAPIError('AI 图片生成任务返回缺少 task id', 502);
  }

  return await waitForAsyncImageTask(taskId);
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
  const resultDataItems = (result as { result?: { data?: unknown[] } })?.result?.data;
  if (Array.isArray(resultDataItems)) {
    for (const item of resultDataItems as Array<{ url?: unknown; b64_json?: unknown }>) {
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
