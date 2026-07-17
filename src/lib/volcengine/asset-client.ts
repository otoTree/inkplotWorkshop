import crypto from 'node:crypto';
import { AIAPIError } from '../ai-server.ts';

export type VolcengineAssetType = 'Image' | 'Video' | 'Audio';
export type VolcengineAssetStatus = 'Active' | 'Processing' | 'Failed';

export type VolcengineAssetConfig = {
  region: string;
  baseUrl: string;
  version: string;
  projectName: string;
  groupId?: string;
  authMode: 'arts' | 'legacy';
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  host?: string;
};

export type VolcengineAssetResult = {
  Id: string;
  Name?: string;
  URL?: string;
  AssetType?: VolcengineAssetType;
  GroupId?: string;
  Status?: VolcengineAssetStatus;
  Error?: { Code?: string; Message?: string };
  ProjectName?: string;
};

const SERVICE = 'ark';
const DEFAULT_REGION = 'cn-beijing';
const DEFAULT_VERSION = '2024-01-01';
const DEFAULT_HOST = 'ark.cn-beijing.volcengineapi.com';
const DEFAULT_ARTS_BASE_URL = 'https://apis.artsapi.com/api/v3';
const DEFAULT_ASSET_TIMEOUT_MS = 45000;

const getFirstDefinedEnv = (...values: Array<string | undefined>) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const getAssetTimeoutMs = () => {
  const parsed = Number(process.env.ARTS_ASSET_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ASSET_TIMEOUT_MS;
};

const getAssetRequestAttempts = (action: string) => {
  if (action === 'GetAsset' || action === 'ListAssets') return 3;
  if (action === 'CreateAssetGroup') return 2;
  return 1;
};

const waitForRetry = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** attempt, 1000)));

