import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId'); // In our case, jobId is shot.id
    
    if (!jobId) {
      return NextResponse.json({ position: 0, videoStatus: null, videoGenerationId: null, videoUrl: null });
    }

    // Return the latest shot state so the client can switch from queued to processing/completed.
    const { data: shot } = await supabase
      .from('shots')
      .select('updated_at, video_status, video_generation_id, video_url')
      .eq('id', jobId)
      .single();

    if (!shot) {
      return NextResponse.json({ position: 0, videoStatus: null, videoGenerationId: null, videoUrl: null });
    }

    if (shot.video_status !== 'queued') {
      return NextResponse.json({
        position: 0,
        videoStatus: shot.video_status,
        videoGenerationId: shot.video_generation_id,
        videoUrl: shot.video_url,
      });
    }

    // Count how many queued shots have an older updated_at
    const { count, error } = await supabase
      .from('shots')
      .select('*', { count: 'exact', head: true })
      .eq('video_status', 'queued')
      .lt('updated_at', shot.updated_at);

    if (error) {
      console.error('Queue status check error:', error);
      return NextResponse.json({
        position: 0,
        videoStatus: shot.video_status,
        videoGenerationId: shot.video_generation_id,
        videoUrl: shot.video_url,
      });
    }

    // position is the count of older items + 1
    return NextResponse.json({ 
      position: (count || 0) + 1,
      videoStatus: shot.video_status,
      videoGenerationId: shot.video_generation_id,
      videoUrl: shot.video_url,
    });
  } catch (error) {
    console.error('Queue status check error:', error);
    return NextResponse.json({ position: 0, videoStatus: null, videoGenerationId: null, videoUrl: null });
  }
}
