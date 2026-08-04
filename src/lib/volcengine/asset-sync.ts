import type { ProjectVideoModelSelection } from './video-compat.ts';

export type VolcengineVideoSettings = {
  syncAssetsToPrivateLibrary?: boolean;
  assetGroupId?: string;
  projectName?: string;
  model?: ProjectVideoModelSelection;
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
  sourceUrl: string;
  usableUrl: string;
  contentType: 'image_url';
  role: 'reference_image';
  mode: 'url';
};

type AssetPersistence = {
  updateAsset?: (assetId: string, updates: Record<string, unknown>) => Promise<void>;
  updateProjectVideoSettings?: (updates: Partial<VolcengineVideoSettings>) => Promise<void>;
};

type AssetClient = Record<string, unknown>;

export type PendingReferenceAsset = LocalReferenceAsset & {
  reason: 'processing' | 'failed' | 'missing-source';
  blockingAssetId?: string;
};

/**
 * Model requests always use the persisted object-storage URL. Legacy asset
 * library arguments remain accepted so old callers and settings stay readable.
 */
export const resolveVolcengineReferenceAssets = async ({
  references,
  settings,
}: {
  references: LocalReferenceAsset[];
  settings?: VolcengineVideoSettings | null;
  persistence?: AssetPersistence;
  client?: AssetClient;
  forceCreateAssetGroup?: boolean;
  preferSourceUrls?: boolean;
}): Promise<{
  references: ResolvedReferenceAsset[];
  requestContentMode: 'url';
  referenceAssetIds: [];
  requiresAssetReadiness: false;
  pendingAssets: [];
  assetGroupId?: string;
}> => ({
  references: references.flatMap((asset) =>
    asset.imageUrl
      ? [
          {
            ...asset,
            sourceUrl: asset.imageUrl,
            usableUrl: asset.imageUrl,
            contentType: 'image_url' as const,
            role: 'reference_image' as const,
            mode: 'url' as const,
          },
        ]
      : []
  ),
  requestContentMode: 'url',
  referenceAssetIds: [],
  requiresAssetReadiness: false,
  pendingAssets: [],
  assetGroupId: settings?.assetGroupId || undefined,
});

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
