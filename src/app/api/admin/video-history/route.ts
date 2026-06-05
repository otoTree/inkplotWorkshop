import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getVideoGenerationAccess,
  grantVideoGenerationAttempt,
  normalizeVideoGenerationHistory,
} from '@/lib/video-generation-history';
import type { Shot } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PAGE_SIZE = 1000;

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type ProjectRow = {
  id: string;
  title: string | null;
  updated_at?: string | null;
};

type EpisodeRow = {
  id: string;
  project_id: string;
  episode_number: number | null;
  title?: string | null;
};

type ShotRow = {
  id: string;
  episode_id: string;
  sequence_number: number | null;
  description?: string | null;
  scene_label?: string | null;
  video_status?: Shot['videoStatus'] | null;
  video_generation_id?: string | null;
  video_url?: string | null;
  video_generation_metadata?: Shot['videoGenerationMetadata'] | null;
  created_at?: string | null;
};

type StatusKey = NonNullable<Shot['videoStatus']> | 'unknown';

type ProjectSummary = {
  projectId: string;
  projectTitle: string;
  updatedAt?: string | null;
  totalShots: number;
  videoTaskShots: number;
  shotsWithHistory: number;
  historyCoverage: number;
  totalAttempts: number;
  repeatedShots: number;
  maxAttempts: number;
  videoUrls: number;
  lockedShots: number;
  statuses: Record<StatusKey, number>;
  topShots: Array<{
    shotId: string;
    episodeId: string;
    episodeNumber: number | null;
    episodeTitle?: string | null;
    sequence: number | null;
    attempts: number;
    urls: number;
    status: Shot['videoStatus'] | null;
    taskId?: string | null;
    label: string;
    createdAt?: string | null;
    isLocked: boolean;
    remainingAttempts: number;
    allowedAttempts: number;
  }>;
};

type ShotHistoryItem = {
  id: string;
  attemptNumber: number;
  startedAt: string;
  updatedAt: string;
  status: string;
  generationId?: string | null;
  videoUrl?: string | null;
  provider?: string;
  model?: string;
};

type ShotHistoryDetail = {
  shotId: string;
  episodeId: string;
  sequence: number | null;
  label: string;
  status: Shot['videoStatus'] | null;
  taskId?: string | null;
  videoUrl?: string | null;
  attempts: number;
  urls: number;
  failedAttemptsExcluded: number;
  isLocked: boolean;
  remainingAttempts: number;
  allowedAttempts: number;
  createdAt?: string | null;
  historyItems: ShotHistoryItem[];
};

type EpisodeHistoryDetail = {
  episodeId: string;
  episodeNumber: number | null;
  episodeTitle?: string | null;
  totalShots: number;
  videoTaskShots: number;
  shotsWithHistory: number;
  totalAttempts: number;
  repeatedShots: number;
  maxAttempts: number;
  videoUrls: number;
  lockedShots: number;
  failedAttemptsExcluded: number;
  statuses: Record<StatusKey, number>;
  shots: ShotHistoryDetail[];
};

type ProjectHistoryDetail = ProjectSummary & {
  episodes: EpisodeHistoryDetail[];
};

const fetchAllPages = async <T>(buildQuery: (
  from: number,
  to: number
) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};

const loadProjectPage = async (
  supabase: AdminSupabaseClient,
  page: number,
  pageSize: number
) => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from('projects')
    .select('id, title, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return {
    projects: (data || []) as ProjectRow[],
    totalProjects: count || 0,
  };
};

const loadEpisodesForProjects = async (
  supabase: AdminSupabaseClient,
  projectIds: string[]
) => {
  if (projectIds.length === 0) return [];
  return fetchAllPages<EpisodeRow>((from, to) =>
    supabase
      .from('episodes')
      .select('id, project_id, episode_number, title')
      .in('project_id', projectIds)
      .range(from, to)
  );
};

const loadShotsForEpisodes = async (
  supabase: AdminSupabaseClient,
  episodeIds: string[]
) => {
  if (episodeIds.length === 0) return [];
  return fetchAllPages<ShotRow>((from, to) =>
    supabase
      .from('shots')
      .select('id, episode_id, sequence_number, description, scene_label, video_status, video_generation_id, video_url, video_generation_metadata, created_at')
      .in('episode_id', episodeIds)
      .range(from, to)
  );
};

const getAttempts = (metadata: Shot['videoGenerationMetadata'] | null | undefined) => {
  const history = normalizeVideoGenerationHistory(metadata);
  return history.totalAttempts;
};

