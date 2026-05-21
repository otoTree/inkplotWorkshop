import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildVideoGenerationPrompt,
  getAIVideoStatus,
  completeVideoTask,
  callAIVideoGeneration,
} from '@/lib/ai-server';
import { normalizeShotDurationSeconds } from '@/lib/duration';
import {
  buildVolcengineSubmissionMetadata,
  createSeedance2VideoTask,
  extractVolcengineTaskId,
  getConfiguredVolcengineVideoModel,
  getVolcengineTaskSnapshot,
  getSeedance2VideoTask,
  getVolcengineVideoConfig,
  isSeedance2Model,
  mergeVolcengineTaskMetadata,
} from '@/lib/volcengine/video-client';
import {
  normalizeProjectVideoAspectRatio,
  normalizeProjectVideoSettings,
  resolveProjectVideoGenerationModel,
  type ProjectVideoSettingsLike,
} from '@/lib/volcengine/video-compat';
import {
  buildSeedance2VideoPayload,
  DEFAULT_SEEDANCE_2_RESOLUTION,
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

// Optional: Force dynamic so Vercel doesn't cache the cron route
export const dynamic = 'force-dynamic';

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;
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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const shouldUseSeedance2 = (settings?: VolcengineVideoSettings | null) =>
  shouldUseSeedance2ForProject(settings) ||
  (!settings && isSeedance2Model(getConfiguredVolcengineVideoModel()));

const getProjectVideoSettings = async (supabase: AdminSupabaseClient, episodeId: string) => {
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

const getProjectIdForEpisode = async (supabase: AdminSupabaseClient, episodeId: string) => {
  const { data: episode } = await supabase
    .from('episodes')
    .select('project_id')
    .eq('id', episodeId)
    .maybeSingle();

  return episode?.project_id || null;
};

export async function GET(req: Request) {
  // 1. Verify Vercel Cron Secret (optional but highly recommended for security)
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET && 
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // === PART 1: SYNC PROCESSING SHOTS ===
    const { data: processingShots } = await supabase
      .from('shots')
      .select('id, video_generation_id, video_status, video_generation_metadata')
      .eq('video_status', 'processing')
      .not('video_generation_id', 'is', null);

    const syncResults = [];

    if (processingShots && processingShots.length > 0) {
      for (const shot of processingShots) {
        const videoId = shot.video_generation_id;
        if (!videoId || videoId.startsWith('pending:') || videoId.startsWith('job_')) continue;

        try {
          const metadata = (shot.video_generation_metadata || {}) as {
            provider?: string;
            model?: string;
            requestContentMode?: 'asset_uri' | 'url';
            referenceAssetIds?: string[];
            rawStatus?: string;
            usage?: Record<string, unknown>;
            error?: Record<string, unknown> | string | null;
          };
          const isVolcengineTask = inferVideoTaskProvider(videoId, metadata) === 'volcengine';
          const providerStatus = isVolcengineTask
            ? await getSeedance2VideoTask(videoId)
            : await getAIVideoStatus(videoId);
          const statusInfo = providerStatus.data || providerStatus;
          const volcengineSnapshot = isVolcengineTask ? getVolcengineTaskSnapshot(providerStatus) : null;
          const status = isVolcengineTask
            ? volcengineSnapshot?.rawStatus || ''
            : (statusInfo.status || '').toLowerCase();
          
          let dbStatus = 'processing';
          let videoUrl = null;

          if (isVolcengineTask) {
            dbStatus = volcengineSnapshot?.videoStatus || 'processing';
            videoUrl = volcengineSnapshot?.videoUrl || null;
          } else if (['completed', 'succeeded', 'success'].includes(status)) {
            dbStatus = 'completed';
            videoUrl = statusInfo.url || statusInfo.video_url || (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url));
            if (!videoUrl) {
               videoUrl = `/api/ai/download-video?videoId=${videoId}`;
            }
          } else if (['failed', 'error'].includes(status)) {
            dbStatus = 'failed';
          }

          if (dbStatus !== 'processing') {
            await supabase
              .from('shots')
              .update({
                video_status: dbStatus,
                ...(videoUrl ? { video_url: videoUrl } : {}),
                ...(isVolcengineTask
                  ? {
                      video_generation_metadata: mergeVolcengineTaskMetadata(metadata, providerStatus),
                    }
                  : {})
              })
              .eq('id', shot.id);

            await completeVideoTask(videoId);
            syncResults.push({ id: shot.id, videoId, status: dbStatus });
          }
        } catch (err: unknown) {
          console.error(`Failed to check/update status for videoId ${videoId}:`, getErrorMessage(err));
          syncResults.push({ id: shot.id, videoId, error: getErrorMessage(err) });
        }
      }
    }

    // === PART 2: PROCESS QUEUED SHOTS ===
    const { data: queuedShots } = await supabase
      .from('shots')
      .select('*')
      .eq('video_status', 'queued')
      .order('updated_at', { ascending: true }) // FIFO
      .limit(50); // Process up to 50 items per minute

    const queueResults = [];

    if (queuedShots && queuedShots.length > 0) {
      // Process sequentially to prevent overwhelming our API limits or DB, 
      // but tryAcquireVideoSlot will protect AI concurrency.
      for (const shot of queuedShots) {
        let useSeedance2 = false;
        let aspectRatio = getShotAspectRatio(shot);
        let resolvedSeedanceModel = '';
        try {
          const referenceAssets: LocalReferenceAsset[] = [];
          if (shot.reference_image) {
            referenceAssets.push({
              name: shot.scene_label || 'Scene reference',
              type: 'location',
              imageUrl: shot.reference_image,
            });
          }

          if (shot.related_asset_ids && shot.related_asset_ids.length > 0) {
            const { data: assets } = await supabase
              .from('assets')
              .select('id, name, type, image_url, volcengine_asset_id, volcengine_asset_status, volcengine_asset_group_id, volcengine_asset_project_name, volcengine_asset_type')
              .in('id', shot.related_asset_ids);
            if (assets) {
              const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
              shot.related_asset_ids.forEach((assetId: string) => {
                const asset = assetsById.get(assetId);
                if (!asset?.image_url) return;
                referenceAssets.push(mapVolcengineAssetRow(asset));
              });
            }
          }

          const projectVideoSettings = await getProjectVideoSettings(supabase, shot.episode_id);
          const projectId = await getProjectIdForEpisode(supabase, shot.episode_id);
          useSeedance2 = shouldUseSeedance2(projectVideoSettings);
          resolvedSeedanceModel =
            resolveProjectVideoGenerationModel(projectVideoSettings) ||
            getConfiguredVolcengineVideoModel();
          aspectRatio = resolveVideoAspectRatio(shot, projectVideoSettings);
          const fullPrompt = buildVideoGenerationPrompt(
            [
              { label: 'Scene heading', value: shot.scene_label },
              { label: 'Video prompt', value: shot.video_prompt },
              { label: 'Visual description', value: shot.description },
              { label: 'Shot action', value: shot.character_action },
              { label: 'Emotion', value: shot.emotion },
              { label: 'Lighting', value: shot.lighting_atmosphere },
              {
                label: 'Camera framing',
                value: [shot.camera, shot.size].filter(Boolean).join(' '),
              },
              { label: 'Dialogue', value: shot.dialogue },
              { label: 'Sound design', value: shot.sound_effect },
            ],
            referenceAssets
          );

          const result: VideoTaskResult = useSeedance2
            ? await (async () => {
                const videoConfig = getVolcengineVideoConfig(resolvedSeedanceModel);
                const resolvedReferences = await resolveVolcengineReferenceAssets({
                  references: referenceAssets,
                  settings: projectVideoSettings,
                  persistence: {
                    updateAsset: async (assetId, updates) => {
                      await supabase.from('assets').update(updates).eq('id', assetId);
                    },
                    updateProjectVideoSettings: async (updates) => {
                      if (!projectId) return;
                      await supabase
                        .from('projects')
                        .update({
                          volcengine_video_settings: {
                            ...(projectVideoSettings || {}),
                            ...updates,
                          },
                        })
                        .eq('id', projectId);
                    },
                  },
                });
                if (resolvedReferences.requiresAssetReadiness) {
                  const blockingMessage = resolvedReferences.pendingAssets
                    .map((asset) => `${asset.name || asset.id || asset.blockingAssetId || 'reference'}:${asset.reason}`)
                    .join(', ');
                  throw Object.assign(
                    new Error('Seedance 2.0 参考素材尚未全部进入 Active，任务保持排队等待'),
                    {
                      status: 409,
                      details: blockingMessage,
                    }
                  );
                }
                const payload = buildSeedance2VideoPayload({
                  model: videoConfig.model,
                  prompt: fullPrompt,
                  references: resolvedReferences.references,
                  duration: normalizeShotDurationSeconds(shot.duration),
                  ratio: aspectRatio,
                  resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
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
                    resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
                    result: seedanceResult,
                  }),
                };
              })()
            : await callAIVideoGeneration(
                fullPrompt,
                normalizeShotDurationSeconds(shot.duration),
                {
                  multi_shot: false,
                  aspect_ratio: aspectRatio,
                  sound: "on",
                  image_list: referenceAssets
                    .filter((asset) => asset.imageUrl)
                    .map((asset) => ({ image_url: asset.imageUrl! }))
                },
                undefined,
                shot.id,
                false // allowQueueing = false, meaning if no slot, throw 429 so we don't change DB state
              );

          // If successful, update DB
          const taskId = useSeedance2 ? extractVolcengineTaskId(result) : result.task_id || result.id || result.data?.task_id || result.data?.id;
          if (taskId) {
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

            await supabase.from('shots').update({
              video_generation_id: taskId,
              video_status: videoStatus,
              ...(directUrl ? { video_url: directUrl } : {}),
              ...(useSeedance2 ? { video_generation_metadata: result.__volcengineMetadata } : {})
            }).eq('id', shot.id);

            // Also replace the placeholder in active queue with the real taskId
            try {
              const { getAIAPIConfig } = await import('@/lib/ai-server');
              const config = getAIAPIConfig();
              const redis = (await import('@upstash/redis')).Redis.fromEnv();
              const baseKey = `video_concurrency:${config.baseUrl}|${config.apiKey}|${config.maxConcurrency}`;
              const activeKey = `${baseKey}:active`;
              
              // We replace the pending:shot.id with the real taskId so `recover` can find it next time if it gets stuck
              await redis.zrem(activeKey, `pending:${shot.id}`);
              await redis.zadd(activeKey, { score: Date.now() + 15 * 60 * 1000, member: taskId });
            } catch (redisErr) {
              console.error('Failed to commit real taskId to Redis in cron:', redisErr);
            }

            queueResults.push({ id: shot.id, taskId, status: videoStatus });
          }

        } catch (err: unknown) {
          const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 0;
          const message = getErrorMessage(err);
          if (status === 429 || message.includes('capacity')) {
             // Slots are full, stop processing the queue for this minute
             break;
          } else if (status === 409) {
            await supabase
              .from('shots')
              .update({
                video_status: 'queued',
                video_generation_id: null,
                video_generation_metadata: {
                  provider: 'volcengine',
                  ...(useSeedance2 && resolvedSeedanceModel
                    ? { model: resolvedSeedanceModel }
                    : {}),
                  aspectRatio,
                  resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
                  rawStatus: 'waiting_for_assets',
                  error: message,
                },
              })
              .eq('id', shot.id);
            queueResults.push({ id: shot.id, status: 'queued', waiting: 'assets' });
          } else {
            console.error(`Failed to start video for queued shot ${shot.id}:`, message);
            await supabase
              .from('shots')
              .update({
                video_status: 'failed',
                video_generation_metadata: {
                  provider: useSeedance2 ? 'volcengine' : 'legacy',
                  ...(useSeedance2 && resolvedSeedanceModel
                    ? { model: resolvedSeedanceModel }
                    : {}),
                  ...(useSeedance2
                    ? { aspectRatio, resolution: DEFAULT_SEEDANCE_2_RESOLUTION }
                    : {}),
                  ...(useSeedance2 ? { rawStatus: 'failed' } : {}),
                  error: message,
                },
              })
              .eq('id', shot.id);
          }
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      syncProcessed: processingShots?.length || 0,
      syncUpdated: syncResults.length,
      queueProcessed: queueResults.length,
      syncResults,
      queueResults
    });

  } catch (err: unknown) {
    console.error('Cron job error:', err);
    return NextResponse.json({ error: getErrorMessage(err) || 'Internal Error' }, { status: 500 });
  }
}
