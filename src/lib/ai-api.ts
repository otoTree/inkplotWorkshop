import { put } from '@vercel/blob';

export class AIAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIAPIError';
  }
}

export interface AIAPIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  imageModel?: string; // 独立的图像模型配置
  videoModel?: string; // 独立的视频模型配置
  timeout?: number;
  maxConcurrency?: number;
  minIntervalMs?: number;
}

// 简单的并发控制锁 (Semaphore)
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(concurrency: number) {
    this.permits = concurrency;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.permits++;
    }
  }
}

// 全局缓存
const _semaphoreByKey = new Map<string, Semaphore>();
const _lastRequestAt = new Map<string, number>();

/**
 * 获取 AI API 默认配置（从环境变量加载）
 */
export function loadAiApiConfig(): AIAPIConfig {
  const baseUrl = process.env.AI_API_BASE_URL?.trim().replace(/\/$/, '') || process.env.OPENAI_BASE_URL?.trim().replace(/\/$/, '') || 'https://api.openai.com/v1';
  const apiKey = process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || '';
  
  const model = process.env.AI_API_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o';
  const imageModel = process.env.AI_API_IMAGE_MODEL?.trim() || model;
  const videoModel = process.env.AI_API_VIDEO_MODEL?.trim() || model;
  
  const timeout = parseInt(process.env.AI_API_TIMEOUT_MS || process.env.AI_API_TIMEOUT || '300000', 10);
  const maxConcurrency = parseInt(process.env.AI_API_MAX_CONCURRENCY || '50', 10);
  const minIntervalMs = parseInt(process.env.AI_API_MIN_INTERVAL_MS || '0', 10);

  if (!baseUrl) throw new AIAPIError('环境变量 AI_API_BASE_URL 不能为空');
  if (!apiKey) throw new AIAPIError('环境变量 AI_API_KEY 不能为空');
  if (!model) throw new AIAPIError('环境变量 AI_API_MODEL 不能为空');

  if (maxConcurrency < 1 || maxConcurrency > 50) {
    throw new AIAPIError(`环境变量 AI_API_MAX_CONCURRENCY 必须在 1~50 之间: ${maxConcurrency}`);
  }

  return { baseUrl, apiKey, model, imageModel, videoModel, timeout, maxConcurrency, minIntervalMs };
}

function encodeVideoImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    return encodeURI(decodeURI(trimmed));
  } catch {
    return encodeURI(trimmed);
  }
}

function normalizeVideoMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const nextMetadata: Record<string, unknown> = { ...metadata };
  const imageUrls: string[] = [];

  const rawImages = nextMetadata.images;
  if (Array.isArray(rawImages)) {
    for (const item of rawImages) {
      if (typeof item === 'string' && item.trim()) {
        imageUrls.push(item);
      }
    }
  }

  const rawImageList = nextMetadata.image_list;
  if (Array.isArray(rawImageList)) {
    for (const item of rawImageList) {
      if (
        item &&
        typeof item === 'object' &&
        'image_url' in item &&
        typeof item.image_url === 'string'
      ) {
        imageUrls.push(item.image_url);
      }
    }
  }

  delete nextMetadata.images;

  if (imageUrls.length > 0) {
    const dedupedUrls = [...new Set(imageUrls.map((url) => encodeVideoImageUrl(url)).filter(Boolean))];
    nextMetadata.image_list = dedupedUrls.map((imageUrl) => ({ image_url: imageUrl }));
  }

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
}

function getSemaphoreKey(config: AIAPIConfig): string {
  return `${config.baseUrl}|${config.apiKey}|${config.model}|${config.maxConcurrency}`;
}

function getSemaphore(config: AIAPIConfig): Semaphore {
  const key = getSemaphoreKey(config);
  if (!_semaphoreByKey.has(key)) {
    _semaphoreByKey.set(key, new Semaphore(config.maxConcurrency || 1));
  }
  return _semaphoreByKey.get(key)!;
}

/**
 * 确保两次请求间的最小间隔（速率限制）
 */
