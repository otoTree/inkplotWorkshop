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
  getVideoGenerationErrorMessage,
  normalizeVideoGenerationError,
} from '@/lib/video-generation-error';
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
  isInternationalSeedance2VideoModel,
  resolveProjectVideoGenerationModel,
  type ProjectVideoSettingsLike,
} from '@/lib/volcengine/video-compat';
import {
  DEFAULT_SEEDANCE_2_RESOLUTION,
  buildSeedance2VideoPayload,
  normalizeSeedance2AspectRatio,
  type Seedance2Resolution,
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
import {
  ensureVideoGenerationAttempt,
  updateVideoGenerationAttempt,
  buildVideoGenerationAttemptDescription,
} from '@/lib/video-generation-history';

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

type VideoGenerationMetadata = {
  provider?: string;
  model?: string;
  requestContentMode?: 'asset_uri' | 'url';
  referenceAssetIds?: string[];
  aspectRatio?: '9:16' | '16:9';
  resolution?: Seedance2Resolution;
  rawStatus?: string;
  usage?: Record<string, unknown>;
  error?: Record<string, unknown> | string | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getErrorResponseFields = (error: unknown) => {
  const videoError = normalizeVideoGenerationError(error);
  const videoErrorMessage = getVideoGenerationErrorMessage(videoError);
  return {
    ...(videoError ? { videoError } : {}),
    ...(videoErrorMessage ? { videoErrorMessage } : {}),
  };
};

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
) => pendingAssets
  .map((asset) => `${getBlockingAssetLabel(asset)}:${asset.reason}`)
  .join(', ');

const hasTerminalAssetFailure = (
  pendingAssets: Array<{ reason: string }>
) => pendingAssets.some((asset) => asset.reason === 'failed' || asset.reason === 'missing-source');

const getGenerationFailureMessage = (error: unknown) => {
  if (error instanceof AIAPIError) return error.details || error.message;
  if (error instanceof Error) return error.message;
  return String(error);
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
      const metadata = (shot.video_generation_metadata || {}) as VideoGenerationMetadata;
      return NextResponse.json({
        shotId: shot.id,
        videoStatus: shot.video_status,
        videoGenerationId: shot.video_generation_id,
        videoUrl: shot.video_url,
        videoGenerationMetadata: metadata,
        ...getErrorResponseFields(metadata.error),
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
          .select('id, video_status, video_generation_id, video_url, video_generation_metadata')
          .eq('id', shot.id)
          .eq('user_id', user.id)
          .single();
        const metadata = (latestShot?.video_generation_metadata || {}) as VideoGenerationMetadata;

        return NextResponse.json({
          shotId: shot.id,
          videoStatus: latestShot?.video_status || 'queued',
          videoGenerationId: latestShot?.video_generation_id || null,
          videoUrl: latestShot?.video_url || null,
          videoGenerationMetadata: metadata,
          ...getErrorResponseFields(metadata.error),
        });
      }

      const referenceAssets: LocalReferenceAsset[] = [];
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
                preferSourceUrls: isInternationalSeedance2VideoModel(videoConfig.model),
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
                const blockingMessage = formatBlockingAssets(resolvedReferences.pendingAssets);
                if (hasTerminalAssetFailure(resolvedReferences.pendingAssets)) {
                  throw new AIAPIError(
                    'Seedance 2.0 参考素材同步失败，视频生成已停止',
                    422,
                    blockingMessage
                  );
                }
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
        const submissionMetadata = {
          ...((claimedShot.video_generation_metadata || {}) as VideoGenerationMetadata),
          ...(useSeedance2 ? (result.__volcengineMetadata as VideoGenerationMetadata) : {}),
        };
        const nextSubmissionMetadata = taskId
          ? updateVideoGenerationAttempt(submissionMetadata, {
              status: videoStatus,
              generationId: taskId,
              videoUrl: directUrl || null,
              provider: useSeedance2 ? 'volcengine' : 'legacy',
              model: useSeedance2 ? resolvedSeedanceModel : undefined,
              error: null,
            })
          : submissionMetadata;

        if (taskId) {
          await supabase
            .from('shots')
            .update({
              video_generation_id: taskId,
              video_status: videoStatus,
              ...(directUrl ? { video_url: directUrl } : {}),
              video_generation_metadata: nextSubmissionMetadata,
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
          videoGenerationMetadata: nextSubmissionMetadata,
          ...getErrorResponseFields(nextSubmissionMetadata.error),
        });
      } catch (error) {
        if (error instanceof AIAPIError && (error.status === 429 || error.status === 409)) {
          await supabase
            .from('shots')
            .update({
              video_generation_id: null,
              video_status: 'queued',
              video_generation_metadata: updateVideoGenerationAttempt(
                (claimedShot.video_generation_metadata || {}) as VideoGenerationMetadata,
                {
                  status: 'queued',
                  provider: useSeedance2 ? 'volcengine' : 'legacy',
                  model: useSeedance2 ? resolvedSeedanceModel || undefined : undefined,
                  aspectRatio,
                  resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
                  rawStatus: useSeedance2 ? 'waiting_for_assets' : undefined,
                  error: error.details || error.message,
                }
              ),
            })
            .eq('id', claimedShot.id)
            .eq('user_id', user.id)
            .eq('video_generation_id', dispatchPlaceholder);

          return NextResponse.json({
            shotId: claimedShot.id,
            videoStatus: 'queued',
            videoGenerationId: null,
            videoUrl: claimedShot.video_url,
            ...(useSeedance2
              ? {
                  videoGenerationMetadata: {
                    ...updateVideoGenerationAttempt(
                      (claimedShot.video_generation_metadata || {}) as VideoGenerationMetadata,
                      {
                        status: 'queued',
                        provider: 'volcengine',
                        model: resolvedSeedanceModel || undefined,
                        aspectRatio,
                        resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
                        rawStatus: 'waiting_for_assets',
                        error: error.details || error.message,
                      }
                    ),
                  },
                }
              : {}),
          });
        }

        await supabase
          .from('shots')
          .update({
            video_generation_id: null,
            video_status: 'failed',
            video_generation_metadata: updateVideoGenerationAttempt(
              (claimedShot.video_generation_metadata || {}) as VideoGenerationMetadata,
              {
                status: 'failed',
                provider: useSeedance2 ? 'volcengine' : 'legacy',
                model: useSeedance2 && resolvedSeedanceModel ? resolvedSeedanceModel : undefined,
                aspectRatio: useSeedance2 ? aspectRatio : undefined,
                resolution: useSeedance2 ? DEFAULT_SEEDANCE_2_RESOLUTION : undefined,
                rawStatus: useSeedance2 ? 'failed' : undefined,
                error: getGenerationFailureMessage(error),
              }
            ),
          })
          .eq('id', claimedShot.id)
          .eq('user_id', user.id)
          .eq('video_generation_id', dispatchPlaceholder);

        throw error;
      }
    }

    const videoId = shot.video_generation_id;
    if (videoId && videoId.startsWith('pending:')) {
      const metadata = (shot.video_generation_metadata || {}) as VideoGenerationMetadata;
      return NextResponse.json({
        shotId: shot.id,
        videoStatus: 'queued',
        videoGenerationId: null,
        videoUrl: shot.video_url,
        videoGenerationMetadata: metadata,
        ...getErrorResponseFields(metadata.error),
      });
    }
    if (!videoId) {
      const metadata = (shot.video_generation_metadata || {}) as VideoGenerationMetadata;
      return NextResponse.json({
        shotId: shot.id,
        videoStatus: shot.video_status || 'pending',
        videoGenerationId: null,
        videoUrl: shot.video_url,
        videoGenerationMetadata: metadata,
        ...getErrorResponseFields(metadata.error),
      });
    }

    const metadata = ensureVideoGenerationAttempt(
      (shot.video_generation_metadata || {}) as VideoGenerationMetadata,
      {
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
        aspectRatio: resolveVideoAspectRatio(shot, null),
      }
    ) as VideoGenerationMetadata;
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
    const providerError = isVolcengineTask
      ? volcengineSnapshot?.error || null
      : getLegacyVideoStatusError(result);
    if (isVolcengineTask) {
      videoStatus = volcengineSnapshot?.videoStatus || 'processing';
    } else if (['completed', 'succeeded', 'success'].includes(status)) {
      videoStatus = 'completed';
    } else if (['failed', 'error'].includes(status)) {
      videoStatus = 'failed';
    } else {
      videoStatus = 'processing';
    }
    const polledMetadata: VideoGenerationMetadata = isVolcengineTask
      ? mergeVolcengineTaskMetadata(metadata, result)
      : videoStatus === 'failed'
        ? {
            ...metadata,
            provider: metadata.provider || 'legacy',
            rawStatus: status || metadata.rawStatus || 'failed',
            error: providerError || metadata.error || null,
          }
        : metadata;
    const nextMetadata = updateVideoGenerationAttempt(polledMetadata, {
      status: videoStatus,
      generationId: videoId,
      videoUrl: directUrl || shot.video_url || null,
      provider: isVolcengineTask ? 'volcengine' : metadata.provider || 'legacy',
      rawStatus: status || metadata.rawStatus,
      error: videoStatus === 'failed' ? providerError || metadata.error || null : null,
    });

    await supabase
      .from('shots')
      .update({
        video_status: videoStatus,
        ...(directUrl ? { video_url: directUrl } : {}),
        video_generation_metadata: nextMetadata,
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
      videoGenerationMetadata: nextMetadata,
      ...getErrorResponseFields(nextMetadata.error),
    });
  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          ...getErrorResponseFields(error.details || error.message),
        },
        { status: error.status }
      );
    }
    const err = error as { message?: string };
    return NextResponse.json(
      {
        error: err.message || 'Internal Server Error',
        ...getErrorResponseFields(err.message),
      },
      { status: 500 }
    );
  }
}
