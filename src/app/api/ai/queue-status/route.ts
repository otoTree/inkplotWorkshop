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
      return NextResponse.json({ position: 0 });
    }

    // Find the shot to get its updated_at timestamp
    const { data: shot } = await supabase
      .from('shots')
      .select('updated_at, video_status')
      .eq('id', jobId)
      .single();

    if (!shot || shot.video_status !== 'queued') {
      return NextResponse.json({ position: 0 });
    }

    // Count how many queued shots have an older updated_at
    const { count, error } = await supabase
      .from('shots')
      .select('*', { count: 'exact', head: true })
      .eq('video_status', 'queued')
      .lt('updated_at', shot.updated_at);

    if (error) {
      console.error('Queue status check error:', error);
      return NextResponse.json({ position: 0 });
    }

    // position is the count of older items + 1
    return NextResponse.json({ 
      position: (count || 0) + 1 
    });
  } catch (error) {
    console.error('Queue status check error:', error);
    return NextResponse.json({ position: 0 });
  }
}
