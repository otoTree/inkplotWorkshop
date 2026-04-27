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
  createSeedance2VideoTask,
  extractVolcengineTaskId,
  extractVolcengineVideoUrl,
  getSeedance2VideoTask,
  getVolcengineVideoConfig,
  isSeedance2Model,
  mapVolcengineTaskStatus,
} from '@/lib/volcengine/video-client';
import { buildSeedance2VideoPayload } from '@/lib/volcengine/video-payload';
import {
  mapVolcengineAssetRow,
  resolveVolcengineReferenceAssets,
  type LocalReferenceAsset,
  type VolcengineVideoSettings,
} from '@/lib/volcengine/asset-sync';

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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const shouldUseSeedance2 = (settings?: VolcengineVideoSettings | null) =>
  settings?.preferredVideoModel === 'seedance-2.0' ||
  isSeedance2Model(process.env.VOLCENGINE_ARK_VIDEO_MODEL);

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
          const metadata = (shot.video_generation_metadata || {}) as { provider?: string; usage?: Record<string, unknown> };
          const isVolcengineTask = metadata.provider === 'volcengine';
          const providerStatus = isVolcengineTask
            ? await getSeedance2VideoTask(videoId)
            : await getAIVideoStatus(videoId);
          const statusInfo = providerStatus.data || providerStatus;
          const status = (statusInfo.status || '').toLowerCase();
          
          let dbStatus = 'processing';
          let videoUrl = null;

          if (isVolcengineTask) {
            dbStatus = mapVolcengineTaskStatus(status);
            videoUrl = extractVolcengineVideoUrl(providerStatus);
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
                      video_generation_metadata: {
                        ...metadata,
                        rawStatus: status,
                        usage: statusInfo.usage || providerStatus.usage || metadata.usage,
                        ...(dbStatus === 'failed' ? { error: statusInfo.error || providerStatus.error || null } : {}),
                      },
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
          useSeedance2 = shouldUseSeedance2(projectVideoSettings);
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
                const videoConfig = getVolcengineVideoConfig();
                const resolvedReferences = await resolveVolcengineReferenceAssets({
                  references: referenceAssets,
                  settings: projectVideoSettings,
                  persistence: {
                    updateAsset: async (assetId, updates) => {
                      await supabase.from('assets').update(updates).eq('id', assetId);
                    },
                  },
                });
                const payload = buildSeedance2VideoPayload({
                  model: videoConfig.model,
                  prompt: fullPrompt,
                  references: resolvedReferences.references,
                  duration: normalizeShotDurationSeconds(shot.duration),
                  ratio: '9:16',
                  generateAudio: true,
                  watermark: false,
                });
                const seedanceResult = await createSeedance2VideoTask(payload, videoConfig);
                return {
                  ...seedanceResult,
                  __volcengineMetadata: {
                    provider: 'volcengine',
                    model: videoConfig.model,
                    requestContentMode: resolvedReferences.requestContentMode,
                    referenceAssetIds: resolvedReferences.referenceAssetIds,
                    rawStatus: seedanceResult.status || seedanceResult.data?.status || 'processing',
                    usage: seedanceResult.usage || seedanceResult.data?.usage,
                  },
                };
              })()
            : await callAIVideoGeneration(
                fullPrompt,
                normalizeShotDurationSeconds(shot.duration),
                {
                  multi_shot: false,
                  aspect_ratio: "9:16",
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
            const directUrl = useSeedance2 ? extractVolcengineVideoUrl(result) : result.url || result.video_url || result.data?.url || result.data?.video_url;
            const status = (result.status || result.data?.status || 'processing').toLowerCase();
            const videoStatus = useSeedance2 ? mapVolcengineTaskStatus(status) : (['completed', 'succeeded', 'success'].includes(status) ? 'completed' : 'processing');

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
          } else {
            console.error(`Failed to start video for queued shot ${shot.id}:`, message);
            await supabase
              .from('shots')
              .update({
                video_status: 'failed',
                video_generation_metadata: {
                  provider: useSeedance2 ? 'volcengine' : 'legacy',
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
