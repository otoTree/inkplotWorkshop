import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeConfig = (value: unknown) => {
  const input = asRecord(value);
  const dailyTime =
    typeof input.dailyTime === 'string' && /^\d{2}:\d{2}$/.test(input.dailyTime)
      ? input.dailyTime
      : '09:00';
  const onceRunAt =
    typeof input.onceRunAt === 'string' && input.onceRunAt.trim()
      ? input.onceRunAt.trim()
      : undefined;
  const intervalStartAt =
    typeof input.intervalStartAt === 'string' && input.intervalStartAt.trim()
      ? input.intervalStartAt.trim()
      : undefined;
  return {
    episodeFrom: Math.max(1, Number(input.episodeFrom) || 1),
    episodeTo: Number(input.episodeTo) || undefined,
    skipExistingShots: input.skipExistingShots !== false,
    autoQueueVideo: input.autoQueueVideo !== false,
    requireReview: input.requireReview === true,
    videoAspectRatio:
      typeof input.videoAspectRatio === 'string' ? input.videoAspectRatio : undefined,
    dailyTime,
    onceRunAt,
    intervalStartAt,
  };
};

const parseClientDateTime = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const isoLike = /(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed)
    ? trimmed
    : `${trimmed}:00+08:00`;
  const date = new Date(isoLike);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getNextDailyRunAt = (dailyTime: string) => {
  const [hour, minute] = dailyTime.split(':').map(Number);
  const now = new Date();
  const localNowMs = now.getTime() + 8 * 60 * 60_000;
  const localNow = new Date(localNowMs);
  const localRun = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    Number.isFinite(hour) ? hour : 9,
    Number.isFinite(minute) ? minute : 0,
    0,
    0
  ));
  if (localRun.getTime() <= localNowMs) {
    localRun.setUTCDate(localRun.getUTCDate() + 1);
  }
  return new Date(localRun.getTime() - 8 * 60 * 60_000).toISOString();
};

const resolveInitialNextRunAt = ({
  scheduleType,
  runNow,
  intervalMinutes,
  config,
  nextRunAt,
}: {
  scheduleType: string;
  runNow: boolean;
  intervalMinutes: number | null;
  config: ReturnType<typeof normalizeConfig>;
  nextRunAt?: unknown;
}) => {
  const explicitNextRunAt = parseClientDateTime(nextRunAt);
  if (explicitNextRunAt) return explicitNextRunAt;

  if (scheduleType === 'manual') {
    return runNow ? new Date().toISOString() : null;
  }
  if (scheduleType === 'once') {
    return parseClientDateTime(config.onceRunAt) || new Date().toISOString();
  }
  if (scheduleType === 'daily') {
    return getNextDailyRunAt(config.dailyTime);
  }
  if (scheduleType === 'interval') {
    const intervalStartAt = parseClientDateTime(config.intervalStartAt);
    if (intervalStartAt) return intervalStartAt;
    if (runNow) return new Date().toISOString();
    const minutes = Math.max(1, Number(intervalMinutes) || 60);
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }
  return null;
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
      body.scheduleType === 'once' ||
      body.scheduleType === 'manual'
        ? body.scheduleType
        : 'manual';
    const intervalMinutes =
      scheduleType === 'interval'
        ? Math.max(1, Number(body.intervalMinutes) || 60)
        : null;
    const shouldRunNow = body.runNow !== false;
    const config = normalizeConfig(body.config);
    const nextRunAt = resolveInitialNextRunAt({
      scheduleType,
      runNow: shouldRunNow,
      intervalMinutes,
      config,
      nextRunAt: body.nextRunAt,
    });

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
        config,
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
