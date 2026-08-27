import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  isSupportedImageGenerationModel,
  normalizeImageGenerationModel,
} from '@/lib/image-generation-models';
import { appendNoSubtitleDirective } from '@/lib/storyboard-generation';
import { DEFAULT_SEEDANCE_2_RESOLUTION } from '@/lib/volcengine/video-payload';
import { getVideoGenerationTaskNotFoundError } from '@/lib/video-generation-error';

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

export const getAIAPIConfigKey = (config: AIAPIConfig) => {
  const apiKeyHash = createHash('sha256').update(config.apiKey).digest('hex').slice(0, 16);
  return `${config.baseUrl}|${apiKeyHash}|${config.maxConcurrency}`;
};

const getKey = getAIAPIConfigKey;

const getVideoTaskMapKey = (config: AIAPIConfig, taskId: string) =>
  `video_task_map:${getKey(config)}:${taskId}`;

export const getVideoTaskHistoryKey = (config: AIAPIConfig) =>
  `video_task_history:${getKey(config)}`;

export const VIDEO_TASK_HISTORY_TTL_SECONDS = 60 * 60 * 24;

const getSemaphore = (config: AIAPIConfig) => {
  const key = getKey(config);
  const existing = semaphoreByKey.get(key);
  if (existing) return existing;
  const semaphore = new AsyncSemaphore(config.maxConcurrency);
  semaphoreByKey.set(key, semaphore);
  return semaphore;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const GLOBAL_SEMAPHORE_SCRIPT = `
local now = tonumber(ARGV[1])
local maxConcurrency = tonumber(ARGV[2])
local jobId = ARGV[3]
local expiresAt = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now)
if redis.call('ZCARD', KEYS[1]) >= maxConcurrency then
  return 0
end
redis.call('ZADD', KEYS[1], expiresAt, jobId)
return 1
`;

const VIDEO_SLOT_SCRIPT = `
local now = tonumber(ARGV[1])
local maxConcurrency = tonumber(ARGV[2])
local placeholderId = ARGV[3]
local expiresAt = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now)
if redis.call('ZCARD', KEYS[1]) >= maxConcurrency then
  return 0
end
redis.call('ZADD', KEYS[1], expiresAt, placeholderId)
return 1
`;

const VIDEO_TASK_COMMIT_SCRIPT = `
local placeholderId = ARGV[1]
local realTaskId = ARGV[2]
local jobId = ARGV[3]
local activeExpiresAt = tonumber(ARGV[4])
local createdAt = tonumber(ARGV[5])
local historyTtl = tonumber(ARGV[6])
if realTaskId ~= '' then
  redis.call('ZADD', KEYS[1], activeExpiresAt, realTaskId)
  redis.call('SET', KEYS[2], jobId, 'EX', historyTtl)
  redis.call('ZADD', KEYS[3], createdAt, cjson.encode({ taskId = realTaskId, shotId = jobId }))
  redis.call('EXPIRE', KEYS[3], historyTtl)
end
redis.call('ZREM', KEYS[1], placeholderId)
return 1
`;

const isRedisQuotaError = (error: unknown) =>
  /max requests limit|monthly request|request limit exceeded/i.test(
    error instanceof Error ? error.message : String(error)
  );

const commitVideoTaskInRedis = async (
  redis: Redis,
  config: AIAPIConfig,
  jobId: string,
  realTaskId: string
) => {
  const committedAt = Date.now();
  const activeKey = `video_concurrency:${getKey(config)}:active`;
  await redis.eval<string[], number>(VIDEO_TASK_COMMIT_SCRIPT, [
    activeKey,
    getVideoTaskMapKey(config, realTaskId),
    getVideoTaskHistoryKey(config),
  ], [
    `pending:${jobId}`,
    realTaskId,
    jobId,
    String(committedAt + 15 * 60 * 1000),
    String(committedAt),
    String(VIDEO_TASK_HISTORY_TTL_SECONDS),
  ]);
};

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
    .filter((asset) => asset.imageUrl);

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
  return `${asset.name || fallbackName}：@<<<image_${index + 1}>>>`;
};

const VIDEO_PROMPT_SECTION_LABELS: Record<string, string> = {
  'scene heading': '镜头场景',
  'video prompt': '视频提示词',
  'visual description': '画面描述',
  'shot action': '主体动作',
  emotion: '情绪落点',
  lighting: '光线氛围',
  'camera framing': '镜头调度',
  dialogue: '同步台词/画外音',
  'sound design': '声音设计',
};

const mapVideoPromptSectionLabel = (label: string) =>
  VIDEO_PROMPT_SECTION_LABELS[label.trim().toLowerCase()] || label.trim();

const getVideoPromptSectionValue = (sections: VideoPromptSection[], label: string) =>
  sections.find((section) => section.label.trim().toLowerCase() === label.toLowerCase())?.value || '';

