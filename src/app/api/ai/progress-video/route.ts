import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  AIAPIError,
  callAIVideoGeneration,
  completeVideoTask,
  getAIVideoStatus,
} from '@/lib/ai-server';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { shotId } = body;

    if (!shotId || typeof shotId !== 'string') {
      return NextResponse.json({ error: 'Missing shotId' }, { status: 400 });
    }

    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*')
      .eq('id', shotId)
      .eq('user_id', user.id)
      .single();

    if (shotError || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    if (shot.video_status === 'completed' || shot.video_status === 'failed') {
      return NextResponse.json({
        shotId: shot.id,
        videoStatus: shot.video_status,
        videoGenerationId: shot.video_generation_id,
        videoUrl: shot.video_url,
      });
    }

    if (shot.video_status === 'queued' && !shot.video_generation_id) {
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

      const allImages = [];
      if (shot.reference_image) allImages.push(shot.reference_image);
      if (shot.related_asset_ids && shot.related_asset_ids.length > 0) {
        const { data: assets } = await supabase
          .from('assets')
          .select('image_url')
          .in('id', shot.related_asset_ids);
        if (assets) {
          assets.forEach((asset) => {
            if (asset.image_url) allImages.push(asset.image_url);
          });
        }
      }

      try {
        const result = await callAIVideoGeneration(
          fullPrompt,
          shot.duration || 5,
          {
            multi_shot: false,
            aspect_ratio: '9:16',
            sound: 'on',
            images: allImages.length > 0 ? allImages : undefined,
          },
          undefined,
          shot.id,
          false
        );

        const taskId = result.task_id || result.id || result.data?.task_id || result.data?.id;
        const directUrl = result.url || result.video_url || result.data?.url || result.data?.video_url;
        const status = (result.status || result.data?.status || 'processing').toLowerCase();
        const videoStatus = ['completed', 'succeeded', 'success'].includes(status) ? 'completed' : 'processing';

        if (taskId) {
          await supabase
            .from('shots')
            .update({
              video_generation_id: taskId,
              video_status: videoStatus,
              ...(directUrl ? { video_url: directUrl } : {}),
            })
            .eq('id', shot.id)
            .eq('user_id', user.id);
        }

        if (['completed', 'failed', 'error', 'success', 'succeeded'].includes(status)) {
          await completeVideoTask(taskId);
        }

        return NextResponse.json({
          shotId: shot.id,
          videoStatus,
          videoGenerationId: taskId || null,
          videoUrl: directUrl || null,
          providerStatus: status,
        });
      } catch (error) {
        if (error instanceof AIAPIError && error.status === 429) {
          return NextResponse.json({
            shotId: shot.id,
            videoStatus: 'queued',
            videoGenerationId: shot.video_generation_id,
            videoUrl: shot.video_url,
          });
        }
        throw error;
      }
    }

    const videoId = shot.video_generation_id;
    if (!videoId) {
      return NextResponse.json({
        shotId: shot.id,
        videoStatus: shot.video_status || 'pending',
        videoGenerationId: null,
        videoUrl: shot.video_url,
      });
    }

    const result = await getAIVideoStatus(videoId);
    const statusInfo = result.data || result;
    const status = (statusInfo.status || '').toLowerCase();
    const directUrl =
      statusInfo.url ||
      statusInfo.video_url ||
      (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url)) ||
      null;

    let videoStatus = shot.video_status || 'processing';
    if (['completed', 'succeeded', 'success'].includes(status)) {
      videoStatus = 'completed';
    } else if (['failed', 'error'].includes(status)) {
      videoStatus = 'failed';
    } else {
      videoStatus = 'processing';
    }

    await supabase
      .from('shots')
      .update({
        video_status: videoStatus,
        ...(directUrl ? { video_url: directUrl } : {}),
      })
      .eq('id', shot.id)
      .eq('user_id', user.id);

    if (videoStatus === 'completed' || videoStatus === 'failed') {
      await completeVideoTask(videoId);
    }

    return NextResponse.json({
      shotId: shot.id,
      videoStatus,
      videoGenerationId: videoId,
      videoUrl: directUrl || shot.video_url || null,
      providerStatus: status,
    });
  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
