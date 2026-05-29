import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
};

const shouldResyncAsset = (asset: AssetRow) => {
  if (!asset.image_url) return false;
  if (!asset.volcengine_asset_id) return true;
  return asset.volcengine_asset_status === 'Failed';
};

const toResyncReference = (asset: AssetRow): LocalReferenceAsset => {
  const reference = mapVolcengineAssetRow(asset);

  if (asset.volcengine_asset_status === 'Failed') {
    return {
      ...reference,
      volcengineAssetId: null,
      volcengineAssetStatus: null,
    };
  }

  return reference;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await req.json();
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
      .select('id, name, type, image_url, volcengine_asset_id, volcengine_asset_status, volcengine_asset_group_id, volcengine_asset_project_name, volcengine_asset_type')
      .eq('project_id', projectId)
      .eq('user_id', user.id);

    if (assetsError) throw assetsError;

    const targets = ((assets || []) as AssetRow[]).filter(shouldResyncAsset);
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
      references: targets.map(toResyncReference),
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
