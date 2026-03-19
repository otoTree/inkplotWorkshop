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
  `${config.baseUrl}|${config.apiKey}|${config.model}|${config.maxConcurrency}`;

const getSemaphore = (config: AIAPIConfig) => {
  const key = getKey(config);
  const existing = semaphoreByKey.get(key);
  if (existing) return existing;
  const semaphore = new AsyncSemaphore(config.maxConcurrency);
  semaphoreByKey.set(key, semaphore);
  return semaphore;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const semaphore = getSemaphore(config);
  const release = await semaphore.acquire();
  try {
    await waitForInterval(getKey(config), config.minIntervalMs);
    return await fn();
  } finally {
    release();
  }
};

export type AIChatMessage = {
  role: string;
  content: string;
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

export const callAIImageGeneration = async (prompt: string, aspectRatio: string = '1:1') => {
  const config = getAIAPIConfig();
  const imageModel = process.env.AI_API_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || config.model;

  const finalPrompt = aspectRatio !== '1:1' ? `${prompt}, aspect ratio ${aspectRatio}` : prompt;

  return await callAIChatCompletion({
    messages: [{ role: 'user', content: finalPrompt }],
    extraPayload: { model: imageModel },
  });
};

export const callAIVideoGeneration = async (
  prompt: string,
  duration: number,
  metadata?: Record<string, unknown>,
  extraParams?: Record<string, unknown>
) => {
  const config = getAIAPIConfig();
  const videoModel = process.env.AI_API_VIDEO_MODEL || process.env.OPENAI_VIDEO_MODEL || config.model;

  return await withThrottle(config, async () => {
    const payload: Record<string, unknown> = {
      model: videoModel,
      prompt,
    };
    
    // Some models/providers might reject 'duration' or expect it in metadata, but standard API uses it
    if (duration) payload.duration = duration;
    
    // For specific APIs like Kling, images should be an array in metadata or payload depending on spec.
    // The previous frontend passes `image_url` but some APIs expect `metadata.images` or `image`
    if (extraParams?.image_url) {
      if (!metadata) metadata = {};
      metadata.images = [extraParams.image_url];
      // keep it in root payload just in case the proxy needs it
      payload.image_url = extraParams.image_url; 
    }
    
    // Add extra params (like image_url, aspect_ratio) to payload or metadata depending on API spec
    // For standard compatible APIs, they usually go in the root payload
    if (extraParams) {
        Object.assign(payload, extraParams);
    }
    
    if (metadata) {
      payload.metadata = metadata;
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

    return await response.json();
  });
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
