import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getAIAPIConfig,
  getAIVideoStatus,
  getVideoTaskHistoryKey,
} from '@/lib/ai-server';
import {
  getSeedance2VideoTask,
  getVolcengineTaskSnapshot,
  mergeVolcengineTaskMetadata,
  type VolcengineVideoGenerationMetadata,
} from '@/lib/volcengine/video-client';
import { inferVideoTaskProvider } from '@/lib/volcengine/video-compat';
import {
  buildVideoGenerationAttemptDescription,
  upsertVideoGenerationAttempt,
} from '@/lib/video-generation-history';
import type { Shot } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type ShotRow = {
  id: string;
  episode_id: string;
  sequence_number: number;
  description?: string | null;
  scene_label?: string | null;
  character_action?: string | null;
  emotion?: string | null;
  lighting_atmosphere?: string | null;
  camera?: string | null;
  size?: string | null;
  dialogue?: string | null;
  sound_effect?: string | null;
  video_prompt?: string | null;
  video_generation_id?: string | null;
  video_status?: Shot['videoStatus'] | null;
  video_url?: string | null;
  video_generation_metadata?: Shot['videoGenerationMetadata'] | null;
};

type BackfillCandidate = {
  source: 'current-shot' | 'redis-history' | 'redis-active' | 'task-record';
  shotId?: string | null;
  taskId?: string | null;
  videoUrl?: string | null;
  status?: Shot['videoStatus'] | null;
  createdAt?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getString = (value: unknown, keys: string[]): string | null => {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'string' && field.trim()) return field.trim();
  }
  return null;
};

const readNestedString = (value: unknown, keys: string[]): string | null => {
  if (!isRecord(value)) return null;
  const direct = getString(value, keys);
  if (direct) return direct;
  for (const field of Object.values(value)) {
    if (isRecord(field)) {
      const nested = readNestedString(field, keys);
      if (nested) return nested;
    } else if (Array.isArray(field)) {
      for (const item of field) {
        const nested = readNestedString(item, keys);
        if (nested) return nested;
      }
    }
  }
  return null;
};

const normalizeStatus = (value: unknown): Shot['videoStatus'] | null => {
  const status = typeof value === 'string' ? value.toLowerCase() : '';
  if (['completed', 'succeeded', 'success'].includes(status)) return 'completed';
  if (['failed', 'error'].includes(status)) return 'failed';
  if (['queued', 'processing', 'pending'].includes(status)) return status as Shot['videoStatus'];
  return null;
};

const toVolcengineMetadata = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined
): VolcengineVideoGenerationMetadata => ({
  ...(metadata || {}),
  aspectRatio:
    metadata?.aspectRatio === '9:16' || metadata?.aspectRatio === '16:9'
      ? metadata.aspectRatio
      : undefined,
  resolution:
    metadata?.resolution === '720p' || metadata?.resolution === '1080p'
      ? metadata.resolution
      : undefined,
});

const parseRedisHistoryMember = (member: string): Pick<BackfillCandidate, 'taskId' | 'shotId'> => {
  try {
    const parsed = JSON.parse(member);
    if (isRecord(parsed)) {
      return {
        taskId: typeof parsed.taskId === 'string' ? parsed.taskId : null,
        shotId: typeof parsed.shotId === 'string' ? parsed.shotId : null,
      };
    }
  } catch {
    // Older local experiments may have stored raw task IDs.
  }
  return { taskId: member, shotId: null };
};

const getTaskSnapshot = async (
  taskId: string,
  metadata: Shot['videoGenerationMetadata']
) => {
  const isVolcengineTask = inferVideoTaskProvider(taskId, metadata || {}) === 'volcengine';
  if (isVolcengineTask) {
    const result = await getSeedance2VideoTask(taskId);
    const snapshot = getVolcengineTaskSnapshot(result);
    return {
      status: snapshot.videoStatus,
      videoUrl: snapshot.videoUrl,
      provider: 'volcengine',
      rawStatus: snapshot.rawStatus,
      error: snapshot.error || null,
      metadata: mergeVolcengineTaskMetadata(toVolcengineMetadata(metadata), result),
    };
  }

  const result = await getAIVideoStatus(taskId);
  const statusInfo = result.data || result;
  const rawStatus = typeof statusInfo.status === 'string' ? statusInfo.status.toLowerCase() : '';
  return {
    status: normalizeStatus(rawStatus) || 'processing',
    videoUrl:
      statusInfo.url ||
      statusInfo.video_url ||
      statusInfo.content?.video_url ||
      (statusInfo.data && (statusInfo.data.url || statusInfo.data.video_url || statusInfo.data.content?.video_url)) ||
      null,
    provider: 'legacy',
    rawStatus,
    error: null,
    metadata: {
      ...(metadata || {}),
      provider: metadata?.provider || 'legacy',
      rawStatus,
    },
  };
};

