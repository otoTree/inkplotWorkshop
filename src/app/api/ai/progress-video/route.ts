import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  AIAPIError,
  buildVideoGenerationPrompt,
  callAIVideoGeneration,
  completeVideoTask,
  getAIVideoStatus,
} from '@/lib/ai-server';
import { normalizeShotDurationSeconds } from '@/lib/duration';
import {
  buildVolcengineSubmissionMetadata,
  extractVolcengineTaskId,
  getConfiguredVolcengineVideoModel,
  getVolcengineTaskSnapshot,
  getSeedance2VideoTask,
  getVolcengineVideoConfig,
  isSeedance2Model,
  mergeVolcengineTaskMetadata,
  createSeedance2VideoTask,
} from '@/lib/volcengine/video-client';
import {
  normalizeProjectVideoAspectRatio,
  normalizeProjectVideoSettings,
  resolveProjectVideoGenerationModel,
  type ProjectVideoSettingsLike,
} from '@/lib/volcengine/video-compat';
import {
  buildSeedance2VideoPayload,
  normalizeSeedance2AspectRatio,
} from '@/lib/volcengine/video-payload';
import {
  mapVolcengineAssetRow,
  resolveVolcengineReferenceAssets,
  type LocalReferenceAsset,
  type VolcengineVideoSettings,
} from '@/lib/volcengine/asset-sync';
import {
  inferVideoTaskProvider,
  shouldUseSeedance2ForProject,
} from '@/lib/volcengine/video-compat';

export const maxDuration = 120;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type VideoTaskResult = Record<string, unknown> & {
  id?: string;
  task_id?: string;
  status?: string;
  url?: string;
  video_url?: string;
  data?: {
    id?: string;
    task_id?: string;
    status?: string;
    url?: string;
    video_url?: string;
    usage?: Record<string, unknown>;
  };
  usage?: Record<string, unknown>;
  __volcengineMetadata?: Record<string, unknown>;
};

const getShotAspectRatio = (shot: { video_generation_metadata?: unknown }) => {
  const metadata =
    shot.video_generation_metadata &&
    typeof shot.video_generation_metadata === 'object' &&
    !Array.isArray(shot.video_generation_metadata)
      ? (shot.video_generation_metadata as { aspectRatio?: string })
      : null;
  return normalizeSeedance2AspectRatio(metadata?.aspectRatio);
};

const resolveVideoAspectRatio = (
  shot: { video_generation_metadata?: unknown },
  settings?: ProjectVideoSettingsLike | null
) => {
  const shotRatio = getShotAspectRatio(shot);
  const projectRatio = settings ? normalizeProjectVideoSettings(settings).aspectRatio : undefined;
  return normalizeProjectVideoAspectRatio(projectRatio || shotRatio);
};

const shouldUseSeedance2 = (settings?: VolcengineVideoSettings | null) =>
  shouldUseSeedance2ForProject(settings) ||
  (!settings && isSeedance2Model(getConfiguredVolcengineVideoModel()));

const getProjectVideoSettings = async (supabase: ServerSupabaseClient, episodeId: string) => {
  const { data: episode } = await supabase
    .from('episodes')
    .select('project_id')
    .eq('id', episodeId)
    .maybeSingle();
  if (!episode?.project_id) return null;

  const { data: project } = await supabase
    .from('projects')
    .select('volcengine_video_settings')
    .eq('id', episode.project_id)
    .maybeSingle();

  return (project?.volcengine_video_settings || null) as VolcengineVideoSettings | null;
};