const fetchAssetApi = async (url: string, init: RequestInit, action: string) => {
  const timeoutMs = getAssetTimeoutMs();
  const attempts = getAssetRequestAttempts(action);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const retryableStatus = [429, 502, 503, 504].includes(response.status);
      if (retryableStatus && attempt + 1 < attempts) {
        await response.body?.cancel().catch(() => undefined);
        await waitForRetry(attempt);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt + 1 < attempts) {
        await waitForRetry(attempt);
        continue;
      }
      if (controller.signal.aborted) {
        throw new AIAPIError(`火山素材库 ${action} 请求超时`, 504, `${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new AIAPIError(`火山素材库 ${action} 请求失败`, 502);
};

export const getVolcengineAssetProjectName = (override?: string | null) => {
  const gatewayConfigured = Boolean(
    getFirstDefinedEnv(process.env.ARTS_ASSET_BASE_URL, process.env.ARTS_API_BASE_URL)
  );
  const configured = getFirstDefinedEnv(
    process.env.ARTS_ASSET_PROJECT_NAME,
    process.env.VOLCENGINE_ASSET_PROJECT_NAME
  );
  const normalizedOverride = typeof override === 'string' ? override.trim() : '';

  // The Tezan gateway examples use ProjectName=tz. Migrate the old default
  // value for gateway requests while keeping legacy Volcengine behavior.
  if (normalizedOverride && !(gatewayConfigured && normalizedOverride === 'default')) {
    return normalizedOverride;
  }
  return configured || (gatewayConfigured ? 'tz' : 'default');
};

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key: crypto.BinaryLike, value: string) =>
  crypto.createHmac('sha256', key).update(value).digest();
const hmacHex = (key: crypto.BinaryLike, value: string) =>
  crypto.createHmac('sha256', key).update(value).digest('hex');

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getString = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === 'string' ? record[key] : undefined;

export const normalizeVolcengineAssetStatus = (
  status?: string | null
): VolcengineAssetStatus | undefined => {
  if (!status) return undefined;
  const normalized = status.toLowerCase();
  if (normalized === 'active') return 'Active';
  if (normalized === 'processing') return 'Processing';
  if (normalized === 'failed' || normalized === 'error') return 'Failed';
  return undefined;
};

const normalizeVolcengineAssetType = (assetType?: string | null): VolcengineAssetType | undefined => {
  if (!assetType) return undefined;
  const normalized = assetType.toLowerCase();
  if (normalized === 'image') return 'Image';
  if (normalized === 'video') return 'Video';
  if (normalized === 'audio') return 'Audio';
  return undefined;
};

const unwrapVolcengineAssetApiResult = (json: unknown) => {
  const record = asRecord(json);
  if (record.ResponseMetadata) {
    const responseError = asRecord(asRecord(record.ResponseMetadata).Error);
    if (Object.keys(responseError).length > 0) {
      throw new AIAPIError(
        '火山素材库返回错误',
        502,
        JSON.stringify(responseError)
      );
    }
  }

  return (
    record.Result ??
    record.result ??
    record.data ??
    record
  ) as Record<string, unknown>;
};

const normalizeVolcengineAssetError = (value: unknown) => {
  const error = asRecord(value);
  if (Object.keys(error).length === 0) return undefined;

  const code = getString(error, 'Code') || getString(error, 'code');
  const message = getString(error, 'Message') || getString(error, 'message');
  if (!code && !message) return error;

  return {
    ...(code ? { Code: code } : {}),
    ...(message ? { Message: message } : {}),
  };
};

const normalizeVolcengineAssetResult = (value: unknown): VolcengineAssetResult => {
  const record = asRecord(value);
  const id =
    getString(record, 'Id') ||
    getString(record, 'id') ||
    getString(record, 'AssetId') ||
    getString(record, 'asset_id');

  if (!id) {
    throw new AIAPIError('火山素材库返回缺少 Asset ID', 502, JSON.stringify(record));
  }

  return {
    Id: id,
    Name: getString(record, 'Name') || getString(record, 'name'),
    URL: getString(record, 'URL') || getString(record, 'url'),
    AssetType: normalizeVolcengineAssetType(
      getString(record, 'AssetType') || getString(record, 'asset_type')
    ),
    GroupId: getString(record, 'GroupId') || getString(record, 'group_id'),
    Status: normalizeVolcengineAssetStatus(
      getString(record, 'Status') || getString(record, 'status')
    ),
    Error: normalizeVolcengineAssetError(record.Error ?? record.error),
    ProjectName: getString(record, 'ProjectName') || getString(record, 'project_name'),
  };
};

const normalizeVolcengineAssetListResult = (value: unknown) => {
  const record = asRecord(value);
  const itemsRaw = Array.isArray(record.Items)
    ? record.Items
    : Array.isArray(record.items)
      ? record.items
      : [];

  return {
    Items: itemsRaw.map((item) => normalizeVolcengineAssetResult(item)),
    TotalCount:
      typeof record.TotalCount === 'number'
        ? record.TotalCount
        : typeof record.total_count === 'number'
          ? record.total_count
          : itemsRaw.length,
    PageNumber:
      typeof record.PageNumber === 'number'
        ? record.PageNumber
        : typeof record.page_number === 'number'
          ? record.page_number
          : 1,
    PageSize:
      typeof record.PageSize === 'number'
        ? record.PageSize
        : typeof record.page_size === 'number'
          ? record.page_size
          : itemsRaw.length,
  };
};

const assertPublicAssetUrl = (value: string) => {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new AIAPIError('火山素材库 CreateAsset 仅支持公网 URL', 400, value);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AIAPIError('火山素材库 CreateAsset 仅支持公网 URL', 400, value);
  }
};

export const getVolcengineAssetConfig = (): VolcengineAssetConfig => {
  const region = getFirstDefinedEnv(process.env.VOLCENGINE_ASSET_REGION) || DEFAULT_REGION;
  const projectName = getVolcengineAssetProjectName();
  const groupId =
    getFirstDefinedEnv(process.env.ARTS_ASSET_GROUP_ID, process.env.VOLCENGINE_ASSET_GROUP_ID) || undefined;
  const artsBaseUrl = getFirstDefinedEnv(
    process.env.ARTS_ASSET_BASE_URL,
    process.env.ARTS_API_BASE_URL
  );
  const artsApiKey = getFirstDefinedEnv(process.env.ARTS_API_KEY);

  if (artsBaseUrl || artsApiKey) {
    if (!artsApiKey) {
      throw new AIAPIError('ARTS_API_KEY 未配置，无法访问火山素材库', 500);
    }

    // Asset actions live directly at the configured root. Only Action and
    // Version are appended as query parameters by requestVolcengineAssetApi.
    const normalizedBaseUrl = (artsBaseUrl || DEFAULT_ARTS_BASE_URL).replace(/\/+$/, '');

    return {
      region,
      baseUrl: normalizedBaseUrl,
      version: DEFAULT_VERSION,
      projectName,
      groupId,
      authMode: 'arts',
      apiKey: artsApiKey,
    };
  }

  const accessKeyId = getFirstDefinedEnv(process.env.VOLCENGINE_ACCESS_KEY_ID);
  const secretAccessKey = getFirstDefinedEnv(process.env.VOLCENGINE_SECRET_ACCESS_KEY);

  if (!accessKeyId || !secretAccessKey) {
    throw new AIAPIError('火山素材库配置不完整，请配置 ARTS_API_BASE_URL/ARTS_API_KEY 或旧版 VOLCENGINE AK/SK', 500);
  }

  return {
    region,
    baseUrl: `https://${DEFAULT_HOST}`,
    version: DEFAULT_VERSION,
    projectName,
    groupId,
    authMode: 'legacy',
    accessKeyId,
    secretAccessKey,
    host: DEFAULT_HOST,
  };
};

export const buildVolcengineAssetHeaders = ({
  action,
  bodyJson,
  config,
  now = new Date(),
}: {
  action: string;
  bodyJson: string;
  config: VolcengineAssetConfig;
  now?: Date;
}) => {
  if (!config.secretAccessKey || !config.accessKeyId || !config.host) {
    throw new AIAPIError('火山素材库 legacy 签名配置不完整', 500);
  }

  const xDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = xDate.slice(0, 8);
  const contentHash = sha256Hex(bodyJson);
  const canonicalQueryString = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(config.version)}`;
  const canonicalHeaders = [
    'content-type:application/json',
    `host:${config.host}`,
    `x-content-sha256:${contentHash}`,
    `x-date:${xDate}`,
  ].join('\n');
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequest = [
    'POST',
    '/',
    canonicalQueryString,
    canonicalHeaders,
    '',
    signedHeaders,
    contentHash,
  ].join('\n');
  const credentialScope = `${shortDate}/${config.region}/${SERVICE}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(config.secretAccessKey, shortDate);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'request');
  const signature = hmacHex(kSigning, stringToSign);

  return {
    'Content-Type': 'application/json',
    Host: config.host,
    'X-Date': xDate,
    'X-Content-Sha256': contentHash,
    Authorization:
      `HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
};

export const requestVolcengineAssetApi = async <T>(
  action: string,
  body: Record<string, unknown>,
  config: VolcengineAssetConfig = getVolcengineAssetConfig()
): Promise<T> => {
  const bodyJson = JSON.stringify(body);
  const headers =
    config.authMode === 'arts'
      ? {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        }
      : buildVolcengineAssetHeaders({ action, bodyJson, config });
  const url = `${config.baseUrl}?Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(config.version)}`;
  const response = await fetchAssetApi(url, {
    method: 'POST',
    headers,
    body: bodyJson,
  }, action);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AIAPIError(`火山素材库 ${action} 请求失败`, response.status, detail);
  }

  const json = await response.json();
  return unwrapVolcengineAssetApiResult(json) as T;
};

export const createAssetGroup = (input: {
  Name: string;
  Description?: string;
  GroupType?: 'AIGC';
  ProjectName?: string;
}, config?: VolcengineAssetConfig) => requestVolcengineAssetApi<{ Id: string }>('CreateAssetGroup', input, config);

export const createAsset = (input: {
  GroupId: string;
  URL: string;
  Name?: string;
  AssetType: VolcengineAssetType;
  ProjectName?: string;
}, config?: VolcengineAssetConfig) => {
  assertPublicAssetUrl(input.URL);
  return requestVolcengineAssetApi<Record<string, unknown>>('CreateAsset', input, config).then((result) =>
    normalizeVolcengineAssetResult(result)
  );
};

export const getAsset = (input: { Id: string; ProjectName?: string }, config?: VolcengineAssetConfig) =>
  requestVolcengineAssetApi<Record<string, unknown>>('GetAsset', input, config).then((result) =>
    normalizeVolcengineAssetResult(result)
  );

export const listAssets = (input: {
  Filter: Record<string, unknown>;
  PageNumber: number;
  PageSize: number;
  SortBy?: string;
  SortOrder?: string;
  ProjectName?: string;
}, config?: VolcengineAssetConfig) =>
  requestVolcengineAssetApi<Record<string, unknown>>(
    'ListAssets',
    input,
    config
  ).then((result) =>
    normalizeVolcengineAssetListResult(result) as {
    Items: VolcengineAssetResult[];
    TotalCount: number;
    PageNumber: number;
    PageSize: number;
    }
  );
