import crypto from 'node:crypto';
import { AIAPIError } from '../ai-server.ts';

export type VolcengineAssetType = 'Image' | 'Video' | 'Audio';
export type VolcengineAssetStatus = 'Active' | 'Processing' | 'Failed';

export type VolcengineAssetConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  host: string;
  version: string;
  projectName: string;
  groupId?: string;
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

const getFirstDefinedEnv = (...values: Array<string | undefined>) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key: crypto.BinaryLike, value: string) =>
  crypto.createHmac('sha256', key).update(value).digest();
const hmacHex = (key: crypto.BinaryLike, value: string) =>
  crypto.createHmac('sha256', key).update(value).digest('hex');

export const getVolcengineAssetConfig = (): VolcengineAssetConfig => {
  const accessKeyId = getFirstDefinedEnv(process.env.VOLCENGINE_ACCESS_KEY_ID);
  const secretAccessKey = getFirstDefinedEnv(process.env.VOLCENGINE_SECRET_ACCESS_KEY);
  const region = getFirstDefinedEnv(process.env.VOLCENGINE_ASSET_REGION) || DEFAULT_REGION;
  const projectName = getFirstDefinedEnv(process.env.VOLCENGINE_ASSET_PROJECT_NAME) || 'default';
  const groupId = getFirstDefinedEnv(process.env.VOLCENGINE_ASSET_GROUP_ID) || undefined;

  if (!accessKeyId || !secretAccessKey) {
    throw new AIAPIError('火山素材库 AK/SK 配置不完整', 500);
  }

  return {
    accessKeyId,
    secretAccessKey,
    region,
    host: DEFAULT_HOST,
    version: DEFAULT_VERSION,
    projectName,
    groupId,
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
  const headers = buildVolcengineAssetHeaders({ action, bodyJson, config });
  const url = `https://${config.host}/?Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(config.version)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyJson,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AIAPIError(`火山素材库 ${action} 请求失败`, response.status, detail);
  }

  const json = await response.json();
  if (json.ResponseMetadata?.Error) {
    throw new AIAPIError(
      `火山素材库 ${action} 返回错误`,
      502,
      JSON.stringify(json.ResponseMetadata.Error)
    );
  }
  return json.Result as T;
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
}, config?: VolcengineAssetConfig) => requestVolcengineAssetApi<{ Id: string }>('CreateAsset', input, config);

export const getAsset = (input: { Id: string; ProjectName?: string }, config?: VolcengineAssetConfig) =>
  requestVolcengineAssetApi<VolcengineAssetResult>('GetAsset', input, config);

export const listAssets = (input: {
  Filter: Record<string, unknown>;
  PageNumber: number;
  PageSize: number;
  SortBy?: string;
  SortOrder?: string;
  ProjectName?: string;
}, config?: VolcengineAssetConfig) =>
  requestVolcengineAssetApi<{
    Items: VolcengineAssetResult[];
    TotalCount: number;
    PageNumber: number;
    PageSize: number;
  }>('ListAssets', input, config);
