import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeShotDurationSeconds } from '@/lib/duration';
import { buildVisualStyleRequestPayload } from '@/lib/project-visual-style';
import {
  buildStoryboardPlanBatches,
  extractStoryboardScriptText,
  finalizeStoryboardPlan,
  normalizeStoryboardDialogueText,
  resolveStoryboardRelatedAssetIds,
  type StoryboardGeneratedShot,
  type StoryboardPlanBatch,
  type StoryboardPlanShot,
} from '@/lib/storyboard-generation';
import { generateStoryboardPayload } from '@/lib/storyboard-service';
import {
  buildVideoGenerationAttemptDescription,
  getVideoGenerationAccess,
  startVideoGenerationAttempt,
} from '@/lib/video-generation-history';
import {
  DEFAULT_SEEDANCE_2_RESOLUTION,
  normalizeSeedance2AspectRatio,
} from '@/lib/volcengine/video-payload';
import { runVideoGenerationCronTick } from '@/lib/video-generation-cron';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type ProductionPlanMode = 'storyboard_only' | 'storyboard_then_video' | 'video_only';
export type ProductionPlanStatus = 'active' | 'paused' | 'completed' | 'failed';
export type ProductionJobType =
  | 'storyboard_plan_segment'
  | 'storyboard_finalize_plan'
  | 'storyboard_generate_shot'
  | 'queue_episode_videos';

type ProductionPlanRow = {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  status: ProductionPlanStatus | string;
  mode: ProductionPlanMode | string;
  schedule_type: string;
  interval_minutes?: number | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  config?: Record<string, unknown> | null;
  cursor?: Record<string, unknown> | null;
};

type ProductionJobRow = {
  id: string;
  plan_id?: string | null;
  user_id: string;
  project_id: string;
  episode_id?: string | null;
  type: ProductionJobType | string;
  status: string;
  attempts: number;
  max_attempts: number;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
};

type EpisodeRow = {
  id: string;
  user_id: string;
  project_id: string;
  episode_number: number;
  title?: string | null;
  content?: string | null;
};

type AssetRow = {
  id: string;
  name: string;
  type?: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PlanConfig = {
  episodeFrom: number;
  episodeTo?: number;
  episodesPerRun: number;
  skipExistingShots: boolean;
  autoQueueVideo: boolean;
  requireReview: boolean;
  videoAspectRatio?: '9:16' | '16:9' | string;
  dailyTime: string;
  onceRunAt?: string;
  intervalStartAt?: string;
};

export type ProductionTickOptions = {
  maxPlansPerTick?: number;
  maxStoryboardJobsPerTick?: number;
  maxQueueJobsPerTick?: number;
  maxVideoProcessingShots?: number;
  maxVideoQueuedShots?: number;
  maxRuntimeMs?: number;
};

const DEFAULT_PLAN_CONFIG: PlanConfig = {
  episodeFrom: 1,
  episodesPerRun: 1,
  skipExistingShots: true,
  autoQueueVideo: true,
  requireReview: false,
  dailyTime: '09:00',
};

const STORYBOARD_JOB_TYPES = [
  'storyboard_plan_segment',
  'storyboard_finalize_plan',
  'storyboard_generate_shot',
];

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getPlanConfig = (plan: ProductionPlanRow): PlanConfig => {
  const config = asRecord(plan.config);
  const episodeFrom = Number(config.episodeFrom) || DEFAULT_PLAN_CONFIG.episodeFrom;
  const episodeTo = Number(config.episodeTo) || undefined;
  return {
    episodeFrom,
    episodeTo,
    episodesPerRun: Math.max(1, Math.min(5, Number(config.episodesPerRun) || 1)),
    skipExistingShots: config.skipExistingShots !== false,
    autoQueueVideo: config.autoQueueVideo !== false,
    requireReview: config.requireReview === true,
    videoAspectRatio: typeof config.videoAspectRatio === 'string' ? config.videoAspectRatio : undefined,
    dailyTime:
      typeof config.dailyTime === 'string' && /^\d{2}:\d{2}$/.test(config.dailyTime)
        ? config.dailyTime
        : DEFAULT_PLAN_CONFIG.dailyTime,
    onceRunAt: typeof config.onceRunAt === 'string' ? config.onceRunAt : undefined,
    intervalStartAt: typeof config.intervalStartAt === 'string' ? config.intervalStartAt : undefined,
  };
};

const getPlanCursorEpisode = (plan: ProductionPlanRow, config: PlanConfig) => {
  const cursor = asRecord(plan.cursor);
  return Math.max(config.episodeFrom, Number(cursor.nextEpisodeNumber) || config.episodeFrom);
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

const getNextRunAt = (plan: ProductionPlanRow, config: PlanConfig) => {
  const now = new Date();
  if (plan.schedule_type === 'interval') {
    const minutes = Math.max(1, Number(plan.interval_minutes) || 60);
    return new Date(now.getTime() + minutes * 60_000).toISOString();
  }
  if (plan.schedule_type === 'daily') {
    return getNextDailyRunAt(config.dailyTime);
  }
  return null;
};

const isPastDeadline = (deadlineMs: number) => Date.now() >= deadlineMs;

const fetchAssets = async (
  supabase: SupabaseAdmin,
  projectId: string
): Promise<AssetRow[]> => {
  const { data, error } = await supabase
    .from('assets')
    .select('id, name, type, description, metadata')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data || []) as AssetRow[];
};

const fetchProject = async (supabase: SupabaseAdmin, projectId: string) => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, language, art_style')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Project not found');
  return data as {
    id: string;
    user_id: string;
    language?: string | null;
    art_style?: unknown;
  };
};

