import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeConfig = (value: unknown) => {
  const input = asRecord(value);
  const config: Record<string, unknown> = {};
  if (input.episodeFrom !== undefined) config.episodeFrom = Math.max(1, Number(input.episodeFrom) || 1);
  if (input.episodeTo !== undefined) config.episodeTo = Number(input.episodeTo) || undefined;
  if (input.skipExistingShots !== undefined) config.skipExistingShots = input.skipExistingShots !== false;
  if (input.autoQueueVideo !== undefined) config.autoQueueVideo = input.autoQueueVideo !== false;
  if (input.requireReview !== undefined) config.requireReview = input.requireReview === true;
  if (typeof input.videoAspectRatio === 'string') config.videoAspectRatio = input.videoAspectRatio;
  if (typeof input.dailyTime === 'string' && /^\d{2}:\d{2}$/.test(input.dailyTime)) {
    config.dailyTime = input.dailyTime;
  }
  if (typeof input.onceRunAt === 'string') config.onceRunAt = input.onceRunAt;
  if (typeof input.intervalStartAt === 'string') config.intervalStartAt = input.intervalStartAt;
  return config;
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.title === 'string') updates.title = body.title.trim();
    if (['active', 'paused', 'completed', 'failed'].includes(body.status)) {
      updates.status = body.status;
    }
    if (['storyboard_only', 'storyboard_then_video', 'video_only'].includes(body.mode)) {
      updates.mode = body.mode;
    }
    if (['manual', 'once', 'interval', 'daily'].includes(body.scheduleType)) {
      updates.schedule_type = body.scheduleType;
    }
    if (body.intervalMinutes !== undefined) {
      updates.interval_minutes = Math.max(1, Number(body.intervalMinutes) || 60);
    }
    if (body.nextRunAt !== undefined) {
      updates.next_run_at = body.nextRunAt ? parseClientDateTime(body.nextRunAt) || String(body.nextRunAt) : null;
    }
    if (body.runNow === true) {
      updates.status = 'active';
      updates.next_run_at = new Date().toISOString();
    }
    if (body.config !== undefined) {
      const { data: current } = await supabase
        .from('production_plans')
        .select('config')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      updates.config = {
        ...(asRecord(current?.config)),
        ...normalizeConfig(body.config),
      };
    }

    const { data, error } = await supabase
      .from('production_plans')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ plan: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message || 'Internal Error' }, { status: 500 });
  }
}