async function waitForInterval(config: AIAPIConfig): Promise<void> {
  const minIntervalMs = config.minIntervalMs || 1;
  if (minIntervalMs <= 0) return;

  const key = getSemaphoreKey(config);
  const now = Date.now();
  const last = _lastRequestAt.get(key) || 0;
  const elapsed = now - last;

  if (elapsed < minIntervalMs) {
    const delay = minIntervalMs - elapsed;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  _lastRequestAt.set(key, Date.now());
}

/**
 * 带有超时控制的 fetch
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal as AbortSignal,
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new AIAPIError(`请求超时 (${timeoutMs}ms)`);
    }
    throw error;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 调用 AI 聊天补全 API
 */
export async function callAiChatCompletion(
  messages: ChatMessage[],
  config?: AIAPIConfig,
  temperature: number = 0.7,
  maxTokens?: number,
  extraPayload?: Record<string, any>
): Promise<any> {
  const currentConfig = config || loadAiApiConfig();
  const semaphore = getSemaphore(currentConfig);

  await semaphore.acquire();
  try {
    await waitForInterval(currentConfig);

    const payload: any = {
      model: currentConfig.model,
      messages,
      temperature,
      ...extraPayload,
    };
    if (maxTokens !== undefined) {
      payload.maxTokens = maxTokens;
    }

    const response = await fetchWithTimeout(
      `${currentConfig.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentConfig.apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      currentConfig.timeout || 300000
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new AIAPIError(`AI API 请求失败: [${response.status}] ${errText}`);
    }

    return await response.json();
  } catch (error: any) {
    if (error instanceof AIAPIError) throw error;
    throw new AIAPIError(`AI API 请求失败: ${error.message}`);
  } finally {
    semaphore.release();
  }
}

/**
 * 从 Chat Completion 结果中提取内容
 */
export function extractFirstMessageContent(result: any): string {
  const choices = result?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AIAPIError('AI API 响应缺少 choices');
  }

  const message = choices[0]?.message;
  if (!message || typeof message !== 'object') {
    throw new AIAPIError('AI API 响应缺少 message');
  }

  const content = message.content;
  if (typeof content !== 'string') {
    throw new AIAPIError('AI API 响应缺少可用的 content');
  }

  return content;
}

/**
 * 调用 AI 图像生成 API
 * 注意：根据 Python 代码逻辑，这是通过 /chat/completions 接口来触发画图的（适用于某些中转 API）
 */
export async function callAiImageGeneration(
  prompt: string,
  config?: AIAPIConfig,
  n: number = 1,
  quality: string = 'standard',
  size: string = '1024x1024',
  responseFormat: string = 'url'
): Promise<any> {
  const currentConfig = config || loadAiApiConfig();
  
  // 构建聊天消息格式的图像生成请求
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ];

  // 这里为了复用 callAiChatCompletion，我们临时将 config 中的 model 替换为 imageModel
  const modifiedConfig = {
    ...currentConfig,
    model: currentConfig.imageModel || currentConfig.model
  };

  return callAiChatCompletion(messages, modifiedConfig);
}

/**
 * 调用 AI 图像生成 API 并将 Base64 结果上传到 Vercel Blob
 * 返回 Vercel Blob 的公开访问 URL
 */
export async function generateAndUploadImage(
  prompt: string,
  config?: AIAPIConfig,
  quality: string = 'standard',
  size: string = '1024x1024'
): Promise<string> {
  // 注意：如果底层是 chat completions 接口，它返回的可能是包含图片的 markdown 或 url
  // 这里我们提取文本内容
  const result = await callAiImageGeneration(prompt, config, 1, quality, size, 'b64_json');
  const content = extractFirstMessageContent(result);
  
  // 判断内容是否是 base64 (某些 API 可能直接返回 base64 文本，或者以 data:image/png;base64, 开头)
  // 或者像 gemini-3-pro-image-preview 那样返回 markdown 格式：![image](data:image/jpeg;base64,/9j/4AAQ...)
  let b64Data = content;
  let contentType = 'image/png'; // 默认
  
  // 匹配 markdown 格式的图片: ![alt](data:image/jpeg;base64,...)
  const markdownMatch = content.match(/!\[.*?\]\((data:image\/[^;]+;base64,([^)]+))\)/);
  if (markdownMatch) {
    const fullDataUri = markdownMatch[1];
    b64Data = markdownMatch[2];
    
    // 尝试提取真实的 Content-Type
    const mimeMatch = fullDataUri.match(/data:(image\/[^;]+);base64/);
    if (mimeMatch) {
      contentType = mimeMatch[1];
    }
  } else if (content.startsWith('data:image')) {
    // 处理直接返回 data:image/png;base64,... 的情况
    const parts = content.split(',');
    if (parts.length > 1) {
      b64Data = parts[1];
      const mimeMatch = parts[0].match(/data:(image\/[^;]+);base64/);
      if (mimeMatch) {
        contentType = mimeMatch[1];
      }
    }
  } else if (content.startsWith('http')) {
    // 如果返回的是 URL，我们需要先下载图片再转存到 Vercel Blob
    const imgResponse = await fetch(content);
    if (!imgResponse.ok) {
      throw new AIAPIError(`无法下载生成的图像: ${imgResponse.statusText}`);
    }
    const arrayBuffer = await imgResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `generated-images/img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.png`;
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'image/png',
    });
    return blob.url;
  }

  // 假设它是 base64 字符串
  try {
    const buffer = Buffer.from(b64Data, 'base64');
    // 根据 contentType 决定文件后缀
    const ext = contentType.split('/')[1] || 'png';
    const filename = `generated-images/img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: contentType,
    });
    return blob.url;
  } catch (error: any) {
    throw new AIAPIError(`上传图像到 Vercel Blob 失败: ${error.message}`);
  }
}

