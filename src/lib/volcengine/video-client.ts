import { AIAPIError } from '../ai-server.ts';
import { normalizeVideoGenerationError } from '../video-generation-error.ts';
import {
  DEFAULT_SEEDANCE_2_RESOLUTION,
  type Seedance2Resolution,
  type Seedance2VideoPayload,
} from './video-payload.ts';

export type VolcengineVideoConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  apiStyle?: 'ark' | 'gateway';
};

export type VolcengineMappedTaskStatus = 'processing' | 'completed' | 'failed';
type JsonRecord = Record<string, unknown>;
export type VolcengineVideoGenerationMetadata = {
  provider?: 'volcengine' | string;
  model?: string;
  requestContentMode?: 'asset_uri' | 'url';
  referenceAssetIds?: string[];
  aspectRatio?: '9:16' | '16:9';
  resolution?: Seedance2Resolution | '720p';
  rawStatus?: string;
  usage?: Record<string, unknown>;
  error?: Record<string, unknown> | string | null;
};
export type VolcengineTaskSnapshot = {
  rawStatus: string;
  videoStatus: VolcengineMappedTaskStatus;
  videoUrl: string | null;
  usage?: Record<string, unknown>;
  error?: Record<string, unknown> | string | null;
};

const getFirstDefinedEnv = (...values: Array<string | undefined>) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const normalizeVideoBaseUrl = (value: string) => {
  const trimmed = value.replace(/\/+$/, '');
  if (/\/api\/v\d+$/i.test(trimmed)) return trimmed;
  if (/\/api$/i.test(trimmed)) return `${trimmed}/v3`;
  return `${trimmed}/api/v3`;
};

const toTimeoutMs = (value: string | undefined) => {
  if (!value) return 300000;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 300000;
  if (parsed <= 1000) return Math.round(parsed * 1000);
  return Math.round(parsed);
};

export const getVolcengineVideoConfig = (
  modelOverride?: string | null
): VolcengineVideoConfig => {
  const gatewayBaseUrl = getFirstDefinedEnv(
    process.env.ARTS_VIDEO_BASE_URL,
    process.env.ARTS_API_BASE_URL
  );
  const baseUrl = gatewayBaseUrl
    ? gatewayBaseUrl.replace(/\/+$/, '')
    : normalizeVideoBaseUrl(
        getFirstDefinedEnv(
          process.env.VOLCENGINE_ARK_VIDEO_BASE_URL,
          process.env.ARK_BASE_URL
        ) || 'https://ark.cn-beijing.volces.com/api/v3'
      );
  const apiKey = getFirstDefinedEnv(
    process.env.ARTS_API_KEY,
    process.env.VOLCENGINE_ARK_VIDEO_API_KEY,
    process.env.ARK_API_KEY
  );
  const model = getConfiguredVolcengineVideoModel(modelOverride);
  const timeoutMs = toTimeoutMs(
    getFirstDefinedEnv(process.env.VOLCENGINE_ARK_VIDEO_TIMEOUT_MS, process.env.AI_API_TIMEOUT_MS)
  );

  if (!apiKey || !model) {
    throw new AIAPIError('火山 Seedance 2.0 视频生成配置不完整', 500);
  }

  return { baseUrl, apiKey, model, timeoutMs, apiStyle: gatewayBaseUrl ? 'gateway' : 'ark' };
};

export const isSeedance2Model = (model?: string | null) =>
  typeof model === 'string' &&
  (/seedance[-_]?2|seedance-2|2-0/i.test(model) || model.trim().toLowerCase() === 'intsd2-x');

export const getConfiguredVolcengineVideoModel = (modelOverride?: string | null) => {
  const normalizedOverride =
    typeof modelOverride === 'string' && modelOverride.trim() ? modelOverride.trim() : '';
  if (isSeedance2Model(normalizedOverride)) return normalizedOverride;

  return (
    getFirstDefinedEnv(
      process.env.ARTS_VIDEO_MODEL,
      process.env.VOLCENGINE_ARK_VIDEO_MODEL,
      process.env.ARK_VIDEO_MODEL
    ) ||
    (() => {
      const fallbackModel = getFirstDefinedEnv(process.env.AI_API_VIDEO_MODEL);
      return isSeedance2Model(fallbackModel) ? fallbackModel : '';
    })()
  );
};