const fetchEpisode = async (
  supabase: SupabaseAdmin,
  episodeId: string
): Promise<EpisodeRow> => {
  const { data, error } = await supabase
    .from('episodes')
    .select('id, user_id, project_id, episode_number, title, content')
    .eq('id', episodeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Episode not found');
  return data as EpisodeRow;
};

const insertJob = async (
  supabase: SupabaseAdmin,
  job: {
    planId?: string | null;
    userId: string;
    projectId: string;
    episodeId?: string | null;
    type: ProductionJobType;
    payload?: Record<string, unknown>;
  }
) => {
  const { error } = await supabase.from('production_jobs').insert({
    plan_id: job.planId || null,
    user_id: job.userId,
    project_id: job.projectId,
    episode_id: job.episodeId || null,
    type: job.type,
    payload: job.payload || {},
  });
  if (error) throw error;
};

const hasExistingStoryboardWork = async (
  supabase: SupabaseAdmin,
  planId: string,
  episodeId: string
) => {
  const { data, error } = await supabase
    .from('production_jobs')
    .select('id')
    .eq('plan_id', planId)
    .eq('episode_id', episodeId)
    .in('type', STORYBOARD_JOB_TYPES)
    .in('status', ['pending', 'running', 'succeeded'])
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
};

const createStoryboardPlanJobs = async (
  supabase: SupabaseAdmin,
  plan: ProductionPlanRow,
  episode: EpisodeRow,
  scriptContent: string
) => {
  const planBatches = buildStoryboardPlanBatches(scriptContent);
  const batches: Array<StoryboardPlanBatch | null> =
    planBatches.length > 0 ? planBatches : [null];

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    await insertJob(supabase, {
      planId: plan.id,
      userId: plan.user_id,
      projectId: plan.project_id,
      episodeId: episode.id,
      type: 'storyboard_plan_segment',
      payload: {
        segmentIndex: batch?.index || index + 1,
        totalSegments: batch?.total || batches.length,
        script: batch?.script || scriptContent,
        fullScript: scriptContent,
        planBatch: batch,
      },
    });
  }
};

