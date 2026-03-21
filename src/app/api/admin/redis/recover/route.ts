import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAIVideoStatus, completeVideoTask } from '@/lib/ai-server';

export async function POST(req: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { videoId } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    // 1. Query the AI provider for the actual status
    let providerStatus: any;
    try {
      providerStatus = await getAIVideoStatus(videoId);
    } catch (err: any) {
      return NextResponse.json({ error: `Failed to fetch status from AI provider: ${err.message}` }, { status: 500 });
    }

    const statusInfo = providerStatus.data || providerStatus;
    const status = (statusInfo.status || '').toLowerCase();
    
    let dbStatus = 'processing';
    let videoUrl = null;

    if (['completed', 'succeeded', 'success'].includes(status)) {
      dbStatus = 'completed';
      videoUrl = statusInfo.url || statusInfo.video_url || (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url));
      // Ensure we have a download fallback if direct URL is not present
      if (!videoUrl) {
         videoUrl = `/api/ai/download-video?videoId=${videoId}`;
      }
    } else if (['failed', 'error'].includes(status)) {
      dbStatus = 'failed';
    }

    // 2. Update the Supabase database
    const supabase = createAdminClient();
    const { data: updatedShots, error: dbError } = await supabase
      .from('shots')
      .update({
        video_status: dbStatus,
        ...(videoUrl ? { video_url: videoUrl } : {})
      })
      .eq('video_generation_id', videoId)
      .select();

    if (dbError) {
      return NextResponse.json({ error: `Failed to update database: ${dbError.message}` }, { status: 500 });
    }

    // 3. Clean up Redis if it's finished
    if (['completed', 'failed'].includes(dbStatus)) {
      await completeVideoTask(videoId);
    }

    return NextResponse.json({ 
      success: true, 
      providerStatus: status,
      dbStatus,
      updatedShotsCount: updatedShots?.length || 0 
    });

  } catch (err) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
  }
}
