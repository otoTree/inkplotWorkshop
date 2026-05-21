import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_SEEDANCE_2_RESOLUTION,
  normalizeSeedance2AspectRatio,
} from '@/lib/volcengine/video-payload';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, shotId, metadata } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const aspectRatio = normalizeSeedance2AspectRatio(
      metadata && typeof metadata === 'object' && metadata !== null && 'aspect_ratio' in metadata
        ? String((metadata as { aspect_ratio?: string }).aspect_ratio)
        : undefined
    );

    if (shotId) {
      const { error: queueError } = await supabase
        .from('shots')
        .update({
          video_status: 'queued',
          video_generation_id: null,
          video_generation_metadata: {
            aspectRatio,
            resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
          },
        })
        .eq('id', shotId)
        .select('id');

      if (queueError) {
        console.error('Failed to set queued status in DB:', queueError);
      }
    }

    return NextResponse.json({
      status: 'queued',
      message: 'Added to background queue',
      task_id: null,
      position: null,
    });
  } catch (error) {
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