export const mapVolcengineTaskStatus = (status: string): VolcengineMappedTaskStatus => {
  const normalized = status.toLowerCase();
  if (['succeeded', 'completed', 'success'].includes(normalized)) return 'completed';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  return 'processing';
};

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' ? (value as JsonRecord) : {};

const getOptionalRecord = (value: unknown): JsonRecord | undefined => {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : undefined;
};

const getOptionalError = (value: unknown): Record<string, unknown> | string | null => {
  const normalized = normalizeVideoGenerationError(value);
  if (!normalized) return null;
  if (typeof normalized === 'string') return normalized;
  return Object.keys(normalized).length > 0 ? normalized : null;
};

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

export const getVolcengineTaskSnapshot = (result: unknown): VolcengineTaskSnapshot => {
  const root = asRecord(result);
  const data = asRecord(root.data);
  const statusInfo = getString(data, 'status') ? data : root;
  const rawStatus = (getString(statusInfo, 'status') || '').toLowerCase();

  return {
    rawStatus,
    videoStatus: mapVolcengineTaskStatus(rawStatus),
    videoUrl: extractVolcengineVideoUrl(result),
    usage: getOptionalRecord(statusInfo.usage) || getOptionalRecord(root.usage),
    error:
      getOptionalError(statusInfo.error) ||
      getOptionalError(statusInfo.Error) ||
      getOptionalError(statusInfo.last_error) ||
      getOptionalError(statusInfo.failure_reason) ||
      getOptionalError(root.error) ||
      getOptionalError(root.Error) ||
      null,
  };
};

export const buildVolcengineSubmissionMetadata = ({
  model,
  requestContentMode,
  referenceAssetIds,
  aspectRatio,
  resolution,
  result,
}: {
  model: string;
  requestContentMode: 'asset_uri' | 'url';
  referenceAssetIds: string[];
  aspectRatio: '9:16' | '16:9';
  resolution: Seedance2Resolution;
  result: unknown;
}): VolcengineVideoGenerationMetadata => {
  const snapshot = getVolcengineTaskSnapshot(result);

  return {
    provider: 'volcengine',
    model,
    requestContentMode,
    referenceAssetIds,
    aspectRatio,
    resolution,
    rawStatus: snapshot.rawStatus || 'processing',
    usage: snapshot.usage,
    ...(snapshot.error ? { error: snapshot.error } : {}),
  };
};

export const mergeVolcengineTaskMetadata = (
  metadata: VolcengineVideoGenerationMetadata | null | undefined,
  result: unknown
): VolcengineVideoGenerationMetadata => {
  const snapshot = getVolcengineTaskSnapshot(result);

  return {
    ...(metadata || {}),
    provider: 'volcengine',
    rawStatus: snapshot.rawStatus || metadata?.rawStatus || 'processing',
    usage: snapshot.usage || metadata?.usage,
    ...(snapshot.videoStatus === 'failed'
      ? { error: snapshot.error || metadata?.error || null }
      : snapshot.videoStatus === 'completed'
        ? { error: null }
        : {}),
  };
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
  const path =
    config.apiStyle === 'gateway' ? '/v1/videos/generations' : '/contents/generations/tasks';
  const response = await fetchWithTimeout(
    `${config.baseUrl}${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        ...payload,
        resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
      }),
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
  const path =
    config.apiStyle === 'gateway'
      ? `/v1/tasks/${encodeURIComponent(taskId)}`
      : `/contents/generations/tasks/${encodeURIComponent(taskId)}`;
  const response = await fetchWithTimeout(
    `${config.baseUrl}${path}`,
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