const getHistoryVideoUrlCount = (metadata: Shot['videoGenerationMetadata'] | null | undefined) =>
  normalizeVideoGenerationHistory(metadata).items.filter((item) => Boolean(item.videoUrl)).length;

const getExcludedFailedAttemptCount = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined
) =>
  Array.isArray(metadata?.videoHistory?.items)
    ? metadata.videoHistory.items.filter((item) =>
        item && ['failed', 'error'].includes(String(item.status || '').toLowerCase())
      ).length
    : 0;

const getShotLabel = (shot: ShotRow) =>
  shot.scene_label || (shot.description || '').replace(/\s+/g, ' ').trim().slice(0, 56);

const emptyStatuses = (): Record<StatusKey, number> => ({
  pending: 0,
  queued: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  unknown: 0,
});

const createSummary = (project: ProjectRow): ProjectSummary => ({
  projectId: project.id,
  projectTitle: project.title || '未命名项目',
  updatedAt: project.updated_at,
  totalShots: 0,
  videoTaskShots: 0,
  shotsWithHistory: 0,
  historyCoverage: 0,
  totalAttempts: 0,
  repeatedShots: 0,
  maxAttempts: 0,
  videoUrls: 0,
  lockedShots: 0,
  statuses: emptyStatuses(),
  topShots: [],
});

const createEpisodeDetail = (episode: EpisodeRow): EpisodeHistoryDetail => ({
  episodeId: episode.id,
  episodeNumber: episode.episode_number,
  episodeTitle: episode.title,
  totalShots: 0,
  videoTaskShots: 0,
  shotsWithHistory: 0,
  totalAttempts: 0,
  repeatedShots: 0,
  maxAttempts: 0,
  videoUrls: 0,
  lockedShots: 0,
  failedAttemptsExcluded: 0,
  statuses: emptyStatuses(),
  shots: [],
});

const hasVideoTask = (shot: ShotRow) =>
  Boolean(
    shot.video_generation_id ||
      shot.video_url ||
      shot.video_status === 'queued' ||
      shot.video_status === 'processing' ||
      shot.video_status === 'completed' ||
      shot.video_status === 'failed'
  );

const toHistoryItems = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined
): ShotHistoryItem[] =>
  normalizeVideoGenerationHistory(metadata).items.map((item) => ({
    id: item.id,
    attemptNumber: item.attemptNumber,
    startedAt: item.startedAt,
    updatedAt: item.updatedAt,
    status: item.status,
    generationId: item.generationId,
    videoUrl: item.videoUrl,
    provider: item.provider,
    model: item.model,
  }));

const applyShotStats = (
  target: Pick<
    ProjectSummary | EpisodeHistoryDetail,
    | 'videoTaskShots'
    | 'shotsWithHistory'
    | 'totalAttempts'
    | 'repeatedShots'
    | 'maxAttempts'
    | 'videoUrls'
    | 'lockedShots'
    | 'statuses'
  >,
  shot: ShotRow,
  attempts: number,
  urlCount: number,
  access: ReturnType<typeof getVideoGenerationAccess>
) => {
  const status = (shot.video_status || 'unknown') as StatusKey;
  target.videoTaskShots += 1;
  target.totalAttempts += attempts;
  target.videoUrls += urlCount;
  target.maxAttempts = Math.max(target.maxAttempts, attempts);
  target.statuses[status] = (target.statuses[status] || 0) + 1;
  if (attempts > 0) target.shotsWithHistory += 1;
  if (attempts > 1) target.repeatedShots += 1;
  if (access.isLocked) target.lockedShots += 1;
};

const finalizeProjectSummary = <T extends ProjectSummary>(summary: T): T => ({
  ...summary,
  historyCoverage:
    summary.videoTaskShots > 0
      ? Math.round((summary.shotsWithHistory / summary.videoTaskShots) * 1000) / 10
      : 0,
  topShots: summary.topShots
    .sort((a, b) => b.attempts - a.attempts || b.urls - a.urls)
    .slice(0, 8),
});

