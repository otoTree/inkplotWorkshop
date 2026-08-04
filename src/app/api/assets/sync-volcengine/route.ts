import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAsset, getVolcengineAssetProjectName } from '@/lib/volcengine/asset-client';
import {
  normalizeVolcengineAssetBatchSize,
  selectVolcengineAssetBatch,
} from '@/lib/volcengine/asset-batch';
import {
  mapVolcengineAssetRow,
  resolveVolcengineReferenceAssets,
  type LocalReferenceAsset,
  type VolcengineVideoSettings,
} from '@/lib/volcengine/asset-sync';
import { normalizeProjectVideoSettings } from '@/lib/volcengine/video-compat';

export const maxDuration = 300;
export const preferredRegion = 'sin1';

type AssetRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  type?: string | null;
  image_url?: string | null;
  volcengine_asset_id?: string | null;
  volcengine_asset_status?: string | null;
  volcengine_asset_synced_at?: string | null;
};

type SyncAction = 'sync' | 'refresh-status' | 'retry-processing' | 'force-resync';

const getProjectName = (settings: VolcengineVideoSettings) =>
  getVolcengineAssetProjectName(settings.projectName);

const shouldResyncAsset = (asset: AssetRow) => {
  if (!asset.image_url) return false;
  if (!asset.volcengine_asset_id) return true;
  return asset.volcengine_asset_status === 'Failed';
};

const shouldRetryProcessingAsset = (asset: AssetRow) =>
  !!asset.image_url && !!asset.volcengine_asset_id && asset.volcengine_asset_status === 'Processing';

const shouldForceResyncAsset = (asset: AssetRow) => !!asset.image_url;

const shouldRefreshAsset = (asset: AssetRow) =>
  !!asset.volcengine_asset_id && asset.volcengine_asset_status !== 'Active';

const toResyncReference = (asset: AssetRow, forceRecreate = false): LocalReferenceAsset => {
  const reference = mapVolcengineAssetRow(asset);

  if (forceRecreate || asset.volcengine_asset_status === 'Failed') {
    return {
      ...reference,
      volcengineAssetId: null,
      volcengineAssetStatus: null,
    };
  }

  return reference;
};

