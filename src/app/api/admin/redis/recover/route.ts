import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAIVideoStatus, completeVideoTask, getShotIdByVideoTaskId } from '@/lib/ai-server';

export async function POST(req: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Check for a special "reset-all" command
    if (body.action === 'reset-stuck-shots') {
      const supabase = createAdminClient();
      // Only reset queued records that still do not have a real upstream task ID.
      const { data: queuedShots, error: queryError } = await supabase
        .from('shots')
        .select('id, video_generation_id')
        .eq('video_status', 'queued');

      if (queryError) throw queryError;

      const resettableIds = (queuedShots || [])
        .filter((shot) => {
          const generationId = shot.video_generation_id;
          return !generationId || generationId.startsWith('pending:') || generationId.startsWith('job_');
        })
        .map((shot) => shot.id);

      if (resettableIds.length === 0) {
        return NextResponse.json({
          success: true,
          message: '没有可重置的 queued 镜头：当前排队中的镜头都已经拿到真实任务 ID。',
        });
      }

      const { data, error } = await supabase
        .from('shots')
        .update({ video_status: 'pending', video_generation_id: null })
        .in('id', resettableIds)
        .select('id');
        
      if (error) throw error;
      return NextResponse.json({
        success: true,
        message: `已重置 ${data.length} 个仍处于 queued 且尚未拿到真实任务 ID 的镜头为 pending`,
      });
    }

    const videoIds = Array.isArray(body.videoIds) ? body.videoIds : (body.videoId ? [body.videoId] : []);

    if (videoIds.length === 0) {
      return NextResponse.json({ error: 'Missing videoId(s)' }, { status: 400 });
    }

    const results = [];
    const supabase = createAdminClient();

    // Process sequentially or in small batches to avoid rate limits
    for (const videoId of videoIds) {
      try {
        if (videoId.startsWith('pending:') || videoId.startsWith('job_')) {
          results.push({ videoId, status: 'skipped', message: 'Not a real task ID' });
          continue;
        }

        // 1. Query the AI provider for the actual status
        const providerStatus = await getAIVideoStatus(videoId);
        const statusInfo = providerStatus.data || providerStatus;
        const status = (statusInfo.status || '').toLowerCase();
        
        let dbStatus = 'processing';
        let videoUrl = null;
        const mappedShotId = await getShotIdByVideoTaskId(videoId);

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
        let updatedShotsCount = 0;
        if (dbStatus !== 'processing') {
          if (mappedShotId) {
            const { data: updatedShots, error: dbError } = await supabase
              .from('shots')
              .update({
                video_generation_id: videoId,
                video_status: dbStatus,
                ...(videoUrl ? { video_url: videoUrl } : {})
              })
              .eq('id', mappedShotId)
              .select('id');

            if (!dbError) {
              updatedShotsCount = updatedShots?.length || 0;
            }
          }

          if (updatedShotsCount === 0) {
            // Fallback for legacy records where we only stored video_generation_id in shots.
            const { data: updatedShots, error: dbError } = await supabase
              .from('shots')
              .update({
                video_status: dbStatus,
                ...(videoUrl ? { video_url: videoUrl } : {})
              })
              .eq('video_generation_id', videoId)
              .select('id');

            if (!dbError) {
               updatedShotsCount = updatedShots?.length || 0;
            }
          }

          // 3. Clean up Redis if it's finished
          await completeVideoTask(videoId);
        }

        results.push({
          videoId,
          success: true,
          providerStatus: status,
          dbStatus,
          updatedShotsCount,
          mappedShotId
        });

      } catch (err: any) {
        results.push({ videoId, success: false, error: err.message });
      }
    }

    // For backwards compatibility with single request, return single object format if only 1 ID was sent
    if (!Array.isArray(body.videoIds) && results.length === 1) {
      if (!results[0].success) {
         return NextResponse.json({ error: results[0].error }, { status: 500 });
      }
      return NextResponse.json(results[0]);
    }

    return NextResponse.json({ 
      success: true, 
      processed: results.length,
      results
    });

  } catch (err) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
  }
}