const formatDialogueDirective = (dialogue: string) => {
  const trimmedDialogue = dialogue.trim();
  if (!trimmedDialogue) {
    return '无台词，只保留环境声、呼吸声和动作声。';
  }

  if (
    /【台词】|同步内心独白|旁白/.test(trimmedDialogue) ||
    /[\u4e00-\u9fa5A-Za-z0-9_]+[：:]/.test(trimmedDialogue)
  ) {
    return `当前镜头对白/旁白原文：${trimmedDialogue}。对白必须作为语音指令处理，使用【台词】【角色名】：“对白内容。”或同步内心独白【角色名】：独白内容。不得新增、删减、改写或翻译。`;
  }

  return `当前镜头对白原文：${trimmedDialogue}。请按剧情说话人处理为【台词】【角色名】：“对白内容。”，不得新增、删减、改写或翻译。`;
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
  const normalizedSections = sections
    .map((section) => ({
      label: section.label.trim(),
      value: typeof section.value === 'string' ? section.value.trim() : '',
    }))
    .filter((section) => section.label && section.value);

  const normalizedAssets = normalizeVideoReferenceAssets(referenceAssets);
  const videoPromptValue = getVideoPromptSectionValue(normalizedSections, 'video prompt');
  const dialogueValue = getVideoPromptSectionValue(normalizedSections, 'dialogue');

  const assetLines: string[] = [];
  if (normalizedAssets.length > 0) {
    assetLines.push(
      `参考资产顺序（与视频参考图数组完全一致）：${normalizedAssets
        .map((asset, index) => getVideoReferenceLabel(asset, index))
        .join('，')}。`
    );
    assetLines.push(
      '资产一致性：严格匹配参考图中的主体身份、年龄感、脸型、发型、服装、道具、场景结构和光线方向，不要混用不同角色或场景。'
    );
  } else {
    assetLines.push('未提供外部参考图；严格依据本镜头文字描述保持人物、服装、道具和场景前后一致。');
  }
  const supplementalLines = normalizedSections
    .filter((section) => section.label.trim().toLowerCase() !== 'video prompt')
    .map((section) => `${mapVideoPromptSectionLabel(section.label)}：${section.value}`);

  const storyboardPrompt =
    videoPromptValue ||
    supplementalLines.join('\n') ||
    '·【现代中景/当前场景】按当前镜头信息生成连续、可执行的视频画面，写清主体动作、镜头路径、环境反馈和结束状态。';

  return appendNoSubtitleDirective(
    [
      `·【参考图/一致性/当前镜头】${assetLines.join(' ')}`,
      storyboardPrompt,
      supplementalLines.length > 0 ? `·【镜头补充/连续性/执行约束】${supplementalLines.join('；')}。` : '',
      `·【台词与声音/语音约束/当前镜头】${formatDialogueDirective(dialogueValue)} 台词和内心独白只作为语音指令，不代表画面文字。`,
      '·【全局质感/写实电影/负面约束】保持项目统一画面风格、镜头质感、色调、光影、材质、人物外貌、服装、年龄、发型、道具和场景连续一致；4K 高清，动作自然流畅，面部稳定不变形，五官清晰，人体结构正常，无卡顿、无闪烁；禁止现代元素错入、媒介风格漂移、脸部变形、logo 和水印。',
    ].join('\n\n')
  );
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
      const acquired = await redis.eval<string[], number>(GLOBAL_SEMAPHORE_SCRIPT, [key], [
        String(now),
        String(maxConcurrency),
        jobId,
        String(now + jobTimeout),
      ]);
      if (acquired === 1) {
        return async () => {
          try {
            await redis.zrem(key, jobId);
          } catch (err) {
            console.error('Failed to release KV semaphore:', err);
          }
        };
      }
    } catch (err) {
      if (isRedisQuotaError(err)) {
        throw new AIAPIError('Redis 请求额度已用尽，请升级 Upstash 计划或等待额度重置。', 503);
      }
      console.error('KV Semaphore error:', err);
      throw new AIAPIError('Redis 并发信号量暂时不可用，请稍后重试。', 503);
    }

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
    const placeholderId = `pending:${jobId}`;
    const acquired = await redis.eval<string[], number>(VIDEO_SLOT_SCRIPT, [activeKey], [
      String(now),
      String(maxConcurrency),
      placeholderId,
      String(now + 2 * 60 * 1000),
    ]);

    if (acquired === 1) {

      return async (realTaskId?: string) => {
        try {
          if (realTaskId) {
            await commitVideoTaskInRedis(redis, config, jobId, realTaskId);
          } else {
            await redis.zrem(activeKey, placeholderId);
          }
        } catch (err) {
          console.error('Failed to commit real taskId:', err);
        }
      };
    }
  } catch (err) {
    console.error('KV Queue error:', err);
    if (isRedisQuotaError(err)) {
      throw new AIAPIError('Redis 请求额度已用尽，请升级 Upstash 计划或等待额度重置。', 503);
    }
    throw new AIAPIError('Redis 视频并发队列暂时不可用，请稍后重试。', 503);
  }

  return null;
};

export const recordVideoTask = async (config: AIAPIConfig, jobId: string, taskId: string) => {
  const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!isKVConfigured) return;

  await commitVideoTaskInRedis(Redis.fromEnv(), config, jobId, taskId);
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

const withProviderThrottle = async <T>(config: AIAPIConfig, fn: () => Promise<T>) => {
  await waitForInterval(getKey(config), config.minIntervalMs);
  return await fn();
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
      resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
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
  // Status reads are already bounded by the caller's polling policy. They do
  // not consume a generation slot or require a Redis round trip.
  return await withProviderThrottle(config, async () => {
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
      const taskNotFoundError = getVideoGenerationTaskNotFoundError(detail);
      if (taskNotFoundError) {
        return {
          id: videoId,
          status: 'failed',
          error: taskNotFoundError,
        };
      }
      throw new AIAPIError('查询视频状态失败', response.status, detail);
    }

    const result = await response.json();
    const taskNotFoundError = getVideoGenerationTaskNotFoundError(result);
    return taskNotFoundError
      ? { id: videoId, status: 'failed', error: taskNotFoundError }
      : result;
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
