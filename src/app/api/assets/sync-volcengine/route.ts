import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAsset } from '@/lib/volcengine/asset-client';
import {
  mapVolcengineAssetRow,
  resolveVolcengineReferenceAssets,
  type LocalReferenceAsset,
  type VolcengineVideoSettings,
} from '@/lib/volcengine/asset-sync';

export const maxDuration = 300;

type AssetRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  type?: string | null;
  image_url?: string | null;
  volcengine_asset_id?: string | null;
  volcengine_asset_status?: string | null;
  volcengine_asset_synced_at?: string | null;
};

const getProjectName = (settings: VolcengineVideoSettings) =>
  settings.projectName ||
  process.env.ARTS_ASSET_PROJECT_NAME ||
  process.env.VOLCENGINE_ASSET_PROJECT_NAME ||
  'default';

const shouldResyncAsset = (asset: AssetRow) => {
  if (!asset.image_url) return false;
  if (!asset.volcengine_asset_id) return true;
  return asset.volcengine_asset_status === 'Failed';
};

const shouldRetryProcessingAsset = (asset: AssetRow) =>
  !!asset.image_url && !!asset.volcengine_asset_id && asset.volcengine_asset_status === 'Processing';

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

    const { projectId, action = 'sync' } = await req.json();
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

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
    if (settings.syncAssetsToPrivateLibrary !== true) {
      return NextResponse.json(
        { error: '请先在项目设置中开启“同步素材到火山素材库”' },
        { status: 400 }
      );
    }

    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, name, type, image_url, volcengine_asset_id, volcengine_asset_status, volcengine_asset_group_id, volcengine_asset_project_name, volcengine_asset_type, volcengine_asset_synced_at')
      .eq('project_id', projectId)
      .eq('user_id', user.id);

    if (assetsError) throw assetsError;
    const assetRows = ((assets || []) as AssetRow[]);

    if (action === 'refresh-status') {
      const result = await refreshRemoteAssetStatuses({
        assets: assetRows,
        projectId,
        projectName: getProjectName(settings),
        supabase,
        userId: user.id,
      });

      return NextResponse.json(result);
    }

    const forceRecreateProcessing = action === 'retry-processing';
    const targets = assetRows.filter(
      forceRecreateProcessing ? shouldRetryProcessingAsset : shouldResyncAsset
    );
    if (targets.length === 0) {
      return NextResponse.json({
        synced: 0,
        active: 0,
        processing: 0,
        failed: 0,
        skipped: (assets || []).length,
      });
    }

    const updates: Array<{ assetId: string; patch: Record<string, unknown> }> = [];
    const resolved = await resolveVolcengineReferenceAssets({
      references: targets.map((asset) => toResyncReference(asset, forceRecreateProcessing)),
      settings,
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步火山素材库失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
