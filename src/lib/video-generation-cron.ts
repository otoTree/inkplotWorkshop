import {
  buildVideoGenerationPrompt,
  callAIVideoGeneration,
  completeVideoTask,
  getAIVideoStatus,
} from '@/lib/ai-server';
import { normalizeShotDurationSeconds } from '@/lib/duration';
import { normalizeVideoGenerationError } from '@/lib/video-generation-error';
import {
  buildVideoGenerationAttemptDescription,
  ensureVideoGenerationAttempt,
  updateVideoGenerationAttempt,
} from '@/lib/video-generation-history';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  mapVolcengineAssetRow,
  resolveVolcengineReferenceAssets,
  type LocalReferenceAsset,
  type VolcengineVideoSettings,
} from '@/lib/volcengine/asset-sync';
import {
  inferVideoTaskProvider,
  normalizeProjectVideoAspectRatio,
  normalizeProjectVideoSettings,
  resolveProjectVideoGenerationModel,
  shouldUseSeedance2ForProject,
  type ProjectVideoSettingsLike,
} from '@/lib/volcengine/video-compat';
import {
  buildSeedance2VideoPayload,
  DEFAULT_SEEDANCE_2_RESOLUTION,
  normalizeSeedance2AspectRatio,
} from '@/lib/volcengine/video-payload';
import {
  buildVolcengineSubmissionMetadata,
  createSeedance2VideoTask,
  extractVolcengineTaskId,
  getConfiguredVolcengineVideoModel,
  getSeedance2VideoTask,
  getVolcengineTaskSnapshot,
  getVolcengineVideoConfig,
  isSeedance2Model,
  mergeVolcengineTaskMetadata,
} from '@/lib/volcengine/video-client';

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

type VideoGenerationMetadata = {
  provider?: string;
  model?: string;
  requestContentMode?: 'asset_uri' | 'url';
  referenceAssetIds?: string[];
  rawStatus?: string;
  usage?: Record<string, unknown>;
  error?: Record<string, unknown> | string | null;
};

