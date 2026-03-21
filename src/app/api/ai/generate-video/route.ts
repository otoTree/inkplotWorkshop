import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIVideoGeneration } from '@/lib/ai-server';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, duration = 15, metadata, jobId, shotId } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    let result;
    try {
      result = await callAIVideoGeneration(
        prompt,
        Number(duration) || 15,
        metadata || undefined,
        undefined,
        jobId,
        true // allow queueing
      );
    } catch (apiError) {
      if (shotId) {
        await supabase.from('shots').update({
          video_status: 'failed'
        }).eq('id', shotId);
      }
      throw apiError;
    }

    if (shotId) {
      if (result.status === 'queued') {
        const { error: queueError } = await supabase.from('shots').update({
          video_status: 'queued'
        }).eq('id', shotId).select('id');
        if (queueError) {
          console.error('Failed to set queued status in DB:', queueError);
        }
      } else {
        const taskId = result.task_id || result.id || result.data?.task_id || result.data?.id;
        if (taskId) {
          const directUrl = result.url || result.video_url || result.data?.url || result.data?.video_url;
          const status = (result.status || result.data?.status || 'processing').toLowerCase();
          const videoStatus = ['completed', 'succeeded', 'success'].includes(status) ? 'completed' : 'processing';

          const { error: updateError } = await supabase.from('shots').update({
            video_generation_id: taskId,
            video_status: videoStatus,
            ...(directUrl ? { video_url: directUrl } : {})
          })
          .eq('id', shotId)
          .select('id');
          
          if (updateError) {
             console.error('Failed to update shot in /api/ai/generate-video:', updateError);
          }
        }
      }
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