const refreshRemoteAssetStatuses = async ({
  assets,
  projectId,
  projectName,
  supabase,
  userId,
}: {
  assets: AssetRow[];
  projectId: string;
  projectName: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) => {
  const targets = assets.filter(shouldRefreshAsset);
  const summary = {
    refreshed: 0,
    active: 0,
    processing: 0,
    failed: 0,
    errors: 0,
    skipped: assets.length - targets.length,
  };

  for (const asset of targets) {
    if (!asset.volcengine_asset_id) continue;

    try {
      const remote = await getAsset({
        Id: asset.volcengine_asset_id,
        ProjectName: projectName,
      });
      const status = remote.Status || asset.volcengine_asset_status || null;
      const patch = {
        volcengine_asset_id: remote.Id,
        volcengine_asset_status: status,
        volcengine_asset_group_id: remote.GroupId || null,
        volcengine_asset_project_name: remote.ProjectName || projectName,
        volcengine_asset_type: remote.AssetType || 'Image',
        volcengine_asset_error: remote.Error || null,
        volcengine_asset_synced_at: new Date().toISOString(),
      };

      await supabase
        .from('assets')
        .update(patch)
        .eq('id', asset.id)
        .eq('user_id', userId)
        .eq('project_id', projectId);

      summary.refreshed += 1;
      if (status === 'Active') summary.active += 1;
      else if (status === 'Failed') summary.failed += 1;
      else summary.processing += 1;
    } catch (error) {
      summary.errors += 1;
      await supabase
        .from('assets')
        .update({
          volcengine_asset_error: {
            Message: error instanceof Error ? error.message : String(error),
          },
          volcengine_asset_synced_at: new Date().toISOString(),
        })
        .eq('id', asset.id)
        .eq('user_id', userId)
        .eq('project_id', projectId);
    }
  }

  return summary;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      projectId,
      action = 'sync',
      cursor: rawCursor,
      batchSize: rawBatchSize,
    } = await req.json() as {
      projectId?: unknown;
      action?: SyncAction;
      cursor?: unknown;
      batchSize?: unknown;
    };
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    if (
      action !== 'sync' &&
      action !== 'refresh-status' &&
      action !== 'retry-processing' &&
      action !== 'force-resync'
    ) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    const cursor = typeof rawCursor === 'string' && rawCursor ? rawCursor : null;
    const batchSize = normalizeVolcengineAssetBatchSize(rawBatchSize);

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, volcengine_video_settings')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const settings = (project.volcengine_video_settings || {}) as VolcengineVideoSettings;
    const normalizedSettings = normalizeProjectVideoSettings(settings);
    if (normalizedSettings.syncAssetsToPrivateLibrary !== true) {
      return NextResponse.json(
        { error: '所有模型已统一使用对象存储 URL，不再同步或使用火山素材 ID' },
        { status: 400 }
      );
    }

    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, name, type, image_url, volcengine_asset_id, volcengine_asset_status, volcengine_asset_group_id, volcengine_asset_project_name, volcengine_asset_type, volcengine_asset_error, volcengine_asset_synced_at')
      .eq('project_id', projectId)
      .eq('user_id', user.id);

    if (assetsError) throw assetsError;
    const assetRows = ((assets || []) as AssetRow[]);

    if (action === 'refresh-status') {
      const batch = selectVolcengineAssetBatch(
        assetRows,
        shouldRefreshAsset,
        cursor,
        batchSize
      );
      const result = await refreshRemoteAssetStatuses({
        assets: batch.items,
        projectId,
        projectName: getProjectName(settings),
        supabase,
        userId: user.id,
      });

      return NextResponse.json({
        ...result,
        hasMore: batch.hasMore,
        nextCursor: batch.nextCursor,
        remaining: batch.remaining,
        region: process.env.VERCEL_REGION || 'local',
      });
    }

    const forceRecreateProcessing = action === 'retry-processing';
    const forceFullResync = action === 'force-resync';
    const isFirstBatch = !cursor;
    const batch = selectVolcengineAssetBatch(
      assetRows,
      forceFullResync
        ? shouldForceResyncAsset
        : forceRecreateProcessing
          ? shouldRetryProcessingAsset
          : shouldResyncAsset,
      cursor,
      batchSize
    );
    const targets = batch.items;
    if (targets.length === 0) {
      if (forceFullResync && isFirstBatch) {
        await supabase
          .from('projects')
          .update({
            volcengine_video_settings: {
              ...settings,
              assetGroupId: null,
            },
          })
          .eq('id', projectId)
          .eq('user_id', user.id);
      }

      return NextResponse.json({
        synced: 0,
        active: 0,
        processing: 0,
        failed: 0,
        skipped: (assets || []).length,
        hasMore: false,
        nextCursor: null,
        remaining: 0,
        region: process.env.VERCEL_REGION || 'local',
      });
    }

    const syncSettings = forceFullResync && isFirstBatch
      ? ({
          ...settings,
          assetGroupId: undefined,
        } as VolcengineVideoSettings)
      : settings;

    if (forceFullResync) {
      const targetIds = targets.map((asset) => asset.id);
      const resetPatch = {
        volcengine_asset_id: null,
        volcengine_asset_status: null,
        volcengine_asset_group_id: null,
        volcengine_asset_project_name: null,
        volcengine_asset_type: null,
        volcengine_asset_error: null,
        volcengine_asset_synced_at: null,
      };

      const { error: resetError } = await supabase
        .from('assets')
        .update(resetPatch)
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .in('id', targetIds);

      if (resetError) throw resetError;

      if (isFirstBatch) {
        await supabase
          .from('projects')
          .update({
            volcengine_video_settings: {
              ...settings,
              assetGroupId: null,
            },
          })
          .eq('id', projectId)
          .eq('user_id', user.id);
      }
    }

    const updates: Array<{ assetId: string; patch: Record<string, unknown> }> = [];
    const resolved = await resolveVolcengineReferenceAssets({
      references: targets.map((asset) => toResyncReference(asset, forceRecreateProcessing || forceFullResync)),
      settings: syncSettings,
      forceCreateAssetGroup: forceFullResync && isFirstBatch,
      persistence: {
        updateAsset: async (assetId, patch) => {
          updates.push({ assetId, patch });
          await supabase
            .from('assets')
            .update(patch)
            .eq('id', assetId)
            .eq('user_id', user.id)
            .eq('project_id', projectId);
        },
        updateProjectVideoSettings: async (patch) => {
          await supabase
            .from('projects')
            .update({
              volcengine_video_settings: {
                ...settings,
                ...patch,
              },
            })
            .eq('id', projectId)
            .eq('user_id', user.id);
        },
      },
    });

    const active = updates.filter(({ patch }) => patch.volcengine_asset_status === 'Active').length;
    const processing = updates.filter(({ patch }) => patch.volcengine_asset_status === 'Processing').length;
    const failed = updates.filter(({ patch }) => patch.volcengine_asset_status === 'Failed').length;

    return NextResponse.json({
      synced: targets.length,
      active,
      processing,
      failed,
      requiresAssetReadiness: resolved.requiresAssetReadiness,
      assetGroupId: resolved.assetGroupId,
      hasMore: batch.hasMore,
      nextCursor: batch.nextCursor,
      remaining: batch.remaining,
      region: process.env.VERCEL_REGION || 'local',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步火山素材库失败';
    console.error('Volcengine asset sync batch failed', {
      message,
      error,
      region: process.env.VERCEL_REGION || 'local',
    });
    return NextResponse.json(
      { error: message, region: process.env.VERCEL_REGION || 'local' },
      { status: 500 }
    );
  }
}