const getShotRows = async (
  supabase: AdminSupabaseClient,
  projectId?: string | null
) => {
  if (!projectId) {
    const { data, error } = await supabase
      .from('shots')
      .select('*')
      .or('video_generation_id.not.is.null,video_url.not.is.null,video_status.in.(queued,processing,completed,failed)');
    if (error) throw error;
    return (data || []) as ShotRow[];
  }

  const { data: episodes, error: episodeError } = await supabase
    .from('episodes')
    .select('id')
    .eq('project_id', projectId);
  if (episodeError) throw episodeError;
  const episodeIds = (episodes || []).map((episode) => episode.id);
  if (episodeIds.length === 0) return [];

  const { data, error } = await supabase
    .from('shots')
    .select('*')
    .in('episode_id', episodeIds)
    .or('video_generation_id.not.is.null,video_url.not.is.null,video_status.in.(queued,processing,completed,failed)');
  if (error) throw error;
  return (data || []) as ShotRow[];
};

const collectRedisCandidates = async (windowMs: number): Promise<BackfillCandidate[]> => {
  const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!isKVConfigured) return [];

  const redis = Redis.fromEnv();
  const config = getAIAPIConfig();
  const configKey = `${config.baseUrl}|${config.apiKey}|${config.maxConcurrency}`;
  const baseKey = `video_concurrency:${configKey}`;
  const activeKey = `${baseKey}:active`;
  const historyKey = getVideoTaskHistoryKey(config);
  const cutoff = Date.now() - windowMs;
  const candidates: BackfillCandidate[] = [];

  const historyItems = await redis.zrange(historyKey, 0, -1, { withScores: true });
  for (let index = 0; index < historyItems.length; index += 2) {
    const score = Number(historyItems[index + 1]);
    if (!Number.isFinite(score) || score < cutoff) continue;
    const parsed = parseRedisHistoryMember(String(historyItems[index]));
    if (!parsed.taskId) continue;
    candidates.push({
      source: 'redis-history',
      taskId: parsed.taskId,
      shotId: parsed.shotId,
      createdAt: new Date(score).toISOString(),
    });
  }

  const activeItems = await redis.zrange(activeKey, 0, -1, { withScores: true });
  for (let index = 0; index < activeItems.length; index += 2) {
    const member = String(activeItems[index]);
    if (member.startsWith('pending:') || member.startsWith('job_')) continue;
    const shotId = await redis.get<string>(`video_task_map:${configKey}:${member}`);
    candidates.push({
      source: 'redis-active',
      taskId: member,
      shotId,
      createdAt: new Date(Math.min(Date.now(), Number(activeItems[index + 1]) || Date.now())).toISOString(),
    });
  }

  return candidates;
};

const collectTaskCandidates = async (
  supabase: AdminSupabaseClient,
  sinceIso: string
): Promise<BackfillCandidate[]> => {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, type, status, payload, result, error, created_at, updated_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) return [];

  return (data || [])
    .map((task): BackfillCandidate | null => {
      const root = {
        payload: task.payload,
        result: task.result,
        status: task.status,
        type: task.type,
      };
      const taskId = readNestedString(root, ['task_id', 'taskId', 'videoId', 'video_generation_id', 'id']);
      const shotId = readNestedString(root, ['shotId', 'shot_id', 'jobId']);
      const videoUrl = readNestedString(root, ['video_url', 'videoUrl', 'url']);
      const status = normalizeStatus(readNestedString(root, ['videoStatus', 'video_status', 'status']) || task.status);
      if (!taskId && !videoUrl) return null;
      return {
        source: 'task-record',
        taskId,
        shotId,
        videoUrl,
        status,
        createdAt: task.created_at || task.updated_at,
      };
    })
    .filter((candidate): candidate is BackfillCandidate => Boolean(candidate));
};

