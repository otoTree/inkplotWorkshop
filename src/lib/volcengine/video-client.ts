import { AIAPIError } from '../ai-server.ts';
import type { Seedance2VideoPayload } from './video-payload.ts';

export type VolcengineVideoConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export type VolcengineMappedTaskStatus = 'processing' | 'completed' | 'failed';
type JsonRecord = Record<string, unknown>;

const getFirstDefinedEnv = (...values: Array<string | undefined>) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const toTimeoutMs = (value: string | undefined) => {
  if (!value) return 300000;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 300000;
  if (parsed <= 1000) return Math.round(parsed * 1000);
  return Math.round(parsed);
};

export const getVolcengineVideoConfig = (): VolcengineVideoConfig => {
  const baseUrl = (
    getFirstDefinedEnv(process.env.VOLCENGINE_ARK_VIDEO_BASE_URL) ||
    'https://ark.cn-beijing.volces.com/api/v3'
  ).replace(/\/+$/, '');
  const apiKey = getFirstDefinedEnv(
    process.env.VOLCENGINE_ARK_VIDEO_API_KEY,
    process.env.ARK_API_KEY
  );
  const model = getFirstDefinedEnv(
    process.env.VOLCENGINE_ARK_VIDEO_MODEL,
    process.env.AI_API_VIDEO_MODEL
  );
  const timeoutMs = toTimeoutMs(
    getFirstDefinedEnv(process.env.VOLCENGINE_ARK_VIDEO_TIMEOUT_MS, process.env.AI_API_TIMEOUT_MS)
  );

  if (!apiKey || !model) {
    throw new AIAPIError('火山 Seedance 2.0 视频生成配置不完整', 500);
  }

  return { baseUrl, apiKey, model, timeoutMs };
};

export const isSeedance2Model = (model?: string | null) =>
  typeof model === 'string' && /seedance[-_]?2|seedance-2|2-0/i.test(model);

export const mapVolcengineTaskStatus = (status: string): VolcengineMappedTaskStatus => {
  const normalized = status.toLowerCase();
  if (['succeeded', 'completed', 'success'].includes(normalized)) return 'completed';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  return 'processing';
};

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' ? (value as JsonRecord) : {};

const getString = (record: JsonRecord, key: string) =>
  typeof record[key] === 'string' ? record[key] : null;

export const extractVolcengineVideoUrl = (result: unknown): string | null => {
  const root = asRecord(result);
  const content = asRecord(root.content);
  const data = asRecord(root.data);
  const dataContent = asRecord(data.content);

  return (
    getString(content, 'video_url') ||
    getString(root, 'video_url') ||
    getString(root, 'url') ||
    getString(dataContent, 'video_url') ||
    getString(data, 'video_url') ||
    getString(data, 'url')
  );
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

export const createSeedance2VideoTask = async (
  payload: Seedance2VideoPayload,
  config: VolcengineVideoConfig = getVolcengineVideoConfig()
) => {
  const response = await fetchWithTimeout(
    `${config.baseUrl}/contents/generations/tasks`,
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
    throw new AIAPIError('火山 Seedance 2.0 视频生成请求失败', response.status, detail);
  }

  return await response.json();
};

export const getSeedance2VideoTask = async (
  taskId: string,
  config: VolcengineVideoConfig = getVolcengineVideoConfig()
) => {
  const response = await fetchWithTimeout(
    `${config.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    config.timeoutMs
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AIAPIError('查询火山 Seedance 2.0 视频状态失败', response.status, detail);
  }

  return await response.json();
};

export const extractVolcengineTaskId = (result: unknown): string | null => {
  const root = asRecord(result);
  const data = asRecord(root.data);
  return getString(root, 'id') || getString(root, 'task_id') || getString(data, 'id') || getString(data, 'task_id');
};
