import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, getAIVideoStatus, completeVideoTask } from '@/lib/ai-server';

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

    const result = await getAIVideoStatus(videoId);
    const statusInfo = result.data || result;
    const status = (statusInfo.status || '').toLowerCase();
    
    if (['completed', 'succeeded', 'success'].includes(status)) {
      const directUrl =
        statusInfo.url ||
        statusInfo.video_url ||
        (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url)) ||
        `/api/ai/download-video?videoId=${videoId}`;

      const { error: updateError } = await supabase
        .from('shots')
        .update({
          video_status: 'completed',
          video_url: directUrl,
        })
        .eq('video_generation_id', videoId)
        .eq('user_id', user.id)
        .select('id');

      if (updateError) {
        console.error('Failed to persist completed video status:', updateError);
      }
    } else if (['failed', 'error'].includes(status)) {
      const { error: updateError } = await supabase
        .from('shots')
        .update({
          video_status: 'failed',
        })
        .eq('video_generation_id', videoId)
        .eq('user_id', user.id)
        .select('id');

      if (updateError) {
        console.error('Failed to persist failed video status:', updateError);
      }
    }

    // If the task has finished (success or failure), remove it from the global active tasks set
    if (['completed', 'succeeded', 'success', 'failed', 'error'].includes(status)) {
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
