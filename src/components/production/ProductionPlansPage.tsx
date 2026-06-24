'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Film,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ServerCog,
  TimerReset,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Episode } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

type ProductionPlan = {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'completed' | 'failed' | string;
  mode: 'storyboard_only' | 'storyboard_then_video' | 'video_only' | string;
  schedule_type: 'manual' | 'once' | 'interval' | 'daily' | string;
  interval_minutes?: number | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  config?: {
    episodeFrom?: number;
    episodeTo?: number;
    episodesPerRun?: number;
    skipExistingShots?: boolean;
    autoQueueVideo?: boolean;
    requireReview?: boolean;
    videoAspectRatio?: string;
    dailyTime?: string;
    onceRunAt?: string;
    intervalStartAt?: string;
  };
  cursor?: {
    nextEpisodeNumber?: number;
  };
  created_at: string;
};

type ProductionJob = {
  id: string;
  plan_id?: string | null;
  episode_id?: string | null;
  type: string;
  status: string;
  attempts: number;
  error?: string | null;
  created_at: string;
  updated_at: string;
  result?: Record<string, unknown> | null;
};

const modeLabels: Record<string, string> = {
  storyboard_only: '只生成分镜',
  storyboard_then_video: '分镜后生成视频',
  video_only: '只排队视频',
};

const scheduleLabels: Record<string, string> = {
  manual: '手动触发',
  once: '定时一次',
  interval: '间隔循环',
  daily: '每天定时',
};

const jobTypeLabels: Record<string, string> = {
  storyboard_plan_segment: '规划分镜段落',
  storyboard_finalize_plan: '整理分镜计划',
  storyboard_generate_shot: '生成单镜提示词',
  queue_episode_videos: '排队视频生成',
};

const jobStatusLabels: Record<string, string> = {
  pending: '等待',
  running: '运行中',
  succeeded: '完成',
  failed: '失败',
};

const planStatusLabels: Record<string, string> = {
  active: '启用',
  paused: '暂停',
  completed: '完成',
  failed: '失败',
};

const statusVariant = (status: string) => {
  if (status === 'active' || status === 'succeeded') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
};

const formatRelativeTime = (value?: string | null) =>
  value
    ? formatDistanceToNow(new Date(value), { locale: zhCN, addSuffix: true })
    : '未安排';

const getPlanProgress = (plan: ProductionPlan) => {
  const from = Number(plan.config?.episodeFrom) || 1;
  const to = Number(plan.config?.episodeTo) || from;
  const cursor = Number(plan.cursor?.nextEpisodeNumber) || from;
  const total = Math.max(1, to - from + 1);
  const done = Math.min(total, Math.max(0, cursor - from));
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
  };
};

const toDateTimeLocalValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getDefaultFutureDateTime = (minutesFromNow: number) =>
  toDateTimeLocalValue(new Date(Date.now() + minutesFromNow * 60_000));

const getSchedulePreview = (form: {
  scheduleType: string;
  runNow: boolean;
  intervalMinutes: number;
  onceRunAt: string;
  dailyTime: string;
  intervalStartAt: string;
}) => {
  if (form.scheduleType === 'manual') {
    return form.runNow ? '创建后立即执行一次，后续手动触发' : '仅创建计划，之后手动点击运行';
  }
  if (form.scheduleType === 'once') {
    return `在 ${form.onceRunAt || '指定时间'} 启动一次`;
  }
  if (form.scheduleType === 'daily') {
    return `每天 ${form.dailyTime || '09:00'} 启动一次`;
  }
  if (form.scheduleType === 'interval') {
    return form.runNow
      ? `创建后立即执行，之后每 ${form.intervalMinutes || 60} 分钟一次`
      : `从 ${form.intervalStartAt || '指定时间'} 开始，每 ${form.intervalMinutes || 60} 分钟一次`;
  }
  return '等待配置';
};

const getPlanScheduleDetail = (plan: ProductionPlan) => {
  if (plan.schedule_type === 'manual') return '手动触发，点击运行按钮可立即进入下一次 tick';
  if (plan.schedule_type === 'once') return `定时一次：${plan.config?.onceRunAt || plan.next_run_at || '未设置时间'}`;
  if (plan.schedule_type === 'daily') return `每天 ${plan.config?.dailyTime || '09:00'} 启动`;
  if (plan.schedule_type === 'interval') return `每 ${plan.interval_minutes || 60} 分钟启动一次`;
  return plan.schedule_type;
};