const schedulePlan = async (supabase: SupabaseAdmin, plan: ProductionPlanRow) => {
  const config = getPlanConfig(plan);
  const nextEpisodeNumber = getPlanCursorEpisode(plan, config);
  const { data: episodes, error } = await supabase
    .from('episodes')
    .select('id, user_id, project_id, episode_number, title, content')
    .eq('project_id', plan.project_id)
    .gte('episode_number', nextEpisodeNumber)
    .order('episode_number', { ascending: true })
    .limit(config.episodesPerRun * 5);
  if (error) throw error;

  let createdJobs = 0;
  let advancedTo = nextEpisodeNumber;
  const eligibleEpisodes = ((episodes || []) as EpisodeRow[])
    .filter((episode) => !config.episodeTo || episode.episode_number <= config.episodeTo)
    .slice(0, config.episodesPerRun);

  for (const episode of eligibleEpisodes) {
    advancedTo = episode.episode_number + 1;
    const scriptContent = extractStoryboardScriptText(episode.content || '');
    if (!scriptContent.trim() && plan.mode !== 'video_only') continue;

    if (plan.mode === 'video_only') {
      await insertJob(supabase, {
        planId: plan.id,
        userId: plan.user_id,
        projectId: plan.project_id,
        episodeId: episode.id,
        type: 'queue_episode_videos',
        payload: { videoAspectRatio: config.videoAspectRatio },
      });
      createdJobs += 1;
      continue;
    }

    if (config.skipExistingShots) {
      const { data: existingShots, error: shotError } = await supabase
        .from('shots')
        .select('id')
        .eq('episode_id', episode.id)
        .limit(1);
      if (shotError) throw shotError;
      if (existingShots && existingShots.length > 0) {
        if (plan.mode === 'storyboard_then_video' && config.autoQueueVideo && !config.requireReview) {
          await insertJob(supabase, {
            planId: plan.id,
            userId: plan.user_id,
            projectId: plan.project_id,
            episodeId: episode.id,
            type: 'queue_episode_videos',
            payload: { videoAspectRatio: config.videoAspectRatio },
          });
          createdJobs += 1;
        }
        continue;
      }
    }

    if (await hasExistingStoryboardWork(supabase, plan.id, episode.id)) continue;

    await createStoryboardPlanJobs(supabase, plan, episode, scriptContent);
    createdJobs += 1;
  }

  const exhausted =
    eligibleEpisodes.length === 0 ||
    (config.episodeTo !== undefined && advancedTo > config.episodeTo);
  const shouldStopScheduling = exhausted || plan.schedule_type === 'once';
  const status = shouldStopScheduling ? 'completed' : plan.status;
  const nextRunAt = shouldStopScheduling ? null : getNextRunAt(plan, config);

  const { error: updateError } = await supabase
    .from('production_plans')
    .update({
      status,
      last_run_at: new Date().toISOString(),
      next_run_at: nextRunAt,
      cursor: { ...(plan.cursor || {}), nextEpisodeNumber: advancedTo },
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id);
  if (updateError) throw updateError;

  return { planId: plan.id, createdJobs, nextEpisodeNumber: advancedTo, status };
};

const recoverStaleJobs = async (supabase: SupabaseAdmin) => {
  const staleCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: retryable } = await supabase
    .from('production_jobs')
    .update({
      status: 'pending',
      started_at: null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('locked_at', staleCutoff)
    .filter('attempts', 'lt', 'max_attempts')
    .select('id');

  const { data: failed } = await supabase
    .from('production_jobs')
    .update({
      status: 'failed',
      error: 'Job timed out after max attempts',
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('locked_at', staleCutoff)
    .filter('attempts', 'gte', 'max_attempts')
    .select('id');

  return { retryable: retryable?.length || 0, failed: failed?.length || 0 };
};

const claimNextJob = async (
  supabase: SupabaseAdmin,
  types?: ProductionJobType[]
): Promise<ProductionJobRow | null> => {
  let query = supabase
    .from('production_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1);

  if (types && types.length > 0) {
    query = query.in('type', types);
  }

  const { data, error } = await query;
  if (error) throw error;
  const job = data?.[0] as ProductionJobRow | undefined;
  if (!job) return null;

  const { data: claimed, error: claimError } = await supabase
    .from('production_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      attempts: (job.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  return (claimed as ProductionJobRow | null) || null;
};

const completeJob = async (
  supabase: SupabaseAdmin,
  jobId: string,
  result: Record<string, unknown>
) => {
  const { error } = await supabase
    .from('production_jobs')
    .update({
      status: 'succeeded',
      result,
      error: null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw error;
};

const failJob = async (
  supabase: SupabaseAdmin,
  job: ProductionJobRow,
  error: unknown
) => {
  const message = getErrorMessage(error);
  const terminal = (job.attempts || 0) >= (job.max_attempts || 3);
  const { error: updateError } = await supabase
    .from('production_jobs')
    .update({
      status: terminal ? 'failed' : 'pending',
      error: message,
      finished_at: terminal ? new Date().toISOString() : null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);
  if (updateError) throw updateError;
};

const deferJob = async (
  supabase: SupabaseAdmin,
  jobId: string,
  reason: string
) => {
  const { error } = await supabase
    .from('production_jobs')
    .update({
      status: 'pending',
      error: reason,
      locked_at: null,
      started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw error;
};

const maybeCreateFinalizeJob = async (
  supabase: SupabaseAdmin,
  segmentJob: ProductionJobRow
) => {
  if (!segmentJob.plan_id || !segmentJob.episode_id) return;
  const payload = asRecord(segmentJob.payload);
  const totalSegments = Number(payload.totalSegments) || 1;

  const { data: segments, error } = await supabase
    .from('production_jobs')
    .select('id, status')
    .eq('plan_id', segmentJob.plan_id)
    .eq('episode_id', segmentJob.episode_id)
    .eq('type', 'storyboard_plan_segment');
  if (error) throw error;
  const succeededSegments = (segments || []).filter((segment) => segment.status === 'succeeded');
  if (succeededSegments.length < totalSegments) return;

  const { data: existing, error: existingError } = await supabase
    .from('production_jobs')
    .select('id')
    .eq('plan_id', segmentJob.plan_id)
    .eq('episode_id', segmentJob.episode_id)
    .eq('type', 'storyboard_finalize_plan')
    .limit(1);
  if (existingError) throw existingError;
  if (existing && existing.length > 0) return;

  await insertJob(supabase, {
    planId: segmentJob.plan_id,
    userId: segmentJob.user_id,
    projectId: segmentJob.project_id,
    episodeId: segmentJob.episode_id,
    type: 'storyboard_finalize_plan',
    payload: {},
  });
};

const processPlanSegment = async (
  supabase: SupabaseAdmin,
  job: ProductionJobRow
) => {
  const payload = asRecord(job.payload);
  const project = await fetchProject(supabase, job.project_id);
  const assets = await fetchAssets(supabase, job.project_id);
  const result = await generateStoryboardPayload({
    mode: 'plan',
    script: typeof payload.script === 'string' ? payload.script : '',
    assets,
    language: project.language || 'zh',
    planBatch: payload.planBatch,
    ...buildVisualStyleRequestPayload(project.art_style),
  }) as { shots?: StoryboardPlanShot[] };

  await completeJob(supabase, job.id, {
    shots: Array.isArray(result.shots) ? result.shots : [],
    segmentIndex: Number(payload.segmentIndex) || 1,
    totalSegments: Number(payload.totalSegments) || 1,
    fullScript: typeof payload.fullScript === 'string' ? payload.fullScript : '',
  });
  await maybeCreateFinalizeJob(supabase, job);

  return { jobId: job.id, type: job.type, status: 'succeeded', plannedShots: result.shots?.length || 0 };
};

const processFinalizePlan = async (
  supabase: SupabaseAdmin,
  job: ProductionJobRow
) => {
  if (!job.plan_id || !job.episode_id) throw new Error('Missing plan or episode');
  const { data: segments, error } = await supabase
    .from('production_jobs')
    .select('*')
    .eq('plan_id', job.plan_id)
    .eq('episode_id', job.episode_id)
    .eq('type', 'storyboard_plan_segment');
  if (error) throw error;

  const failedSegment = (segments || []).find((segment) => segment.status === 'failed');
  if (failedSegment) throw new Error('A storyboard plan segment failed');
  const pendingSegment = (segments || []).find((segment) => segment.status !== 'succeeded');
  if (pendingSegment) {
    await deferJob(supabase, job.id, 'Waiting for storyboard plan segments');
    return { jobId: job.id, type: job.type, status: 'deferred' };
  }

  const sortedSegments = [...(segments || [])].sort(
    (a, b) => Number(asRecord(a.payload).segmentIndex) - Number(asRecord(b.payload).segmentIndex)
  );
  const plannedSegments = sortedSegments.flatMap((segment) => {
    const result = asRecord(segment.result);
    return Array.isArray(result.shots) ? (result.shots as StoryboardPlanShot[]) : [];
  });
  const plannedShots = finalizeStoryboardPlan(plannedSegments);
  if (!plannedShots || plannedShots.length === 0) {
    throw new Error('No storyboard shots planned');
  }

  const { data: existingJobs, error: existingJobError } = await supabase
    .from('production_jobs')
    .select('id, payload')
    .eq('plan_id', job.plan_id)
    .eq('episode_id', job.episode_id)
    .eq('type', 'storyboard_generate_shot');
  if (existingJobError) throw existingJobError;
  const existingSequences = new Set(
    (existingJobs || []).map((existing) => Number(asRecord(existing.payload).sequence))
  );

  for (let index = 0; index < plannedShots.length; index += 1) {
    const sequence = index + 1;
    if (existingSequences.has(sequence)) continue;
    await insertJob(supabase, {
      planId: job.plan_id,
      userId: job.user_id,
      projectId: job.project_id,
      episodeId: job.episode_id,
      type: 'storyboard_generate_shot',
      payload: {
        sequence,
        totalShots: plannedShots.length,
        shotPlan: { ...plannedShots[index], sequence },
      },
    });
  }

  await completeJob(supabase, job.id, { plannedShots });
  return { jobId: job.id, type: job.type, status: 'succeeded', plannedShots: plannedShots.length };
};

const mapPreviousShot = (row: Record<string, unknown>) => ({
  sequence: Number(row.sequence_number) || 1,
  description: row.description || '',
  sceneLabel: row.scene_label || '',
  characterAction: row.character_action || '',
  emotion: row.emotion || '',
  lightingAtmosphere: row.lighting_atmosphere || '',
  soundEffect: row.sound_effect || '',
  dialogue: row.dialogue || '',
  camera: row.camera || '',
  size: row.size || '',
  duration: row.duration,
  videoPrompt: row.video_prompt || '',
  characters: row.characters || [],
});

const createQueueJobIfReady = async (
  supabase: SupabaseAdmin,
  shotJob: ProductionJobRow
) => {
  if (!shotJob.plan_id || !shotJob.episode_id) return;
  const { data: plan } = await supabase
    .from('production_plans')
    .select('mode, config')
    .eq('id', shotJob.plan_id)
    .maybeSingle();
  if (!plan || plan.mode !== 'storyboard_then_video') return;
  const config = asRecord(plan.config);
  if (config.autoQueueVideo === false || config.requireReview === true) return;

  const { data: pendingShotJobs, error } = await supabase
    .from('production_jobs')
    .select('id, status')
    .eq('plan_id', shotJob.plan_id)
    .eq('episode_id', shotJob.episode_id)
    .eq('type', 'storyboard_generate_shot')
    .neq('status', 'succeeded')
    .limit(1);
  if (error) throw error;
  if (pendingShotJobs && pendingShotJobs.length > 0) return;

  const { data: existingQueueJobs, error: existingError } = await supabase
    .from('production_jobs')
    .select('id')
    .eq('plan_id', shotJob.plan_id)
    .eq('episode_id', shotJob.episode_id)
    .eq('type', 'queue_episode_videos')
    .in('status', ['pending', 'running', 'succeeded'])
    .limit(1);
  if (existingError) throw existingError;
  if (existingQueueJobs && existingQueueJobs.length > 0) return;

  await insertJob(supabase, {
    planId: shotJob.plan_id,
    userId: shotJob.user_id,
    projectId: shotJob.project_id,
    episodeId: shotJob.episode_id,
    type: 'queue_episode_videos',
    payload: {
      videoAspectRatio:
        typeof config.videoAspectRatio === 'string' ? config.videoAspectRatio : undefined,
    },
  });
};

const processGenerateShot = async (
  supabase: SupabaseAdmin,
  job: ProductionJobRow
) => {
  if (!job.episode_id) throw new Error('Missing episode');
  const payload = asRecord(job.payload);
  const sequence = Number(payload.sequence) || 1;

  const { data: existingShot, error: existingShotError } = await supabase
    .from('shots')
    .select('id')
    .eq('episode_id', job.episode_id)
    .eq('sequence_number', sequence)
    .maybeSingle();
  if (existingShotError) throw existingShotError;
  if (existingShot) {
    await completeJob(supabase, job.id, { skipped: true, reason: 'shot_exists', shotId: existingShot.id });
    await createQueueJobIfReady(supabase, job);
    return { jobId: job.id, type: job.type, status: 'succeeded', skipped: true };
  }

  const episode = await fetchEpisode(supabase, job.episode_id);
  const project = await fetchProject(supabase, job.project_id);
  const assets = await fetchAssets(supabase, job.project_id);
  const scriptContent = extractStoryboardScriptText(episode.content || '');
  const shotPlan = asRecord(payload.shotPlan);
  let previousShot: Record<string, unknown> | null = null;

  if (sequence > 1) {
    const [{ data: previous }, { data: previousJob }] = await Promise.all([
      supabase
        .from('shots')
        .select('*')
        .eq('episode_id', job.episode_id)
        .eq('sequence_number', sequence - 1)
        .maybeSingle(),
      supabase
        .from('production_jobs')
        .select('payload')
        .eq('plan_id', job.plan_id)
        .eq('episode_id', job.episode_id)
        .eq('type', 'storyboard_generate_shot')
        .filter('payload->>sequence', 'eq', String(sequence - 1))
        .maybeSingle(),
    ]);
    if (!previous) {
      await deferJob(supabase, job.id, 'Waiting for previous shot');
      return { jobId: job.id, type: job.type, status: 'deferred' };
    }
    const previousPlan = asRecord(asRecord(previousJob?.payload).shotPlan);
    previousShot = {
      ...previousPlan,
      ...mapPreviousShot(previous as Record<string, unknown>),
    };
  }

  const { data: nextJob } = await supabase
    .from('production_jobs')
    .select('payload')
    .eq('plan_id', job.plan_id)
    .eq('episode_id', job.episode_id)
    .eq('type', 'storyboard_generate_shot')
    .filter('payload->>sequence', 'eq', String(sequence + 1))
    .maybeSingle();
  const nextShotPlan = nextJob ? asRecord(asRecord(nextJob.payload).shotPlan) : null;

  const generated = await generateStoryboardPayload({
    mode: 'shot',
    script: scriptContent,
    assets,
    language: project.language || 'zh',
    shotPlan,
    previousShot,
    nextShotPlan,
    totalShots: Number(payload.totalShots) || undefined,
    ...buildVisualStyleRequestPayload(project.art_style),
  }) as { shot?: StoryboardGeneratedShot };

  if (!generated.shot || typeof generated.shot !== 'object') {
    throw new Error('AI returned no shot');
  }

  const detailedShot: StoryboardGeneratedShot = {
    ...shotPlan,
    ...generated.shot,
    dialogue:
      generated.shot.dialogue &&
      (!shotPlan.dialogue ||
        normalizeStoryboardDialogueText(generated.shot.dialogue).includes(
          normalizeStoryboardDialogueText(String(shotPlan.dialogue))
        ))
        ? generated.shot.dialogue
        : (shotPlan.dialogue as string) || generated.shot.dialogue,
    duration: Number(shotPlan.duration) || generated.shot.duration,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('shots')
    .insert({
      user_id: job.user_id,
      episode_id: job.episode_id,
      sequence_number: sequence,
      description: detailedShot.description || '',
      scene_label: detailedShot.sceneLabel || shotPlan.sceneLabel || '',
      character_action: detailedShot.characterAction || '',
      emotion: detailedShot.emotion || '',
      lighting_atmosphere: detailedShot.lightingAtmosphere || '',
      sound_effect: detailedShot.soundEffect || '',
      dialogue: detailedShot.dialogue || (shotPlan.dialogue as string) || '',
      camera: detailedShot.camera || (shotPlan.camera as string) || '',
      size: detailedShot.size || (shotPlan.size as string) || '',
      duration: normalizeShotDurationSeconds(detailedShot.duration),
      sensitivity_reduction: detailedShot.sensitivityReduction ?? 0,
      video_prompt: detailedShot.videoPrompt || '',
      video_generation_metadata: {},
      characters: Array.isArray(detailedShot.characters) ? detailedShot.characters : [],
      related_asset_ids: resolveStoryboardRelatedAssetIds(
        detailedShot,
        assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          description: asset.description || undefined,
        }))
      ),
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  await completeJob(supabase, job.id, { shotId: inserted.id, sequence });
  await createQueueJobIfReady(supabase, job);

  return { jobId: job.id, type: job.type, status: 'succeeded', shotId: inserted.id, sequence };
};

const processQueueEpisodeVideos = async (
  supabase: SupabaseAdmin,
  job: ProductionJobRow
) => {
  if (!job.episode_id) throw new Error('Missing episode');
  const payload = asRecord(job.payload);
  const aspectRatio = normalizeSeedance2AspectRatio(
    typeof payload.videoAspectRatio === 'string' ? payload.videoAspectRatio : undefined
  );

  const { data: shots, error } = await supabase
    .from('shots')
    .select('id, video_status, video_generation_metadata, description, scene_label, character_action, emotion, lighting_atmosphere, camera, size, dialogue, sound_effect, video_prompt')
    .eq('episode_id', job.episode_id)
    .or('video_status.is.null,video_status.eq.pending,video_status.eq.failed');
  if (error) throw error;

  let queued = 0;
  let skippedLocked = 0;
  for (const shot of shots || []) {
    const access = getVideoGenerationAccess(shot.video_generation_metadata);
    if (access.isLocked) {
      skippedLocked += 1;
      continue;
    }
    const nextMetadata = startVideoGenerationAttempt(
      shot.video_generation_metadata,
      {
        prompt: shot.video_prompt || '',
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
        aspectRatio,
        resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
      }
    );
    const { error: updateError } = await supabase
      .from('shots')
      .update({
        video_status: 'queued',
        video_generation_id: null,
        video_generation_metadata: nextMetadata,
      })
      .eq('id', shot.id)
      .or('video_status.is.null,video_status.eq.pending,video_status.eq.failed');
    if (updateError) throw updateError;
    queued += 1;
  }

  await completeJob(supabase, job.id, { queued, skippedLocked });
  return { jobId: job.id, type: job.type, status: 'succeeded', queued, skippedLocked };
};

const processJob = async (
  supabase: SupabaseAdmin,
  job: ProductionJobRow
) => {
  switch (job.type) {
    case 'storyboard_plan_segment':
      return processPlanSegment(supabase, job);
    case 'storyboard_finalize_plan':
      return processFinalizePlan(supabase, job);
    case 'storyboard_generate_shot':
      return processGenerateShot(supabase, job);
    case 'queue_episode_videos':
      return processQueueEpisodeVideos(supabase, job);
    default:
      throw new Error(`Unsupported production job type: ${job.type}`);
  }
};

export const runProductionTick = async (options: ProductionTickOptions = {}) => {
  const supabase = createAdminClient();
  const maxRuntimeMs = options.maxRuntimeMs ?? 250_000;
  const deadlineMs = Date.now() + maxRuntimeMs;

  const { data: lockAcquired, error: lockError } = await supabase.rpc('try_acquire_cron_lock', {
    lock_name: 'production_tick',
    lock_for_seconds: 55,
  });
  if (lockError) throw lockError;
  if (!lockAcquired) {
    return { success: true, skipped: true, reason: 'locked' };
  }

  const recovered = await recoverStaleJobs(supabase);

  const { data: duePlans, error: dueError } = await supabase
    .from('production_plans')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', new Date().toISOString())
    .order('next_run_at', { ascending: true })
    .limit(options.maxPlansPerTick ?? 3);
  if (dueError) throw dueError;

  const scheduled = [];
  for (const plan of (duePlans || []) as ProductionPlanRow[]) {
    if (isPastDeadline(deadlineMs)) break;
    scheduled.push(await schedulePlan(supabase, plan));
  }

  const processedJobs = [];
  for (let index = 0; index < (options.maxStoryboardJobsPerTick ?? 1); index += 1) {
    if (isPastDeadline(deadlineMs)) break;
    const job = await claimNextJob(supabase, STORYBOARD_JOB_TYPES as ProductionJobType[]);
    if (!job) break;
    try {
      processedJobs.push(await processJob(supabase, job));
    } catch (error) {
      await failJob(supabase, job, error);
      processedJobs.push({ jobId: job.id, type: job.type, status: 'failed', error: getErrorMessage(error) });
    }
  }

  for (let index = 0; index < (options.maxQueueJobsPerTick ?? 3); index += 1) {
    if (isPastDeadline(deadlineMs)) break;
    const job = await claimNextJob(supabase, ['queue_episode_videos']);
    if (!job) break;
    try {
      processedJobs.push(await processJob(supabase, job));
    } catch (error) {
      await failJob(supabase, job, error);
      processedJobs.push({ jobId: job.id, type: job.type, status: 'failed', error: getErrorMessage(error) });
    }
  }

  const videoSync = isPastDeadline(deadlineMs)
    ? { skipped: true, reason: 'deadline' }
    : await runVideoGenerationCronTick({
        maxProcessingShots: options.maxVideoProcessingShots ?? 50,
        maxQueuedShots: options.maxVideoQueuedShots ?? 10,
        deadlineMs,
      });

  return {
    success: true,
    triggeredAt: new Date().toISOString(),
    recovered,
    scheduledPlans: scheduled.length,
    scheduled,
    processedProductionJobs: processedJobs.length,
    processedJobs,
    videoSync,
  };
};