const getProjectIdForEpisode = async (supabase: ServerSupabaseClient, episodeId: string, userId: string) => {
  const { data: episode } = await supabase
    .from('episodes')
    .select('project_id')
    .eq('id', episodeId)
    .eq('user_id', userId)
    .maybeSingle();

  return episode?.project_id || null;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { shotId } = body;

    if (!shotId || typeof shotId !== 'string') {
      return NextResponse.json({ error: 'Missing shotId' }, { status: 400 });
    }

    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*')
      .eq('id', shotId)
      .eq('user_id', user.id)
      .single();

    if (shotError || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    if (shot.video_status === 'completed' || shot.video_status === 'failed') {
      return NextResponse.json({
        shotId: shot.id,
        videoStatus: shot.video_status,
        videoGenerationId: shot.video_generation_id,
        videoUrl: shot.video_url,
      });
    }

    if (shot.video_status === 'queued' && !shot.video_generation_id) {
      const dispatchPlaceholder = `pending:${shot.id}`;
      const { data: claimedShot, error: claimError } = await supabase
        .from('shots')
        .update({
          video_generation_id: dispatchPlaceholder,
        })
        .eq('id', shot.id)
        .eq('user_id', user.id)
        .eq('video_status', 'queued')
        .is('video_generation_id', null)
        .select('*')
        .maybeSingle();

      if (claimError) {
        throw claimError;
      }

      // Another request already claimed or progressed this shot.
      if (!claimedShot) {
        const { data: latestShot } = await supabase
          .from('shots')
          .select('id, video_status, video_generation_id, video_url')
          .eq('id', shot.id)
          .eq('user_id', user.id)
          .single();

        return NextResponse.json({
          shotId: shot.id,
          videoStatus: latestShot?.video_status || 'queued',
          videoGenerationId: latestShot?.video_generation_id || null,
          videoUrl: latestShot?.video_url || null,
        });
      }

      const referenceAssets: LocalReferenceAsset[] = [];
      if (claimedShot.reference_image) {
        referenceAssets.push({
          name: claimedShot.scene_label || 'Scene reference',
          type: 'location',
          imageUrl: claimedShot.reference_image,
        });
      }

      if (claimedShot.related_asset_ids && claimedShot.related_asset_ids.length > 0) {
        const { data: assets } = await supabase
          .from('assets')
          .select('id, name, type, image_url, volcengine_asset_id, volcengine_asset_status, volcengine_asset_group_id, volcengine_asset_project_name, volcengine_asset_type')
          .in('id', claimedShot.related_asset_ids);
        if (assets) {
          const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
          claimedShot.related_asset_ids.forEach((assetId: string) => {
            const asset = assetsById.get(assetId);
            if (!asset?.image_url) return;
            referenceAssets.push(mapVolcengineAssetRow(asset));
          });
        }
      }

      const projectVideoSettings = await getProjectVideoSettings(supabase, claimedShot.episode_id);
      const projectId = await getProjectIdForEpisode(supabase, claimedShot.episode_id, user.id);
      const useSeedance2 = shouldUseSeedance2(projectVideoSettings);
      const resolvedSeedanceModel =
        resolveProjectVideoGenerationModel(projectVideoSettings) ||
        getConfiguredVolcengineVideoModel();
      const aspectRatio = resolveVideoAspectRatio(claimedShot, projectVideoSettings);
      const fullPrompt = buildVideoGenerationPrompt(
        [
          { label: 'Scene heading', value: claimedShot.scene_label },
          { label: 'Video prompt', value: claimedShot.video_prompt },
          { label: 'Visual description', value: claimedShot.description },
          { label: 'Shot action', value: claimedShot.character_action },
          { label: 'Emotion', value: claimedShot.emotion },
          { label: 'Lighting', value: claimedShot.lighting_atmosphere },
          {
            label: 'Camera framing',
            value: [claimedShot.camera, claimedShot.size].filter(Boolean).join(' '),
          },
          { label: 'Dialogue', value: claimedShot.dialogue },
          { label: 'Sound design', value: claimedShot.sound_effect },
        ],
        referenceAssets
      );

      try {
        const result: VideoTaskResult = useSeedance2
          ? await (async () => {
              const videoConfig = getVolcengineVideoConfig(resolvedSeedanceModel);
              const resolvedReferences = await resolveVolcengineReferenceAssets({
                references: referenceAssets,
                settings: projectVideoSettings,
                persistence: {
                  updateAsset: async (assetId, updates) => {
                    await supabase.from('assets').update(updates).eq('id', assetId).eq('user_id', user.id);
                  },
                  updateProjectVideoSettings: async (updates) => {
                    const mergedSettings = {
                      ...(projectVideoSettings || {}),
                      ...updates,
                    };
                    if (!projectId) return;
                    await supabase
                      .from('projects')
                      .update({ volcengine_video_settings: mergedSettings })
                      .eq('id', projectId)
                      .eq('user_id', user.id);
                  },
                },
              });
              if (resolvedReferences.requiresAssetReadiness) {
                const blockingMessage = resolvedReferences.pendingAssets
                  .map((asset) => `${asset.name || asset.id || asset.blockingAssetId || 'reference'}:${asset.reason}`)
                  .join(', ');
                throw new AIAPIError(
                  'Seedance 2.0 参考素材尚未全部进入 Active，任务将继续排队等待',
                  409,
                  blockingMessage
                );
              }
              const payload = buildSeedance2VideoPayload({
                model: videoConfig.model,
                prompt: fullPrompt,
                references: resolvedReferences.references,
                duration: normalizeShotDurationSeconds(claimedShot.duration),
                ratio: aspectRatio,
                resolution: '1080p',
                generateAudio: true,
                watermark: false,
              });
              const seedanceResult = await createSeedance2VideoTask(payload, videoConfig);
              return {
                ...seedanceResult,
                __volcengineMetadata: buildVolcengineSubmissionMetadata({
                  model: videoConfig.model,
                  requestContentMode: resolvedReferences.requestContentMode,
                  referenceAssetIds: resolvedReferences.referenceAssetIds,
                  aspectRatio,
                  resolution: '1080p',
                  result: seedanceResult,
                }),
              };
            })()
          : await callAIVideoGeneration(
              fullPrompt,
              normalizeShotDurationSeconds(claimedShot.duration),
              {
                multi_shot: false,
                aspect_ratio: aspectRatio,
                sound: 'on',
                image_list: referenceAssets
                  .filter((asset) => asset.imageUrl)
                  .map((asset) => ({ image_url: asset.imageUrl! })),
              },
              undefined,
              claimedShot.id,
              false
            );

        const taskId = useSeedance2
          ? extractVolcengineTaskId(result)
          : result.task_id || result.id || result.data?.task_id || result.data?.id;
        const volcengineSnapshot = useSeedance2 ? getVolcengineTaskSnapshot(result) : null;
        const directUrl = useSeedance2
          ? volcengineSnapshot?.videoUrl
          : result.url || result.video_url || result.data?.url || result.data?.video_url;
        const status = useSeedance2
          ? (volcengineSnapshot?.rawStatus || 'processing')
          : (result.status || result.data?.status || 'processing').toLowerCase();
        const videoStatus = useSeedance2
          ? volcengineSnapshot?.videoStatus || 'processing'
          : (['completed', 'succeeded', 'success'].includes(status) ? 'completed' : 'processing');

        if (taskId) {
          await supabase
            .from('shots')
            .update({
              video_generation_id: taskId,
              video_status: videoStatus,
              ...(directUrl ? { video_url: directUrl } : {}),
              ...(useSeedance2 ? { video_generation_metadata: result.__volcengineMetadata } : {}),
            })
            .eq('id', claimedShot.id)
            .eq('user_id', user.id);
        }

        if (taskId && ((useSeedance2 && videoStatus !== 'processing') || (!useSeedance2 && ['completed', 'failed', 'error', 'success', 'succeeded'].includes(status)))) {
          await completeVideoTask(taskId);
        }

        return NextResponse.json({
          shotId: claimedShot.id,
          videoStatus,
          videoGenerationId: taskId || null,
          videoUrl: directUrl || null,
          providerStatus: status,
        });
      } catch (error) {
        if (error instanceof AIAPIError && (error.status === 429 || error.status === 409)) {
          await supabase
            .from('shots')
            .update({
              video_generation_id: null,
              video_status: 'queued',
              ...(useSeedance2
                ? {
                    video_generation_metadata: {
                      provider: 'volcengine',
                      model: resolvedSeedanceModel || undefined,
                      aspectRatio,
                      resolution: '1080p',
                      rawStatus: 'waiting_for_assets',
                      error: error.details || error.message,
                    },
                  }
                : {}),
            })
            .eq('id', claimedShot.id)
            .eq('user_id', user.id)
            .eq('video_generation_id', dispatchPlaceholder);

          return NextResponse.json({
            shotId: claimedShot.id,
            videoStatus: 'queued',
            videoGenerationId: null,
            videoUrl: claimedShot.video_url,
          });
        }

        await supabase
          .from('shots')
          .update({
            video_generation_id: null,
            video_status: 'failed',
            video_generation_metadata: {
              provider: useSeedance2 ? 'volcengine' : 'legacy',
              ...(useSeedance2 && resolvedSeedanceModel
                ? { model: resolvedSeedanceModel }
                : {}),
              ...(useSeedance2 ? { aspectRatio, resolution: '1080p' } : {}),
              ...(useSeedance2 ? { rawStatus: 'failed' } : {}),
              error: error instanceof Error ? error.message : String(error),
            },
          })
          .eq('id', claimedShot.id)
          .eq('user_id', user.id)
          .eq('video_generation_id', dispatchPlaceholder);

        throw error;
      }
    }

    const videoId = shot.video_generation_id;
    if (videoId && videoId.startsWith('pending:')) {
      return NextResponse.json({
        shotId: shot.id,
        videoStatus: 'queued',
        videoGenerationId: null,
        videoUrl: shot.video_url,
      });
    }
    if (!videoId) {
      return NextResponse.json({
        shotId: shot.id,
        videoStatus: shot.video_status || 'pending',
        videoGenerationId: null,
        videoUrl: shot.video_url,
      });
    }

    const metadata = (shot.video_generation_metadata || {}) as {
      provider?: string;
      model?: string;
      requestContentMode?: 'asset_uri' | 'url';
      referenceAssetIds?: string[];
      aspectRatio?: '9:16' | '16:9';
      resolution?: '1080p';
      rawStatus?: string;
      usage?: Record<string, unknown>;
      error?: Record<string, unknown> | string | null;
    };
    const isVolcengineTask = inferVideoTaskProvider(videoId, metadata) === 'volcengine';
    const result = isVolcengineTask ? await getSeedance2VideoTask(videoId) : await getAIVideoStatus(videoId);
    const statusInfo = result.data || result;
    const volcengineSnapshot = isVolcengineTask ? getVolcengineTaskSnapshot(result) : null;
    const status = isVolcengineTask
      ? volcengineSnapshot?.rawStatus || ''
      : (statusInfo.status || '').toLowerCase();
    const directUrl = isVolcengineTask
      ? volcengineSnapshot?.videoUrl || null
      : statusInfo.url ||
        statusInfo.video_url ||
        statusInfo.content?.video_url ||
        (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url || statusInfo.data.content?.video_url)) ||
        null;

    let videoStatus = shot.video_status || 'processing';
    if (isVolcengineTask) {
      videoStatus = volcengineSnapshot?.videoStatus || 'processing';
    } else if (['completed', 'succeeded', 'success'].includes(status)) {
      videoStatus = 'completed';
    } else if (['failed', 'error'].includes(status)) {
      videoStatus = 'failed';
    } else {
      videoStatus = 'processing';
    }

    await supabase
      .from('shots')
      .update({
        video_status: videoStatus,
        ...(directUrl ? { video_url: directUrl } : {}),
        ...(isVolcengineTask
          ? {
              video_generation_metadata: mergeVolcengineTaskMetadata(metadata, result),
            }
          : {}),
      })
      .eq('id', shot.id)
      .eq('user_id', user.id);

    if (videoStatus === 'completed' || videoStatus === 'failed') {
      await completeVideoTask(videoId);
    }

    return NextResponse.json({
      shotId: shot.id,
      videoStatus,
      videoGenerationId: videoId,
      videoUrl: directUrl || shot.video_url || null,
      providerStatus: status,
    });
  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