const loadProjectDetail = async (
  supabase: AdminSupabaseClient,
  projectId: string
): Promise<ProjectHistoryDetail | null> => {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, title, updated_at')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) return null;

  const episodes = await loadEpisodesForProjects(supabase, [project.id]);
  const shots = await loadShotsForEpisodes(supabase, episodes.map((episode) => episode.id));
  const episodesById = new Map(episodes.map((episode) => [episode.id, episode]));
  const detail: ProjectHistoryDetail = {
    ...createSummary(project as ProjectRow),
    episodes: episodes
      .slice()
      .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
      .map(createEpisodeDetail),
  };
  const episodeDetailsById = new Map(detail.episodes.map((episode) => [episode.episodeId, episode]));

  shots
    .slice()
    .sort((a, b) => {
      const episodeA = episodesById.get(a.episode_id)?.episode_number || 0;
      const episodeB = episodesById.get(b.episode_id)?.episode_number || 0;
      return episodeA - episodeB || (a.sequence_number || 0) - (b.sequence_number || 0);
    })
    .forEach((shot) => {
      const episode = episodesById.get(shot.episode_id);
      const episodeDetail = episodeDetailsById.get(shot.episode_id);
      if (!episode || !episodeDetail) return;

      detail.totalShots += 1;
      episodeDetail.totalShots += 1;

      const attempts = getAttempts(shot.video_generation_metadata);
      const urlCount = getHistoryVideoUrlCount(shot.video_generation_metadata);
      const access = getVideoGenerationAccess(shot.video_generation_metadata);
      const failedAttemptsExcluded = getExcludedFailedAttemptCount(shot.video_generation_metadata);
      const status = (shot.video_status || 'unknown') as StatusKey;
      if (failedAttemptsExcluded > 0) {
        episodeDetail.failedAttemptsExcluded += failedAttemptsExcluded;
      }

      const shotDetail: ShotHistoryDetail = {
        shotId: shot.id,
        episodeId: episode.id,
        sequence: shot.sequence_number,
        label: getShotLabel(shot),
        status: shot.video_status || null,
        taskId: shot.video_generation_id,
        videoUrl: shot.video_url,
        attempts,
        urls: urlCount,
        failedAttemptsExcluded,
        isLocked: access.isLocked,
        remainingAttempts: access.remainingAttempts,
        allowedAttempts: access.allowedAttempts,
        createdAt: shot.created_at,
        historyItems: toHistoryItems(shot.video_generation_metadata),
      };
      episodeDetail.shots.push(shotDetail);

      if (!hasVideoTask(shot)) return;

      if (status === 'failed') {
        detail.statuses[status] = (detail.statuses[status] || 0) + 1;
        episodeDetail.statuses[status] = (episodeDetail.statuses[status] || 0) + 1;
        return;
      }

      applyShotStats(detail, shot, attempts, urlCount, access);
      applyShotStats(episodeDetail, shot, attempts, urlCount, access);

      if (attempts > 0) {
        detail.topShots.push({
          shotId: shot.id,
          episodeId: episode.id,
          episodeNumber: episode.episode_number,
          episodeTitle: episode.title,
          sequence: shot.sequence_number,
          attempts,
          urls: urlCount,
          status: shot.video_status || null,
          taskId: shot.video_generation_id,
          label: getShotLabel(shot),
          createdAt: shot.created_at,
          isLocked: access.isLocked,
          remainingAttempts: access.remainingAttempts,
          allowedAttempts: access.allowedAttempts,
        });
      }
    });

  detail.episodes = detail.episodes.map((episode) => ({
    ...episode,
    shots: episode.shots.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
  }));

  return finalizeProjectSummary(detail);
};

