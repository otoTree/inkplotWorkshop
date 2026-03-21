import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAIVideoStatus, completeVideoTask, callAIVideoGeneration } from '@/lib/ai-server';

// Optional: Force dynamic so Vercel doesn't cache the cron route
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // 1. Verify Vercel Cron Secret (optional but highly recommended for security)
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET && 
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // === PART 1: SYNC PROCESSING SHOTS ===
    const { data: processingShots } = await supabase
      .from('shots')
      .select('id, video_generation_id, video_status')
      .eq('video_status', 'processing')
      .not('video_generation_id', 'is', null);

    const syncResults = [];

    if (processingShots && processingShots.length > 0) {
      for (const shot of processingShots) {
        const videoId = shot.video_generation_id;
        if (!videoId || videoId.startsWith('pending:') || videoId.startsWith('job_')) continue;

        try {
          const providerStatus = await getAIVideoStatus(videoId);
          const statusInfo = providerStatus.data || providerStatus;
          const status = (statusInfo.status || '').toLowerCase();
          
          let dbStatus = 'processing';
          let videoUrl = null;

          if (['completed', 'succeeded', 'success'].includes(status)) {
            dbStatus = 'completed';
            videoUrl = statusInfo.url || statusInfo.video_url || (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url));
            if (!videoUrl) {
               videoUrl = `/api/ai/download-video?videoId=${videoId}`;
            }
          } else if (['failed', 'error'].includes(status)) {
            dbStatus = 'failed';
          }

          if (dbStatus !== 'processing') {
            await supabase
              .from('shots')
              .update({
                video_status: dbStatus,
                ...(videoUrl ? { video_url: videoUrl } : {})
              })
              .eq('id', shot.id);

            await completeVideoTask(videoId);
            syncResults.push({ id: shot.id, videoId, status: dbStatus });
          }
        } catch (err: any) {
          console.error(`Failed to check/update status for videoId ${videoId}:`, err.message);
          syncResults.push({ id: shot.id, videoId, error: err.message });
        }
      }
    }

    // === PART 2: PROCESS QUEUED SHOTS ===
    const { data: queuedShots } = await supabase
      .from('shots')
      .select('*')
      .eq('video_status', 'queued')
      .order('updated_at', { ascending: true }) // FIFO
      .limit(50); // Process up to 50 items per minute

    const queueResults = [];

    if (queuedShots && queuedShots.length > 0) {
      // Process sequentially to prevent overwhelming our API limits or DB, 
      // but tryAcquireVideoSlot will protect AI concurrency.
      for (const shot of queuedShots) {
        try {
          const fullPrompt = [
            shot.video_prompt ? `[Video Prompt] ${shot.video_prompt}` : '',
            shot.description ? `[Visual Description] ${shot.description}` : '',
            shot.character_action ? `[Action] ${shot.character_action}` : '',
            shot.lighting_atmosphere ? `[Lighting/Atmosphere] ${shot.lighting_atmosphere}` : '',
            shot.scene_label ? `[Scene] ${shot.scene_label}` : '',
            shot.emotion ? `[Emotion] ${shot.emotion}` : '',
            (shot.camera || shot.size) ? `[Camera/Size] ${shot.camera || ''} ${shot.size || ''}`.trim() : '',
            shot.dialogue ? `[Dialogue] ${shot.dialogue}` : '',
            shot.sound_effect ? `[Sound Effect] ${shot.sound_effect}` : '',
          ].filter(Boolean).join('\n');

          // Collect images. We need related assets but Cron doesn't easily have them unless we query.
          // For now, if we don't have all assets here, it might be better to store `metadata.images` when queuing.
          // Wait, the frontend didn't store metadata.images in the shot!
          // We must ensure the AI gets the images.
          // Let's query related assets if needed, but since we are in Cron, we can do it.
          const allImages = [];
          if (shot.reference_image) allImages.push(shot.reference_image);
          if (shot.related_asset_ids && shot.related_asset_ids.length > 0) {
             const { data: assets } = await supabase.from('assets').select('image_url').in('id', shot.related_asset_ids);
             if (assets) {
               assets.forEach(a => { if (a.image_url) allImages.push(a.image_url); });
             }
          }

          const result = await callAIVideoGeneration(
            fullPrompt,
            shot.duration || 5,
            {
              multi_shot: false,
              aspect_ratio: "9:16",
              sound: "on",
              images: allImages.length > 0 ? allImages : undefined
            },
            undefined,
            shot.id,
            false // allowQueueing = false, meaning if no slot, throw 429 so we don't change DB state
          );

          // If successful, update DB
          const taskId = result.task_id || result.id || result.data?.task_id || result.data?.id;
          if (taskId) {
            const directUrl = result.url || result.video_url || result.data?.url || result.data?.video_url;
            const status = (result.status || result.data?.status || 'processing').toLowerCase();
            const videoStatus = ['completed', 'succeeded', 'success'].includes(status) ? 'completed' : 'processing';

            await supabase.from('shots').update({
              video_generation_id: taskId,
              video_status: videoStatus,
              ...(directUrl ? { video_url: directUrl } : {})
            }).eq('id', shot.id);

            // Also replace the placeholder in active queue with the real taskId
            try {
              const { tryAcquireVideoSlot } = await import('@/lib/ai-server');
              const { getAIAPIConfig } = await import('@/lib/ai-server');
              const config = getAIAPIConfig();
              const redis = (await import('@upstash/redis')).Redis.fromEnv();
              const baseKey = `video_concurrency:${config.baseUrl}|${config.apiKey}|${config.maxConcurrency}`;
              const activeKey = `${baseKey}:active`;
              
              // We replace the pending:shot.id with the real taskId so `recover` can find it next time if it gets stuck
              await redis.zrem(activeKey, `pending:${shot.id}`);
              await redis.zadd(activeKey, { score: Date.now() + 15 * 60 * 1000, member: taskId });
            } catch (redisErr) {
              console.error('Failed to commit real taskId to Redis in cron:', redisErr);
            }

            queueResults.push({ id: shot.id, taskId, status: videoStatus });
          }

        } catch (err: any) {
          if (err.status === 429 || err.message?.includes('capacity')) {
             // Slots are full, stop processing the queue for this minute
             break;
          } else {
            console.error(`Failed to start video for queued shot ${shot.id}:`, err.message);
            // Don't fail the shot immediately if it's a temporary error, but maybe after retries?
            // For now, keep it queued so it retries next minute.
          }
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      syncProcessed: processingShots?.length || 0,
      syncUpdated: syncResults.length,
      queueProcessed: queueResults.length,
      syncResults,
      queueResults
    });

  } catch (err: any) {
    console.error('Cron job error:', err);
    return NextResponse.json({ error: err.message || 'Internal Error' }, { status: 500 });
  }
}