export type VideoGenerationCronOptions = {
  maxProcessingShots?: number;
  maxQueuedShots?: number;
  deadlineMs?: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getLegacyVideoStatusError = (result: unknown) => {
  const root = asRecord(result);
  const data = asRecord(root.data);
  const statusInfo = data.status ? data : root;
  return normalizeVideoGenerationError(
    statusInfo.error ||
      statusInfo.Error ||
      statusInfo.last_error ||
      statusInfo.lastError ||
      statusInfo.failure_reason ||
      statusInfo.failureReason ||
      statusInfo.message ||
      root.error ||
      root.Error ||
      root.message
  );
};

const getBlockingAssetLabel = (asset: {
  name?: string | null;
  id?: string;
  blockingAssetId?: string;
}) => asset.name || asset.id || asset.blockingAssetId || 'reference';

const formatBlockingAssets = (
  pendingAssets: Array<{
    name?: string | null;
    id?: string;
    blockingAssetId?: string;
    reason: string;
  }>
) =>
  pendingAssets
    .map((asset) => `${getBlockingAssetLabel(asset)}:${asset.reason}`)
    .join(', ');

const hasTerminalAssetFailure = (
  pendingAssets: Array<{ reason: string }>
) => pendingAssets.some((asset) => asset.reason === 'failed' || asset.reason === 'missing-source');

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

const getErrorDetailsMessage = (error: unknown) => {
  const details =
    error && typeof error === 'object' && 'details' in error
      ? (error as { details?: unknown }).details
      : null;
  if (typeof details === 'string' && details.trim()) return details;
  return getErrorMessage(error);
};

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

const isPastDeadline = (deadlineMs?: number) =>
  typeof deadlineMs === 'number' && Date.now() >= deadlineMs;

export const runVideoGenerationCronTick = async (
  options: VideoGenerationCronOptions = {}
) => {
  const supabase = createAdminClient();
  const maxProcessingShots = options.maxProcessingShots ?? 50;
  const maxQueuedShots = options.maxQueuedShots ?? 50;

  const { data: processingShots } = await supabase
    .from('shots')
    .select('id, video_generation_id, video_status, video_generation_metadata')
    .eq('video_status', 'processing')
    .not('video_generation_id', 'is', null)
    .limit(maxProcessingShots);

  const syncResults = [];

  if (processingShots && processingShots.length > 0) {
    for (const shot of processingShots) {
      if (isPastDeadline(options.deadlineMs)) break;
      const videoId = shot.video_generation_id;
      if (!videoId || videoId.startsWith('pending:') || videoId.startsWith('job_')) continue;

      try {
        const metadata = (shot.video_generation_metadata || {}) as VideoGenerationMetadata;
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
        let nextMetadata: VideoGenerationMetadata = metadata;

        if (isVolcengineTask) {
          dbStatus = volcengineSnapshot?.videoStatus || 'processing';
          videoUrl = volcengineSnapshot?.videoUrl || null;
          nextMetadata = mergeVolcengineTaskMetadata(metadata, providerStatus);
        } else if (['completed', 'succeeded', 'success'].includes(status)) {
          dbStatus = 'completed';
          videoUrl = statusInfo.url || statusInfo.video_url || (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url));
          if (!videoUrl) {
            videoUrl = `/api/ai/download-video?videoId=${videoId}`;
          }
        } else if (['failed', 'error'].includes(status)) {
          dbStatus = 'failed';
          nextMetadata = {
            ...metadata,
            provider: metadata.provider || 'legacy',
            rawStatus: status || metadata.rawStatus || 'failed',
            error: getLegacyVideoStatusError(providerStatus) || metadata.error || null,
          };
        }

        if (dbStatus !== 'processing') {
          const metadataWithHistory = updateVideoGenerationAttempt(nextMetadata, {
            status: dbStatus as 'completed' | 'failed',
            generationId: videoId,
            videoUrl,
            provider: isVolcengineTask ? 'volcengine' : metadata.provider || 'legacy',
            rawStatus: status || metadata.rawStatus,
            error: dbStatus === 'failed' ? nextMetadata.error || null : null,
          });
          await supabase
            .from('shots')
            .update({
              video_status: dbStatus,
              ...(videoUrl ? { video_url: videoUrl } : {}),
              video_generation_metadata: metadataWithHistory,
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

  const { data: queuedShots } = await supabase
    .from('shots')
    .select('*')
    .eq('video_status', 'queued')
    .order('updated_at', { ascending: true })
    .limit(maxQueuedShots);

  const queueResults = [];

  if (queuedShots && queuedShots.length > 0) {
    for (const shot of queuedShots) {
      if (isPastDeadline(options.deadlineMs)) break;
      let useSeedance2 = false;
      let aspectRatio = getShotAspectRatio(shot);
      let resolvedSeedanceModel = '';
      let attemptMetadata = (shot.video_generation_metadata || {}) as VideoGenerationMetadata;
      try {
        const referenceAssets: LocalReferenceAsset[] = [];
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
        attemptMetadata = ensureVideoGenerationAttempt(attemptMetadata, {
          prompt: shot.video_prompt,
          description: buildVideoGenerationAttemptDescription({
            videoPrompt: shot.video_prompt,
            description: shot.description,
            sceneLabel: shot.scene_label,
            characterAction: shot.character_action,
            emotion: shot.emotion,
            lightingAtmosphere: shot.lighting_atmosphere,
            camera: shot.camera,
            size: shot.size,
            dialogue: shot.dialogue,
            soundEffect: shot.sound_effect,
          }),
          aspectRatio,
          resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
        });

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
                const blockingMessage = formatBlockingAssets(resolvedReferences.pendingAssets);
                if (hasTerminalAssetFailure(resolvedReferences.pendingAssets)) {
                  throw Object.assign(
                    new Error('Seedance 2.0 参考素材同步失败，视频生成已停止'),
                    {
                      status: 422,
                      details: blockingMessage,
                    }
                  );
                }
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
                sound: 'on',
                image_list: referenceAssets
                  .filter((asset) => asset.imageUrl)
                  .map((asset) => ({ image_url: asset.imageUrl! })),
              },
              undefined,
              shot.id,
              false
            );

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
          const nextMetadata = updateVideoGenerationAttempt(
            {
              ...attemptMetadata,
              ...(useSeedance2 ? (result.__volcengineMetadata as VideoGenerationMetadata) : {}),
            },
            {
              status: videoStatus,
              generationId: taskId,
              videoUrl: directUrl || null,
              provider: useSeedance2 ? 'volcengine' : 'legacy',
              model: useSeedance2 ? resolvedSeedanceModel : undefined,
              error: null,
            }
          );

          await supabase.from('shots').update({
            video_generation_id: taskId,
            video_status: videoStatus,
            ...(directUrl ? { video_url: directUrl } : {}),
            video_generation_metadata: nextMetadata,
          }).eq('id', shot.id);

          try {
            const {
              getAIAPIConfig,
              getVideoTaskHistoryKey,
              VIDEO_TASK_HISTORY_TTL_SECONDS,
            } = await import('@/lib/ai-server');
            const config = getAIAPIConfig();
            const redis = (await import('@upstash/redis')).Redis.fromEnv();
            const baseKey = `video_concurrency:${config.baseUrl}|${config.apiKey}|${config.maxConcurrency}`;
            const activeKey = `${baseKey}:active`;

            await redis.zrem(activeKey, `pending:${shot.id}`);
            await redis.zadd(activeKey, { score: Date.now() + 15 * 60 * 1000, member: taskId });
            await redis.set(`video_task_map:${config.baseUrl}|${config.apiKey}|${config.maxConcurrency}:${taskId}`, shot.id, {
              ex: VIDEO_TASK_HISTORY_TTL_SECONDS,
            });
            await redis.zadd(getVideoTaskHistoryKey(config), {
              score: Date.now(),
              member: JSON.stringify({ taskId, shotId: shot.id }),
            });
            await redis.expire(getVideoTaskHistoryKey(config), VIDEO_TASK_HISTORY_TTL_SECONDS);
          } catch (redisErr) {
            console.error('Failed to commit real taskId to Redis in cron:', redisErr);
          }

          queueResults.push({ id: shot.id, taskId, status: videoStatus });
        }
      } catch (err: unknown) {
        const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 0;
        const message = getErrorMessage(err);
        const errorDetails = getErrorDetailsMessage(err);
        if (status === 429 || message.includes('capacity')) {
          break;
        } else if (status === 409) {
          await supabase
            .from('shots')
            .update({
              video_status: 'queued',
              video_generation_id: null,
              video_generation_metadata: updateVideoGenerationAttempt(attemptMetadata, {
                status: 'queued',
                provider: 'volcengine',
                model: useSeedance2 && resolvedSeedanceModel ? resolvedSeedanceModel : undefined,
                aspectRatio,
                resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
                rawStatus: 'waiting_for_assets',
                error: errorDetails,
              }),
            })
            .eq('id', shot.id);
          queueResults.push({ id: shot.id, status: 'queued', waiting: 'assets', error: errorDetails });
        } else {
          console.error(`Failed to start video for queued shot ${shot.id}:`, message);
          await supabase
            .from('shots')
            .update({
              video_status: 'failed',
              video_generation_metadata: updateVideoGenerationAttempt(attemptMetadata, {
                status: 'failed',
                provider: useSeedance2 ? 'volcengine' : 'legacy',
                model: useSeedance2 && resolvedSeedanceModel ? resolvedSeedanceModel : undefined,
                aspectRatio: useSeedance2 ? aspectRatio : undefined,
                resolution: useSeedance2 ? DEFAULT_SEEDANCE_2_RESOLUTION : undefined,
                rawStatus: useSeedance2 ? 'failed' : undefined,
                error: errorDetails,
              }),
            })
            .eq('id', shot.id);
          queueResults.push({ id: shot.id, status: 'failed', error: errorDetails });
        }
      }
    }
  }

  return {
    success: true,
    syncProcessed: processingShots?.length || 0,
    syncUpdated: syncResults.length,
    queueProcessed: queueResults.length,
    syncResults,
    queueResults,
  };
};