export async function GET(req: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get('pageSize') || '20')));
    const supabase = createAdminClient();

    if (projectId) {
      const project = await loadProjectDetail(supabase, projectId);
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        project,
      });
    }

    const { projects, totalProjects } = await loadProjectPage(supabase, page, pageSize);
    const episodes = await loadEpisodesForProjects(supabase, projects.map((project) => project.id));
    const shots = await loadShotsForEpisodes(supabase, episodes.map((episode) => episode.id));

    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const episodesById = new Map(episodes.map((episode) => [episode.id, episode]));
    const summariesByProject = new Map<string, ProjectSummary>();
    projects.forEach((project) => {
      summariesByProject.set(project.id, createSummary(project));
    });

    const globalStatuses = emptyStatuses();
    let globalVideoTaskShots = 0;
    let globalShotsWithHistory = 0;
    let globalAttempts = 0;
    let globalRepeatedShots = 0;
    let globalVideoUrls = 0;
    let globalMaxAttempts = 0;
    let globalLockedShots = 0;

    shots.forEach((shot) => {
      const episode = episodesById.get(shot.episode_id);
      if (!episode) return;
      const project = projectsById.get(episode.project_id);
      if (!project) return;

      const summary = summariesByProject.get(project.id) || createSummary(project);
      summariesByProject.set(project.id, summary);
      summary.totalShots += 1;

      const hasVideoTask = Boolean(
        shot.video_generation_id ||
        shot.video_url ||
        shot.video_status === 'queued' ||
        shot.video_status === 'processing' ||
        shot.video_status === 'completed' ||
        shot.video_status === 'failed'
      );
      if (!hasVideoTask) return;

      const status = (shot.video_status || 'unknown') as StatusKey;
      if (status === 'failed') {
        summary.statuses[status] = (summary.statuses[status] || 0) + 1;
        globalStatuses[status] = (globalStatuses[status] || 0) + 1;
        return;
      }

      const attempts = getAttempts(shot.video_generation_metadata);
      const urlCount = getHistoryVideoUrlCount(shot.video_generation_metadata);
      const access = getVideoGenerationAccess(shot.video_generation_metadata);

      summary.videoTaskShots += 1;
      summary.totalAttempts += attempts;
      summary.videoUrls += urlCount;
      summary.maxAttempts = Math.max(summary.maxAttempts, attempts);
      summary.statuses[status] = (summary.statuses[status] || 0) + 1;
      if (attempts > 0) summary.shotsWithHistory += 1;
      if (attempts > 1) summary.repeatedShots += 1;
      if (access.isLocked) summary.lockedShots += 1;

      globalVideoTaskShots += 1;
      globalAttempts += attempts;
      globalVideoUrls += urlCount;
      globalMaxAttempts = Math.max(globalMaxAttempts, attempts);
      globalStatuses[status] = (globalStatuses[status] || 0) + 1;
      if (attempts > 0) globalShotsWithHistory += 1;
      if (attempts > 1) globalRepeatedShots += 1;
      if (access.isLocked) globalLockedShots += 1;

      if (attempts > 0) {
        summary.topShots.push({
          shotId: shot.id,
          episodeId: episode.id,
          episodeNumber: episode.episode_number,
          episodeTitle: episode.title,
          sequence: shot.sequence_number,
          attempts,
          urls: urlCount,
          status: shot.video_status || null,
          taskId: shot.video_generation_id,
          label: getShotLabel(shot),
          createdAt: shot.created_at,
          isLocked: access.isLocked,
          remainingAttempts: access.remainingAttempts,
          allowedAttempts: access.allowedAttempts,
        });
      }
    });

    const projectSummaries = Array.from(summariesByProject.values())
      .map((summary) => ({
        ...summary,
        historyCoverage:
          summary.videoTaskShots > 0
            ? Math.round((summary.shotsWithHistory / summary.videoTaskShots) * 1000) / 10
            : 0,
        topShots: summary.topShots
          .sort((a, b) => b.attempts - a.attempts || b.urls - a.urls)
          .slice(0, 8),
      }))
      .sort((a, b) => b.totalAttempts - a.totalAttempts || b.videoTaskShots - a.videoTaskShots);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      pagination: {
        page,
        pageSize,
        totalProjects,
        totalPages: Math.max(1, Math.ceil(totalProjects / pageSize)),
      },
      totals: {
        projects: projectSummaries.length,
        totalShots: shots.length,
        videoTaskShots: globalVideoTaskShots,
        shotsWithHistory: globalShotsWithHistory,
        historyCoverage:
          globalVideoTaskShots > 0
            ? Math.round((globalShotsWithHistory / globalVideoTaskShots) * 1000) / 10
            : 0,
        totalAttempts: globalAttempts,
        repeatedShots: globalRepeatedShots,
        maxAttempts: globalMaxAttempts,
        videoUrls: globalVideoUrls,
        lockedShots: globalLockedShots,
        statuses: globalStatuses,
      },
      projects: projectSummaries,
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error fetching video history stats:', error);
    return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const shotId = typeof body.shotId === 'string' ? body.shotId : '';
    if (!shotId) {
      return NextResponse.json({ error: 'Missing shotId' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('id, video_generation_metadata')
      .eq('id', shotId)
      .maybeSingle();

    if (shotError) throw shotError;
    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    const nextMetadata = grantVideoGenerationAttempt(shot.video_generation_metadata, {
      adminUserId: null,
    });
    const { error: updateError } = await supabase
      .from('shots')
      .update({ video_generation_metadata: nextMetadata })
      .eq('id', shotId);
    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      shotId,
      videoGenerationAccess: getVideoGenerationAccess(nextMetadata),
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error unlocking video generation:', error);
    return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
  }
}
