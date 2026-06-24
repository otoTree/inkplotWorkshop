import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeConfig = (value: unknown) => {
  const input = asRecord(value);
  return {
    episodeFrom: Math.max(1, Number(input.episodeFrom) || 1),
    episodeTo: Number(input.episodeTo) || undefined,
    episodesPerRun: Math.max(1, Math.min(5, Number(input.episodesPerRun) || 1)),
    skipExistingShots: input.skipExistingShots !== false,
    autoQueueVideo: input.autoQueueVideo !== false,
    requireReview: input.requireReview === true,
    videoAspectRatio:
      typeof input.videoAspectRatio === 'string' ? input.videoAspectRatio : undefined,
  };
};

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('production_plans')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ plans: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message || 'Internal Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const mode =
      body.mode === 'storyboard_only' ||
      body.mode === 'storyboard_then_video' ||
      body.mode === 'video_only'
        ? body.mode
        : 'storyboard_then_video';
    const scheduleType =
      body.scheduleType === 'interval' ||
      body.scheduleType === 'daily' ||
      body.scheduleType === 'manual'
        ? body.scheduleType
        : 'manual';
    const intervalMinutes =
      scheduleType === 'interval'
        ? Math.max(1, Number(body.intervalMinutes) || 60)
        : null;
    const shouldRunNow = body.runNow !== false;
    const nextRunAt =
      typeof body.nextRunAt === 'string'
        ? body.nextRunAt
        : shouldRunNow
          ? new Date().toISOString()
          : null;

    const { data, error } = await supabase
      .from('production_plans')
      .insert({
        user_id: user.id,
        project_id: projectId,
        title:
          typeof body.title === 'string' && body.title.trim()
            ? body.title.trim()
            : '分镜视频生产计划',
        status: body.status === 'paused' ? 'paused' : 'active',
        mode,
        schedule_type: scheduleType,
        interval_minutes: intervalMinutes,
        timezone:
          typeof body.timezone === 'string' && body.timezone.trim()
            ? body.timezone.trim()
            : 'Asia/Shanghai',
        next_run_at: nextRunAt,
        config: normalizeConfig(body.config),
        cursor: {},
      })
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ plan: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message || 'Internal Error' }, { status: 500 });
  }
}