const buildCurrentShotCandidates = (shots: ShotRow[]): BackfillCandidate[] =>
  shots
    .filter((shot) => shot.video_generation_id || shot.video_url)
    .map((shot) => ({
      source: 'current-shot',
      shotId: shot.id,
      taskId: shot.video_generation_id || null,
      videoUrl: shot.video_url || null,
      status: shot.video_status || (shot.video_url ? 'completed' : null),
    }));

export async function POST(req: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const projectId = typeof body.projectId === 'string' ? body.projectId : null;
    const windowHours = Math.max(1, Math.min(24, Number(body.windowHours || 24)));
    const dryRun = Boolean(body.dryRun);
    const windowMs = windowHours * 60 * 60 * 1000;
    const sinceIso = new Date(Date.now() - windowMs).toISOString();
    const supabase = createAdminClient();

    const shotRows = await getShotRows(supabase, projectId);
    const shotsById = new Map(shotRows.map((shot) => [shot.id, shot]));
    const shotsByTaskId = new Map(
      shotRows
        .filter((shot) => shot.video_generation_id)
        .map((shot) => [shot.video_generation_id as string, shot])
    );

    const candidates = [
      ...buildCurrentShotCandidates(shotRows),
      ...(await collectRedisCandidates(windowMs)),
      ...(await collectTaskCandidates(supabase, sinceIso)),
    ];

    const seen = new Set<string>();
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ candidate: BackfillCandidate; error: string }> = [];

    for (const candidate of candidates) {
      const shot =
        (candidate.shotId ? shotsById.get(candidate.shotId) : null) ||
        (candidate.taskId ? shotsByTaskId.get(candidate.taskId) : null);
      if (!shot) {
        skipped++;
        continue;
      }

      const key = `${shot.id}:${candidate.taskId || candidate.videoUrl || candidate.source}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const taskSnapshot = candidate.taskId
          ? await getTaskSnapshot(candidate.taskId, shot.video_generation_metadata || {})
          : null;
        const status =
          taskSnapshot?.status ||
          candidate.status ||
          (candidate.videoUrl ? 'completed' : shot.video_status || 'processing');
        const videoUrl = taskSnapshot?.videoUrl || candidate.videoUrl || null;
        const nextMetadata = upsertVideoGenerationAttempt(
          taskSnapshot?.metadata || shot.video_generation_metadata || {},
          {
            status,
            generationId: candidate.taskId || shot.video_generation_id || null,
            videoUrl,
            prompt: shot.video_prompt,
            description: buildVideoGenerationAttemptDescription({
              videoPrompt: shot.video_prompt,
              description: shot.description,
              sceneLabel: shot.scene_label,
              characterAction: shot.character_action,
              emotion: shot.emotion,
              lightingAtmosphere: shot.lighting_atmosphere,
              camera: shot.camera,
              size: shot.size,
              dialogue: shot.dialogue,
              soundEffect: shot.sound_effect,
            }),
            provider: taskSnapshot?.provider,
            startedAt: candidate.createdAt || undefined,
            updatedAt: new Date().toISOString(),
            error: taskSnapshot?.error || null,
          }
        );

        if (!dryRun) {
          const shouldPromoteCurrent =
            candidate.source === 'current-shot' ||
            !shot.video_generation_id ||
            (candidate.taskId && candidate.taskId === shot.video_generation_id);
          await supabase
            .from('shots')
            .update({
              video_generation_metadata: nextMetadata,
              ...(shouldPromoteCurrent && candidate.taskId ? { video_generation_id: candidate.taskId } : {}),
              ...(shouldPromoteCurrent && status ? { video_status: status } : {}),
              ...(shouldPromoteCurrent && videoUrl ? { video_url: videoUrl } : {}),
            })
            .eq('id', shot.id);
        }

        shot.video_generation_metadata = nextMetadata;
        updated++;
      } catch (error) {
        errors.push({
          candidate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      projectId,
      windowHours,
      scannedShots: shotRows.length,
      candidates: candidates.length,
      updated,
      skipped,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Error' },
      { status: 500 }
    );
  }
}
