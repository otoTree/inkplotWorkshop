import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, getAIVideoStatus, completeVideoTask } from '@/lib/ai-server';
import {
  getVideoGenerationErrorMessage,
  normalizeVideoGenerationError,
} from '@/lib/video-generation-error';
import {
  getVolcengineTaskSnapshot,
  getSeedance2VideoTask,
  mergeVolcengineTaskMetadata,
} from '@/lib/volcengine/video-client';
import { inferVideoTaskProvider } from '@/lib/volcengine/video-compat';
import { updateVideoGenerationAttempt } from '@/lib/video-generation-history';

export const maxDuration = 120;

type VideoGenerationMetadata = {
  provider?: string;
  model?: string;
  requestContentMode?: 'asset_uri' | 'url';
  referenceAssetIds?: string[];
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

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { videoId } = body;
    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    const { data: shotForProvider } = await supabase
      .from('shots')
      .select('id, video_generation_metadata')
      .eq('video_generation_id', videoId)
      .eq('user_id', user.id)
      .maybeSingle();

    const metadata = (shotForProvider?.video_generation_metadata || {}) as VideoGenerationMetadata;
    const isVolcengineTask = inferVideoTaskProvider(videoId, metadata) === 'volcengine';

    const result = isVolcengineTask
      ? await getSeedance2VideoTask(videoId)
      : await getAIVideoStatus(videoId);
    const statusInfo = result.data || result;
    const volcengineSnapshot = isVolcengineTask ? getVolcengineTaskSnapshot(result) : null;
    const status = isVolcengineTask
      ? volcengineSnapshot?.rawStatus || ''
      : (statusInfo.status || '').toLowerCase();
    const mappedVolcengineStatus = isVolcengineTask ? volcengineSnapshot?.videoStatus || 'processing' : null;
    const providerError = isVolcengineTask
      ? volcengineSnapshot?.error || null
      : getLegacyVideoStatusError(result);
    let nextMetadata: VideoGenerationMetadata = metadata;
    
    if ((isVolcengineTask && mappedVolcengineStatus === 'completed') || (!isVolcengineTask && ['completed', 'succeeded', 'success'].includes(status))) {
      const directUrl =
        (isVolcengineTask ? volcengineSnapshot?.videoUrl || null : null) ||
        statusInfo.url ||
        statusInfo.video_url ||
        statusInfo.content?.video_url ||
        (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url || statusInfo.data.content?.video_url)) ||
        `/api/ai/download-video?videoId=${videoId}`;
      nextMetadata = updateVideoGenerationAttempt(
        isVolcengineTask ? mergeVolcengineTaskMetadata(metadata, result) : metadata,
        {
          status: 'completed',
          generationId: videoId,
          videoUrl: directUrl,
          provider: isVolcengineTask ? 'volcengine' : metadata.provider || 'legacy',
          rawStatus: status || metadata.rawStatus,
          error: null,
        }
      );

      const { error: updateError } = await supabase
        .from('shots')
        .update({
          video_status: 'completed',
          video_url: directUrl,
          video_generation_metadata: nextMetadata,
        })
        .eq('video_generation_id', videoId)
        .eq('user_id', user.id)
        .select('id');

      if (updateError) {
          console.error('Failed to persist completed video status:', updateError);
        }
    } else if ((isVolcengineTask && mappedVolcengineStatus === 'failed') || (!isVolcengineTask && ['failed', 'error'].includes(status))) {
      nextMetadata = updateVideoGenerationAttempt(
        isVolcengineTask
          ? mergeVolcengineTaskMetadata(metadata, result)
          : {
              ...metadata,
              provider: metadata.provider || 'legacy',
              rawStatus: status || metadata.rawStatus || 'failed',
              error: providerError || metadata.error || null,
            },
        {
          status: 'failed',
          generationId: videoId,
          provider: isVolcengineTask ? 'volcengine' : metadata.provider || 'legacy',
          rawStatus: status || metadata.rawStatus || 'failed',
          error: providerError || metadata.error || null,
        }
      );
      const { error: updateError } = await supabase
        .from('shots')
        .update({
          video_status: 'failed',
          video_generation_metadata: nextMetadata,
        })
        .eq('video_generation_id', videoId)
        .eq('user_id', user.id)
        .select('id');

      if (updateError) {
        console.error('Failed to persist failed video status:', updateError);
      }
    }

    // If the task has finished (success or failure), remove it from the global active tasks set
    if (
      (isVolcengineTask && (mappedVolcengineStatus === 'completed' || mappedVolcengineStatus === 'failed')) ||
      (!isVolcengineTask && ['completed', 'succeeded', 'success', 'failed', 'error'].includes(status))
    ) {
      await completeVideoTask(videoId);
    }

    const payload = asRecord(result);
    return NextResponse.json({
      ...payload,
      videoStatus: isVolcengineTask ? mappedVolcengineStatus : undefined,
      videoGenerationMetadata: nextMetadata,
      ...getErrorResponseFields(nextMetadata.error || providerError),
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