export function ProductionPlansPage({ projectId }: { projectId: string }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '分镜视频生产计划',
    mode: 'storyboard_then_video',
    scheduleType: 'manual',
    intervalMinutes: 60,
    onceRunAt: getDefaultFutureDateTime(30),
    dailyTime: '09:00',
    intervalStartAt: getDefaultFutureDateTime(60),
    episodeFrom: 1,
    episodeTo: 1,
    episodesPerRun: 1,
    skipExistingShots: true,
    autoQueueVideo: true,
    runNow: true,
  });

  const episodeOptions = useMemo(
    () => episodes.map((episode) => episode.episodeNumber),
    [episodes]
  );
  const activePlans = plans.filter((plan) => plan.status === 'active').length;
  const pendingJobs = jobs.filter((job) => job.status === 'pending').length;
  const runningJobs = jobs.filter((job) => job.status === 'running').length;
  const failedJobs = jobs.filter((job) => job.status === 'failed').length;
  const lastJob = jobs[0];

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [episodeList, planRes, jobRes] = await Promise.all([
        api.episodes.list(projectId),
        fetch(`/api/production/plans?projectId=${projectId}`),
        fetch(`/api/production/jobs?projectId=${projectId}`),
      ]);
      if (!planRes.ok) throw new Error(await planRes.text());
      if (!jobRes.ok) throw new Error(await jobRes.text());
      const planData = await planRes.json();
      const jobData = await jobRes.json();
      setEpisodes(episodeList);
      setPlans(planData.plans || []);
      setJobs(jobData.jobs || []);
      if (episodeList.length > 0) {
        setForm((current) => ({
          ...current,
          episodeFrom:
            current.episodeFrom === 1 && current.episodeTo === 1
              ? episodeList[0].episodeNumber
              : current.episodeFrom,
          episodeTo:
            current.episodeFrom === 1 && current.episodeTo === 1
              ? episodeList[episodeList.length - 1].episodeNumber
              : current.episodeTo,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const createPlan = async () => {
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch('/api/production/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: form.title,
          mode: form.mode,
          scheduleType: form.scheduleType,
          intervalMinutes: form.intervalMinutes,
          runNow: form.scheduleType === 'manual' || form.scheduleType === 'interval'
            ? form.runNow
            : false,
          config: {
            episodeFrom: form.episodeFrom,
            episodeTo: form.episodeTo,
            episodesPerRun: form.episodesPerRun,
            skipExistingShots: form.skipExistingShots,
            autoQueueVideo: form.mode === 'storyboard_then_video' ? form.autoQueueVideo : false,
            onceRunAt: form.onceRunAt,
            dailyTime: form.dailyTime,
            intervalStartAt: form.runNow ? undefined : form.intervalStartAt,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePlan = async (planId: string, body: Record<string, unknown>) => {
    setError('');
    try {
      const res = await fetch(`/api/production/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-serif tracking-tight text-black/90">
            <CalendarClock className="h-6 w-6 text-black/60" />
            生产计划
          </h1>
          <p className="mt-1 text-sm text-black/50">
            已有剧本按计划推进到分镜提示词，再进入视频生成队列
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          刷新
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-black/[0.08] bg-stone-50/40 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/50">启用计划</span>
              <ServerCog className="h-4 w-4 text-black/40" />
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">{activePlans}</div>
            <div className="mt-1 text-xs text-black/45">共 {plans.length} 个计划</div>
          </CardContent>
        </Card>
        <Card className="border-black/[0.08] bg-stone-50/40 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/50">队列任务</span>
              <Clock3 className="h-4 w-4 text-black/40" />
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">{pendingJobs}</div>
            <div className="mt-1 text-xs text-black/45">{runningJobs} 个运行中</div>
          </CardContent>
        </Card>
        <Card className="border-black/[0.08] bg-stone-50/40 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/50">异常任务</span>
              <AlertCircle className="h-4 w-4 text-black/40" />
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">{failedJobs}</div>
            <div className="mt-1 text-xs text-black/45">最近 100 条任务</div>
          </CardContent>
        </Card>
        <Card className="border-black/[0.08] bg-stone-50/40 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-black/50">最近推进</span>
              <TimerReset className="h-4 w-4 text-black/40" />
            </div>
            <div className="mt-3 truncate text-sm font-medium text-black/80">
              {lastJob ? (jobTypeLabels[lastJob.type] || lastJob.type) : '暂无任务'}
            </div>
            <div className="mt-1 text-xs text-black/45">{lastJob ? formatRelativeTime(lastJob.created_at) : '等待首次 tick'}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-black/[0.08] shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg font-serif">创建计划</CardTitle>
              <p className="mt-1 text-xs text-black/45">
                外部定时器每分钟触发 <span className="font-mono">POST /api/cron/production</span> 后会消费到期计划
              </p>
            </div>
            <Badge variant="outline" className="rounded-md px-2 py-1 font-mono">
              Bearer $CRON_SECRET
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>计划名称</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>生产模式</Label>
              <Select
                value={form.mode}
                onValueChange={(value) => setForm({ ...form, mode: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="storyboard_then_video">分镜后生成视频</SelectItem>
                  <SelectItem value="storyboard_only">只生成分镜</SelectItem>
                  <SelectItem value="video_only">只排队视频</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>触发方式</Label>
              <Select
                value={form.scheduleType}
                onValueChange={(value) => setForm({ ...form, scheduleType: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">手动触发</SelectItem>
                  <SelectItem value="once">定时启动一次</SelectItem>
                  <SelectItem value="daily">每天固定时间</SelectItem>
                  <SelectItem value="interval">每隔 N 分钟</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>起始集</Label>
              <Input
                type="number"
                min={1}
                value={form.episodeFrom}
                onChange={(event) => setForm({ ...form, episodeFrom: Number(event.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>结束集</Label>
              <Input
                type="number"
                min={form.episodeFrom}
                value={form.episodeTo}
                onChange={(event) => setForm({ ...form, episodeTo: Number(event.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>每次处理集数</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.episodesPerRun}
                onChange={(event) => setForm({ ...form, episodesPerRun: Number(event.target.value) })}
              />
            </div>
            {form.scheduleType === 'once' && (
              <div className="space-y-2">
                <Label>启动时间</Label>
                <Input
                  type="datetime-local"
                  value={form.onceRunAt}
                  onChange={(event) => setForm({ ...form, onceRunAt: event.target.value })}
                />
              </div>
            )}
            {form.scheduleType === 'daily' && (
              <div className="space-y-2">
                <Label>每天几点</Label>
                <Input
                  type="time"
                  value={form.dailyTime}
                  onChange={(event) => setForm({ ...form, dailyTime: event.target.value })}
                />
              </div>
            )}
            {form.scheduleType === 'interval' && (
              <div className="space-y-2">
                <Label>间隔分钟</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.intervalMinutes}
                  onChange={(event) => setForm({ ...form, intervalMinutes: Number(event.target.value) })}
                />
              </div>
            )}
            {form.scheduleType === 'manual' && (
              <div className="space-y-2">
                <Label>启动方式</Label>
                <div className="flex h-9 items-center rounded-md border border-input bg-black/[0.02] px-3 text-sm text-black/50">
                  手动或立即运行
                </div>
              </div>
            )}

            {form.scheduleType === 'interval' && !form.runNow && (
              <div className="space-y-2 md:col-span-2">
                <Label>首次启动时间</Label>
                <Input
                  type="datetime-local"
                  value={form.intervalStartAt}
                  onChange={(event) => setForm({ ...form, intervalStartAt: event.target.value })}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-4 md:col-span-3">
              <label className="flex items-center gap-2 text-sm text-black/70">
                <input
                  type="checkbox"
                  checked={form.skipExistingShots}
                  onChange={(event) => setForm({ ...form, skipExistingShots: event.target.checked })}
                />
                跳过已有分镜
              </label>
              <label className="flex items-center gap-2 text-sm text-black/70">
                <input
                  type="checkbox"
                  checked={form.autoQueueVideo}
                  disabled={form.mode !== 'storyboard_then_video'}
                  onChange={(event) => setForm({ ...form, autoQueueVideo: event.target.checked })}
                />
                自动排队视频
              </label>
              {(form.scheduleType === 'manual' || form.scheduleType === 'interval') && (
                <label className="flex items-center gap-2 text-sm text-black/70">
                  <input
                    type="checkbox"
                    checked={form.runNow}
                    onChange={(event) => setForm({ ...form, runNow: event.target.checked })}
                  />
                  {form.scheduleType === 'interval' ? '创建后立即执行首轮' : '创建后立即执行一次'}
                </label>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={createPlan} disabled={isSaving || episodeOptions.length === 0}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                创建
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-black/[0.06] bg-stone-50/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-black/75">
              <Film className="h-4 w-4" />
              本次计划预览
            </div>
            <Separator className="my-3" />
            <div className="space-y-3 text-sm text-black/60">
              <div className="flex justify-between gap-3">
                <span>生产范围</span>
                <span className="font-mono text-black/80">第 {form.episodeFrom} - {form.episodeTo} 集</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>处理节奏</span>
                <span className="text-black/80">每次 {form.episodesPerRun} 集</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>启动方式</span>
                <span className="text-right text-black/80">{getSchedulePreview(form)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>视频策略</span>
                <span className="text-black/80">
                  {form.mode === 'storyboard_then_video' && form.autoQueueVideo ? '自动入队' : '不自动入队'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id} className="border-black/[0.08]">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-serif">{plan.title}</CardTitle>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={statusVariant(plan.status)}>{planStatusLabels[plan.status] || plan.status}</Badge>
                    <Badge variant="outline">{modeLabels[plan.mode] || plan.mode}</Badge>
                    <Badge variant="secondary">{scheduleLabels[plan.schedule_type] || plan.schedule_type}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updatePlan(plan.id, { runNow: true })}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updatePlan(plan.id, {
                        status: plan.status === 'paused' ? 'active' : 'paused',
                      })
                    }
                  >
                    {plan.status === 'paused' ? <RotateCcw className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-black/60">
              <div className="space-y-2">
                {(() => {
                  const progress = getPlanProgress(plan);
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span>集数进度</span>
                        <span className="font-mono text-black/75">{progress.done}/{progress.total}</span>
                      </div>
                      <Progress value={progress.percent} className="h-2" />
                    </>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  集数范围
                  <div className="font-mono text-black/80">
                    {plan.config?.episodeFrom || 1} - {plan.config?.episodeTo || '末尾'}
                  </div>
                </div>
                <div>
                  下一集游标
                  <div className="font-mono text-black/80">{plan.cursor?.nextEpisodeNumber || plan.config?.episodeFrom || 1}</div>
                </div>
                <div>
                  下次执行
                  <div className="text-black/80">{formatRelativeTime(plan.next_run_at)}</div>
                </div>
                <div>
                  上次执行
                  <div className="text-black/80">{plan.last_run_at ? formatRelativeTime(plan.last_run_at) : '尚未执行'}</div>
                </div>
              </div>
              <div className="rounded-md bg-black/[0.03] px-3 py-2 text-xs text-black/55">
                {getPlanScheduleDetail(plan)}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && plans.length === 0 && (
          <Card className="border-black/[0.08] lg:col-span-2">
            <CardContent className="py-10 text-center text-sm text-black/45">
              暂无生产计划
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="border-black/[0.08]">
        <CardHeader>
          <CardTitle className="text-lg font-serif">最近任务</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>尝试</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>错误</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.slice(0, 20).map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="font-medium text-black/75">{jobTypeLabels[job.type] || job.type}</div>
                    <div className="font-mono text-[11px] text-black/35">{job.id.slice(0, 8)}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(job.status)}>
                      {job.status === 'succeeded' && <CheckCircle2 className="h-3 w-3" />}
                      {jobStatusLabels[job.status] || job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{job.attempts}</TableCell>
                  <TableCell className="text-xs text-black/50">
                    {formatRelativeTime(job.created_at)}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-red-600">
                    {job.error || '-'}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-black/45">
                    暂无任务
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