/**
 * 调用 AI 视频生成 API (异步任务)
 */
export async function callAiVideoGeneration(
  prompt: string,
  config?: AIAPIConfig,
  duration: number = 15,
  metadata?: Record<string, unknown>
): Promise<any> {
  const currentConfig = config || loadAiApiConfig();
  const semaphore = getSemaphore(currentConfig);

  await semaphore.acquire();
  try {
    await waitForInterval(currentConfig);

    const payload: any = {
      model: currentConfig.videoModel || currentConfig.model,
      prompt,
      duration,
    };
    const normalizedMetadata = normalizeVideoMetadata(metadata);
    if (normalizedMetadata) {
      payload.metadata = normalizedMetadata;
    }

    const response = await fetchWithTimeout(
      `${currentConfig.baseUrl}/video/generations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentConfig.apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      currentConfig.timeout || 300000
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new AIAPIError(`AI 视频生成请求失败: [${response.status}] ${errText}`);
    }

    return await response.json();
  } catch (error: any) {
    if (error instanceof AIAPIError) throw error;
    throw new AIAPIError(`AI 视频生成请求失败: ${error.message}`);
  } finally {
    semaphore.release();
  }
}

/**
 * 查询视频生成任务状态
 */
export async function getAiVideoStatus(
  videoId: string,
  config?: AIAPIConfig
): Promise<any> {
  const currentConfig = config || loadAiApiConfig();

  try {
    const response = await fetchWithTimeout(
      `${currentConfig.baseUrl}/video/generations/${videoId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${currentConfig.apiKey}`,
        },
      },
      currentConfig.timeout || 300000
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new AIAPIError(`查询视频状态失败: [${response.status}] ${errText}`);
    }

    return await response.json();
  } catch (error: any) {
    if (error instanceof AIAPIError) throw error;
    throw new AIAPIError(`查询视频状态失败: ${error.message}`);
  }
}

/**
 * 等待视频生成完成（轮询）
 */
export async function waitForVideoCompletion(
  videoId: string,
  config?: AIAPIConfig,
  initialPollIntervalMs: number = 10000, // 从 10 秒开始
  maxWaitTimeMs: number = 600000
): Promise<any> {
  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    try {
      const statusInfo = await getAiVideoStatus(videoId, config);
      const payload = statusInfo.data || statusInfo;
      const status = (payload.status || '').toLowerCase();

      if (['completed', 'succeeded', 'success'].includes(status)) {
        return statusInfo;
      } else if (['failed', 'error'].includes(status)) {
        throw new AIAPIError(`视频生成失败: ${JSON.stringify(statusInfo)}`);
      }
    } catch (e: any) {
      if (e instanceof AIAPIError && e.message.includes('失败')) {
        // 遇到状态失败抛出，但如果是网络或者其它偶发错误可以继续重试
        if (!e.message.includes('查询视频状态失败')) {
           throw e;
        }
      } else {
        throw e;
      }
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitTimeMs) {
      throw new AIAPIError(`视频生成超时（${maxWaitTimeMs / 1000}秒）`);
    }

    attempt++;
    // 指数退避：平均40s，起始 10s，每次1.5倍，最大 30s
    // 增加 0~2000ms 随机抖动(jitter)，避免与后端同步
    const baseDelay = Math.min(30000, initialPollIntervalMs * Math.pow(1.5, attempt - 1));
    const jitter = Math.random() * 2000;
    const currentPollIntervalMs = baseDelay + jitter;

    await new Promise((resolve) => setTimeout(resolve, currentPollIntervalMs));
  }
}
