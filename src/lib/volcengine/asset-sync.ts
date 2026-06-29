import {
  createAsset,
  createAssetGroup,
  getAsset,
  normalizeVolcengineAssetStatus,
  type VolcengineAssetResult,
  type VolcengineAssetStatus,
} from './asset-client.ts';

export type VolcengineVideoSettings = {
  syncAssetsToPrivateLibrary?: boolean;
  assetGroupId?: string;
  projectName?: string;
  model?: 'legacy' | 'doubao-seedance-2-0-260128';
  preferredVideoModel?: 'seedance-2.0' | 'legacy';
  aspectRatio?: '9:16' | '16:9';
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
  updateProjectVideoSettings?: (updates: Partial<VolcengineVideoSettings>) => Promise<void>;
};

type AssetClient = {
  createAsset?: typeof createAsset;
  createAssetGroup?: typeof createAssetGroup;
  getAsset?: typeof getAsset;
};

export type PendingReferenceAsset = LocalReferenceAsset & {
  reason: 'processing' | 'failed' | 'missing-source';
  blockingAssetId?: string;
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
  return normalizeVolcengineAssetStatus(status) || null;
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
  client,
  forceCreateAssetGroup = false,
}: {
  references: LocalReferenceAsset[];
  settings?: VolcengineVideoSettings | null;
  persistence?: AssetPersistence;
  client?: AssetClient;
  forceCreateAssetGroup?: boolean;
}): Promise<{
  references: ResolvedReferenceAsset[];
  requestContentMode: 'asset_uri' | 'url';
  referenceAssetIds: string[];
  requiresAssetReadiness: boolean;
  pendingAssets: PendingReferenceAsset[];
  assetGroupId?: string;
}> => {
  const assetClient = {
    createAsset: client?.createAsset || createAsset,
    createAssetGroup: client?.createAssetGroup || createAssetGroup,
    getAsset: client?.getAsset || getAsset,
  };
  const syncEnabled = !!settings?.syncAssetsToPrivateLibrary;
  const projectName =
    settings?.projectName ||
    process.env.ARTS_ASSET_PROJECT_NAME ||
    process.env.VOLCENGINE_ASSET_PROJECT_NAME ||
    'default';
  const groupId =
    settings?.assetGroupId ||
    process.env.ARTS_ASSET_GROUP_ID ||
    process.env.VOLCENGINE_ASSET_GROUP_ID ||
    '';
  const resolved: ResolvedReferenceAsset[] = [];
  const pendingAssets: PendingReferenceAsset[] = [];
  const needsUpload = references.some(
    (asset) =>
      asset.imageUrl &&
      !(asset.volcengineAssetId && normalizeStatus(asset.volcengineAssetStatus) === 'Active')
  );
  let effectiveGroupId = groupId;

  if (syncEnabled && needsUpload && (!effectiveGroupId || forceCreateAssetGroup)) {
    const createdGroup = await assetClient.createAssetGroup({
      Name: `project-${projectName}-assets`.slice(0, 128),
      Description: `Assets for project ${projectName}`.slice(0, 256),
      GroupType: 'AIGC',
      ProjectName: projectName,
    });
    effectiveGroupId = createdGroup.Id;
    await persistence?.updateProjectVideoSettings?.({
      ...settings,
      syncAssetsToPrivateLibrary: true,
      projectName,
      assetGroupId: effectiveGroupId,
    });
  }

  for (const asset of references) {
    if (!asset.imageUrl) {
      if (syncEnabled) {
        pendingAssets.push({
          ...asset,
          reason: 'missing-source',
        });
      }
      continue;
    }
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
        const remote = await assetClient.getAsset({
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
        if (normalizeStatus(remote.Status) !== 'Active') {
          pendingAssets.push({
            ...asset,
            volcengineAssetId: remote.Id,
            volcengineAssetStatus: remote.Status || asset.volcengineAssetStatus,
            reason: normalizeStatus(remote.Status) === 'Failed' ? 'failed' : 'processing',
            blockingAssetId: remote.Id,
          });
        }
        continue;
      } catch (error) {
        const details =
          error instanceof Error && 'details' in error
            ? (error as Error & { details?: unknown }).details
            : null;
        const remoteError =
          details && typeof details === 'string'
            ? (() => {
                try {
                  return JSON.parse(details) as VolcengineAssetResult['Error'];
                } catch {
                  return { Message: details };
                }
              })()
            : null;

        await persistAssetState(asset, persistence, {
          volcengine_asset_error:
            remoteError ||
            {
              Message: error instanceof Error ? error.message : String(error),
            },
        });
        const fallback = toResolvedUrl(asset);
        if (fallback) resolved.push(fallback);
        pendingAssets.push({
          ...asset,
          reason: 'failed',
          blockingAssetId: asset.volcengineAssetId || undefined,
        });
        continue;
      }
    }

    try {
      const created = await assetClient.createAsset({
        GroupId: effectiveGroupId,
        URL: asset.imageUrl,
        Name: (asset.name || 'Reference asset').slice(0, 64),
        AssetType: getAssetType(),
        ProjectName: projectName,
      });
      const createdStatus = normalizeStatus(created.Status) || 'Processing';
      await persistAssetState(asset, persistence, {
        volcengine_asset_id: created.Id,
        volcengine_asset_status: createdStatus,
        volcengine_asset_group_id: created.GroupId || effectiveGroupId,
        volcengine_asset_project_name: created.ProjectName || projectName,
        volcengine_asset_type: created.AssetType || getAssetType(),
        volcengine_asset_error: created.Error || null,
      });
      const createdReference: LocalReferenceAsset = {
        ...asset,
        volcengineAssetId: created.Id,
        volcengineAssetStatus: createdStatus,
      };
      const next =
        createdStatus === 'Active'
          ? toResolvedAssetUri(createdReference, created.Id)
          : toResolvedUrl(createdReference);
      if (next) resolved.push(next);
      if (createdStatus !== 'Active') {
        pendingAssets.push({
          ...createdReference,
          reason: createdStatus === 'Failed' ? 'failed' : 'processing',
          blockingAssetId: created.Id,
        });
      }
    } catch (error) {
      const details =
        error instanceof Error && 'details' in error
          ? (error as Error & { details?: unknown }).details
          : null;
      const remoteError =
        details && typeof details === 'string'
          ? (() => {
              try {
                return JSON.parse(details) as VolcengineAssetResult['Error'];
              } catch {
                return { Message: details };
              }
            })()
          : null;

      await persistAssetState(asset, persistence, {
        volcengine_asset_status: 'Failed',
        volcengine_asset_error:
          remoteError ||
          {
            Message: error instanceof Error ? error.message : String(error),
          },
      });
      const fallback = toResolvedUrl(asset);
      if (fallback) resolved.push(fallback);
      pendingAssets.push({
        ...asset,
        reason: 'failed',
      });
    }
  }

  const referenceAssetIds = resolved
    .filter((asset) => asset.mode === 'asset_uri' && asset.volcengineAssetId)
    .map((asset) => asset.volcengineAssetId!);
  const requestContentMode = resolved.some((asset) => asset.mode === 'asset_uri') ? 'asset_uri' : 'url';

  return {
    references: resolved,
    requestContentMode,
    referenceAssetIds,
    requiresAssetReadiness: syncEnabled && pendingAssets.length > 0,
    pendingAssets,
    assetGroupId: effectiveGroupId || undefined,
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
