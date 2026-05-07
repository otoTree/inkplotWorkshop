import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, getAIVideoStatus, completeVideoTask } from '@/lib/ai-server';
import {
  getVolcengineTaskSnapshot,
  getSeedance2VideoTask,
  mergeVolcengineTaskMetadata,
} from '@/lib/volcengine/video-client';
import { inferVideoTaskProvider } from '@/lib/volcengine/video-compat';

export const maxDuration = 120;

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

    const metadata = (shotForProvider?.video_generation_metadata || {}) as {
      provider?: string;
      model?: string;
      requestContentMode?: 'asset_uri' | 'url';
      referenceAssetIds?: string[];
      rawStatus?: string;
      usage?: Record<string, unknown>;
      error?: Record<string, unknown> | string | null;
    };
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
    
    if ((isVolcengineTask && mappedVolcengineStatus === 'completed') || (!isVolcengineTask && ['completed', 'succeeded', 'success'].includes(status))) {
      const directUrl =
        (isVolcengineTask ? volcengineSnapshot?.videoUrl || null : null) ||
        statusInfo.url ||
        statusInfo.video_url ||
        statusInfo.content?.video_url ||
        (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url || statusInfo.data.content?.video_url)) ||
        `/api/ai/download-video?videoId=${videoId}`;

      const { error: updateError } = await supabase
        .from('shots')
        .update({
          video_status: 'completed',
          video_url: directUrl,
          ...(isVolcengineTask
            ? {
                video_generation_metadata: mergeVolcengineTaskMetadata(metadata, result),
              }
            : {}),
        })
        .eq('video_generation_id', videoId)
        .eq('user_id', user.id)
        .select('id');

      if (updateError) {
        console.error('Failed to persist completed video status:', updateError);
      }
    } else if ((isVolcengineTask && mappedVolcengineStatus === 'failed') || (!isVolcengineTask && ['failed', 'error'].includes(status))) {
      const { error: updateError } = await supabase
        .from('shots')
        .update({
          video_status: 'failed',
          ...(isVolcengineTask
            ? {
                video_generation_metadata: mergeVolcengineTaskMetadata(metadata, result),
              }
            : {}),
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

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
