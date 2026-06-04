import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_SEEDANCE_2_RESOLUTION,
  normalizeSeedance2AspectRatio,
} from '@/lib/volcengine/video-payload';
import {
  buildVideoGenerationAttemptDescription,
  startVideoGenerationAttempt,
} from '@/lib/video-generation-history';

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

    let queuedMetadata: ReturnType<typeof startVideoGenerationAttempt> | null = null;

    if (shotId) {
      const { data: shot } = await supabase
        .from('shots')
        .select('id, video_generation_metadata, description, scene_label, character_action, emotion, lighting_atmosphere, camera, size, dialogue, sound_effect, video_prompt')
        .eq('id', shotId)
        .eq('user_id', user.id)
        .maybeSingle();
      const nextMetadata = startVideoGenerationAttempt(
        shot?.video_generation_metadata,
        {
          prompt,
          description: buildVideoGenerationAttemptDescription({
            videoPrompt: prompt,
            description: shot?.description,
            sceneLabel: shot?.scene_label,
            characterAction: shot?.character_action,
            emotion: shot?.emotion,
            lightingAtmosphere: shot?.lighting_atmosphere,
            camera: shot?.camera,
            size: shot?.size,
            dialogue: shot?.dialogue,
            soundEffect: shot?.sound_effect,
          }),
          aspectRatio,
          resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
        }
      );
      queuedMetadata = nextMetadata;
      const { error: queueError } = await supabase
        .from('shots')
        .update({
          video_status: 'queued',
          video_generation_id: null,
          video_generation_metadata: nextMetadata,
        })
        .eq('id', shotId)
        .eq('user_id', user.id)
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
      shotId: shotId || null,
      ...(queuedMetadata ? { videoGenerationMetadata: queuedMetadata } : {}),
    });
  } catch (error) {
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
