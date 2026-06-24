'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarClock, Loader2, Play, Plus, RefreshCw, Pause, RotateCcw } from 'lucide-react';
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

type ProductionPlan = {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'completed' | 'failed' | string;
  mode: 'storyboard_only' | 'storyboard_then_video' | 'video_only' | string;
  schedule_type: 'manual' | 'interval' | 'daily' | string;
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

const statusVariant = (status: string) => {
  if (status === 'active' || status === 'succeeded') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
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
          runNow: form.runNow,
          config: {
            episodeFrom: form.episodeFrom,
            episodeTo: form.episodeTo,
            episodesPerRun: form.episodesPerRun,
            skipExistingShots: form.skipExistingShots,
            autoQueueVideo: form.mode === 'storyboard_then_video' ? form.autoQueueVideo : false,
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
          <h1 className="flex items-center gap-2 text-2xl font-serif text-black/90">
            <CalendarClock className="h-6 w-6 text-black/60" />
            生产计划
          </h1>
          <p className="mt-1 text-sm text-black/50">分镜提示词与视频队列的后台生产工作台</p>
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

      <Card className="border-black/[0.08]">
        <CardHeader>
          <CardTitle className="text-lg font-serif">创建计划</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
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
            <Label>频率</Label>
            <Select
              value={form.scheduleType}
              onValueChange={(value) => setForm({ ...form, scheduleType: value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动/立即</SelectItem>
                <SelectItem value="interval">按间隔</SelectItem>
                <SelectItem value="daily">每天</SelectItem>
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
          <div className="space-y-2">
            <Label>间隔分钟</Label>
            <Input
              type="number"
              min={1}
              disabled={form.scheduleType !== 'interval'}
              value={form.intervalMinutes}
              onChange={(event) => setForm({ ...form, intervalMinutes: Number(event.target.value) })}
            />
          </div>

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
            <label className="flex items-center gap-2 text-sm text-black/70">
              <input
                type="checkbox"
                checked={form.runNow}
                onChange={(event) => setForm({ ...form, runNow: event.target.checked })}
              />
              创建后立即执行
            </label>
          </div>
          <div className="flex justify-end">
            <Button onClick={createPlan} disabled={isSaving || episodeOptions.length === 0}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              创建
            </Button>
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
                    <Badge variant={statusVariant(plan.status)}>{plan.status}</Badge>
                    <Badge variant="outline">{modeLabels[plan.mode] || plan.mode}</Badge>
                    <Badge variant="secondary">{plan.schedule_type}</Badge>
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
            <CardContent className="grid grid-cols-2 gap-3 text-sm text-black/60">
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
                <div className="text-black/80">
                  {plan.next_run_at
                    ? formatDistanceToNow(new Date(plan.next_run_at), { locale: zhCN, addSuffix: true })
                    : '未安排'}
                </div>
              </div>
              <div>
                上次执行
                <div className="text-black/80">
                  {plan.last_run_at
                    ? formatDistanceToNow(new Date(plan.last_run_at), { locale: zhCN, addSuffix: true })
                    : '尚未执行'}
                </div>
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
                  <TableCell className="font-mono text-xs">{job.type}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                  </TableCell>
                  <TableCell>{job.attempts}</TableCell>
                  <TableCell className="text-xs text-black/50">
                    {formatDistanceToNow(new Date(job.created_at), { locale: zhCN, addSuffix: true })}
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
