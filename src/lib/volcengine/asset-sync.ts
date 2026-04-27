import { createAsset, getAsset, type VolcengineAssetStatus } from './asset-client.ts';

export type VolcengineVideoSettings = {
  syncAssetsToPrivateLibrary?: boolean;
  assetGroupId?: string;
  projectName?: string;
  preferredVideoModel?: 'seedance-2.0' | 'legacy';
};

export type LocalReferenceAsset = {
  id?: string;
  name?: string | null;
  type?: string | null;
  imageUrl?: string | null;
  volcengineAssetId?: string | null;
  volcengineAssetStatus?: string | null;
  volcengineAssetGroupId?: string | null;
  volcengineAssetProjectName?: string | null;
  volcengineAssetType?: string | null;
};

export type ResolvedReferenceAsset = LocalReferenceAsset & {
  sourceUrl?: string;
  volcengineAssetUri?: string;
  usableUrl: string;
  contentType: 'image_url';
  role: 'reference_image';
  mode: 'asset_uri' | 'url';
};

type AssetPersistence = {
  updateAsset?: (assetId: string, updates: Record<string, unknown>) => Promise<void>;
};

const toAssetUri = (assetId: string) => `asset://${assetId}`;

const getAssetType = (): 'Image' => {
  return 'Image';
};

const persistAssetState = async (
  asset: LocalReferenceAsset,
  persistence: AssetPersistence | undefined,
  updates: Record<string, unknown>
) => {
  if (!asset.id || !persistence?.updateAsset) return;
  await persistence.updateAsset(asset.id, {
    ...updates,
    volcengine_asset_synced_at: new Date().toISOString(),
  });
};

const toResolvedUrl = (asset: LocalReferenceAsset): ResolvedReferenceAsset | null => {
  if (!asset.imageUrl) return null;
  return {
    ...asset,
    sourceUrl: asset.imageUrl,
    usableUrl: asset.imageUrl,
    contentType: 'image_url',
    role: 'reference_image',
    mode: 'url',
  };
};

const toResolvedAssetUri = (
  asset: LocalReferenceAsset,
  assetId: string
): ResolvedReferenceAsset | null => {
  if (!asset.imageUrl) return null;
  const assetUri = toAssetUri(assetId);
  return {
    ...asset,
    sourceUrl: asset.imageUrl,
    volcengineAssetId: assetId,
    volcengineAssetUri: assetUri,
    usableUrl: assetUri,
    contentType: 'image_url',
    role: 'reference_image',
    mode: 'asset_uri',
  };
};

const normalizeStatus = (status?: string | null): VolcengineAssetStatus | null => {
  if (status === 'Active' || status === 'Processing' || status === 'Failed') return status;
  return null;
};

const resolveActiveOrFallback = (
  asset: LocalReferenceAsset,
  status: string | undefined | null,
  assetId: string | undefined | null
) => {
  if (assetId && normalizeStatus(status) === 'Active') {
    return toResolvedAssetUri(asset, assetId);
  }
  return toResolvedUrl(asset);
};

export const resolveVolcengineReferenceAssets = async ({
  references,
  settings,
  persistence,
}: {
  references: LocalReferenceAsset[];
  settings?: VolcengineVideoSettings | null;
  persistence?: AssetPersistence;
}): Promise<{
  references: ResolvedReferenceAsset[];
  requestContentMode: 'asset_uri' | 'url';
  referenceAssetIds: string[];
}> => {
  const syncEnabled = !!settings?.syncAssetsToPrivateLibrary;
  const projectName = settings?.projectName || process.env.VOLCENGINE_ASSET_PROJECT_NAME || 'default';
  const groupId = settings?.assetGroupId || process.env.VOLCENGINE_ASSET_GROUP_ID || '';
  const resolved: ResolvedReferenceAsset[] = [];
  const needsUpload = references.some(
    (asset) =>
      asset.imageUrl &&
      !(asset.volcengineAssetId && normalizeStatus(asset.volcengineAssetStatus) === 'Active')
  );

  if (syncEnabled && needsUpload && !groupId) {
    throw new Error('火山素材库 Asset Group ID 未配置，无法同步参考素材');
  }

  for (const asset of references) {
    if (!asset.imageUrl) continue;
    if (!syncEnabled) {
      const fallback = toResolvedUrl(asset);
      if (fallback) resolved.push(fallback);
      continue;
    }

    if (asset.volcengineAssetId && normalizeStatus(asset.volcengineAssetStatus) === 'Active') {
      const active = toResolvedAssetUri(asset, asset.volcengineAssetId);
      if (active) resolved.push(active);
      continue;
    }

    if (asset.volcengineAssetId) {
      try {
        const remote = await getAsset({
          Id: asset.volcengineAssetId,
          ProjectName: projectName,
        });
        await persistAssetState(asset, persistence, {
          volcengine_asset_id: remote.Id,
          volcengine_asset_status: remote.Status,
          volcengine_asset_group_id: remote.GroupId || asset.volcengineAssetGroupId || groupId,
          volcengine_asset_project_name: remote.ProjectName || projectName,
          volcengine_asset_type: remote.AssetType || getAssetType(),
          volcengine_asset_error: remote.Error || null,
        });
        const next = resolveActiveOrFallback(asset, remote.Status, remote.Id);
        if (next) resolved.push(next);
        continue;
      } catch (error) {
        await persistAssetState(asset, persistence, {
          volcengine_asset_error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        const fallback = toResolvedUrl(asset);
        if (fallback) resolved.push(fallback);
        continue;
      }
    }

    try {
      const created = await createAsset({
        GroupId: groupId,
        URL: asset.imageUrl,
        Name: (asset.name || 'Reference asset').slice(0, 64),
        AssetType: getAssetType(),
        ProjectName: projectName,
      });
      await persistAssetState(asset, persistence, {
        volcengine_asset_id: created.Id,
        volcengine_asset_status: 'Processing',
        volcengine_asset_group_id: groupId,
        volcengine_asset_project_name: projectName,
        volcengine_asset_type: getAssetType(),
        volcengine_asset_error: null,
      });
      const fallback = toResolvedUrl({
        ...asset,
        volcengineAssetId: created.Id,
        volcengineAssetStatus: 'Processing',
      });
      if (fallback) resolved.push(fallback);
    } catch (error) {
      await persistAssetState(asset, persistence, {
        volcengine_asset_status: 'Failed',
        volcengine_asset_error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      const fallback = toResolvedUrl(asset);
      if (fallback) resolved.push(fallback);
    }
  }

  const referenceAssetIds = resolved
    .filter((asset) => asset.mode === 'asset_uri' && asset.volcengineAssetId)
    .map((asset) => asset.volcengineAssetId!);

  return {
    references: resolved,
    requestContentMode: resolved.some((asset) => asset.mode === 'asset_uri') ? 'asset_uri' : 'url',
    referenceAssetIds,
  };
};

const getOptionalString = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const mapVolcengineAssetRow = (asset: Record<string, unknown>): LocalReferenceAsset => ({
  id: getOptionalString(asset.id),
  name: getOptionalString(asset.name),
  type: getOptionalString(asset.type),
  imageUrl: getOptionalString(asset.image_url),
  volcengineAssetId: getOptionalString(asset.volcengine_asset_id),
  volcengineAssetStatus: getOptionalString(asset.volcengine_asset_status),
  volcengineAssetGroupId: getOptionalString(asset.volcengine_asset_group_id),
  volcengineAssetProjectName: getOptionalString(asset.volcengine_asset_project_name),
  volcengineAssetType: getOptionalString(asset.volcengine_asset_type),
});
