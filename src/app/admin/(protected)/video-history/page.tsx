'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type StatusKey = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'unknown';

type TopShot = {
  shotId: string;
  episodeId: string;
  episodeNumber: number | null;
  episodeTitle?: string | null;
  sequence: number | null;
  attempts: number;
  urls: number;
  status?: string | null;
  taskId?: string | null;
  label: string;
  createdAt?: string | null;
  isLocked: boolean;
  remainingAttempts: number;
  allowedAttempts: number;
};

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
  topShots: TopShot[];
};

type VideoHistoryStats = {
  generatedAt: string;
  pagination: {
    page: number;
    pageSize: number;
    totalProjects: number;
    totalPages: number;
  };
  totals: {
    projects: number;
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
  };
  projects: ProjectSummary[];
};

const formatNumber = (value: number) => new Intl.NumberFormat('zh-CN').format(value);

const statusBadgeVariant = (status?: string | null) => {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const StatCard = ({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-xs font-medium text-gray-500">{label}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="font-mono text-2xl font-semibold text-gray-900">{value}</div>
      {helper && <div className="mt-1 text-xs text-gray-500">{helper}</div>}
    </CardContent>
  </Card>
);

export default function AdminVideoHistoryPage() {
  const [data, setData] = useState<VideoHistoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [showOnlyRepeated, setShowOnlyRepeated] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/video-history?page=${page}&pageSize=${pageSize}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || '统计加载失败');
        return;
      }
      setData(json);
    } catch (err) {
      console.error(err);
      setError('网络错误');
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const unlockShotOnce = async (shot: TopShot) => {
    if (!confirm(`确定给分镜 ${shot.shotId} 解禁 1 次生成机会吗？`)) return;

    try {
      const res = await fetch('/api/admin/video-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotId: shot.shotId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '解禁失败');
        return;
      }
      alert('已解禁 1 次生成机会');
      fetchStats();
    } catch (err) {
      console.error(err);
      alert('网络错误');
    }
  };

  const projects = useMemo(() => {
    const rows = data?.projects || [];
    return showOnlyRepeated ? rows.filter((project) => project.repeatedShots > 0) : rows;
  }, [data?.projects, showOnlyRepeated]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-serif">
            <BarChart3 className="h-5 w-5" />
            视频历史统计
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            按项目汇总分镜视频生成历史、重复生成次数和当前任务状态。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showOnlyRepeated ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowOnlyRepeated((value) => !value)}
          >
            只看重复生成
          </Button>
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="视频任务分镜"
              value={formatNumber(data.totals.videoTaskShots)}
              helper={`当前页 ${formatNumber(data.totals.projects)} 个项目`}
            />
            <StatCard
              label="历史覆盖率"
              value={`${data.totals.historyCoverage}%`}
              helper={`${formatNumber(data.totals.shotsWithHistory)} / ${formatNumber(data.totals.videoTaskShots)}`}
            />
            <StatCard
              label="总生成次数"
              value={formatNumber(data.totals.totalAttempts)}
              helper={`视频链接 ${formatNumber(data.totals.videoUrls)} 条`}
            />
            <StatCard
              label="重复生成分镜"
              value={formatNumber(data.totals.repeatedShots)}
              helper={`最高 ${formatNumber(data.totals.maxAttempts)} 次`}
            />
            <StatCard
              label="已锁定分镜"
              value={formatNumber(data.totals.lockedShots)}
              helper="管理员每次解禁只放行 1 次"
            />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>项目生成情况</CardTitle>
                <p className="mt-1 text-sm text-gray-500">
                  第 {data.pagination.page} / {data.pagination.totalPages} 页，
                  共 {formatNumber(data.pagination.totalProjects)} 个项目。
                  当前页统计时间：{formatDate(data.generatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">completed {formatNumber(data.totals.statuses.completed)}</Badge>
                <Badge variant="destructive">failed {formatNumber(data.totals.statuses.failed)}</Badge>
                <Badge variant="secondary">processing {formatNumber(data.totals.statuses.processing)}</Badge>
                <Badge variant="secondary">queued {formatNumber(data.totals.statuses.queued)}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((value) => Math.min(data.pagination.totalPages, value + 1))}
                  disabled={page >= data.pagination.totalPages || isLoading}
                >
                  下一页
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>项目</TableHead>
                    <TableHead className="text-right">分镜</TableHead>
                    <TableHead className="text-right">视频任务</TableHead>
                    <TableHead className="text-right">历史覆盖</TableHead>
                    <TableHead className="text-right">生成次数</TableHead>
                    <TableHead className="text-right">重复分镜</TableHead>
                    <TableHead className="text-right">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && !data ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-gray-500">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : projects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-gray-500">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    projects.map((project) => {
                      const isExpanded = expandedProjectId === project.projectId;
                      return (
                        <Fragment key={project.projectId}>
                          <TableRow key={project.projectId}>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setExpandedProjectId(isExpanded ? null : project.projectId)}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-gray-900">{project.projectTitle}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span className="font-mono">{project.projectId}</span>
                                <Link
                                  href={`/project/${project.projectId}/storyboard`}
                                  className="text-indigo-600 hover:text-indigo-700"
                                >
                                  打开分镜
                                </Link>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatNumber(project.totalShots)}</TableCell>
                            <TableCell className="text-right font-mono">{formatNumber(project.videoTaskShots)}</TableCell>
                            <TableCell className="text-right font-mono">
                              {project.historyCoverage}%
                              <div className="text-[10px] text-gray-400">
                                {formatNumber(project.shotsWithHistory)} / {formatNumber(project.videoTaskShots)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatNumber(project.totalAttempts)}
                              <div className="text-[10px] text-gray-400">max {project.maxAttempts}</div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatNumber(project.repeatedShots)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end gap-1 text-[10px] text-gray-500">
                                <span>完成 {formatNumber(project.statuses.completed)}</span>
                                <span>失败 {formatNumber(project.statuses.failed)}</span>
                                <span>处理中 {formatNumber(project.statuses.processing + project.statuses.queued)}</span>
                                <span>锁定 {formatNumber(project.lockedShots)}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${project.projectId}-details`}>
                              <TableCell />
                              <TableCell colSpan={7} className="bg-gray-50">
                                <div className="py-3">
                                  <div className="mb-2 text-xs font-medium text-gray-500">
                                    重试最多的分镜
                                  </div>
                                  <div className="rounded-md border bg-white">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>分镜</TableHead>
                                          <TableHead>场景</TableHead>
                                          <TableHead className="text-right">次数</TableHead>
                                          <TableHead className="text-right">链接</TableHead>
                                          <TableHead>状态</TableHead>
                                          <TableHead>任务</TableHead>
                                          <TableHead>操作</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {project.topShots.length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={7} className="py-4 text-center text-gray-500">
                                              暂无视频历史
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          project.topShots.map((shot) => (
                                            <TableRow key={shot.shotId}>
                                              <TableCell className="font-mono text-xs">
                                                Ep {shot.episodeNumber ?? '-'} / #{shot.sequence ?? '-'}
                                                <div className="mt-1 text-[10px] text-gray-400">{shot.shotId}</div>
                                              </TableCell>
                                              <TableCell className="max-w-sm">
                                                <div className="truncate text-sm">{shot.label || '-'}</div>
                                                <div className="text-[10px] text-gray-400">
                                                  {shot.episodeTitle || '-'} · {formatDate(shot.createdAt)}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right font-mono">{shot.attempts}</TableCell>
                                              <TableCell className="text-right font-mono">{shot.urls}</TableCell>
                                              <TableCell>
                                                <Badge variant={statusBadgeVariant(shot.status)}>
                                                  {shot.status || 'unknown'}
                                                </Badge>
                                              </TableCell>
                                              <TableCell className="max-w-[220px] truncate font-mono text-xs text-gray-500">
                                                {shot.taskId || '-'}
                                              </TableCell>
                                              <TableCell>
                                                {shot.isLocked ? (
                                                  <Button size="sm" onClick={() => unlockShotOnce(shot)}>
                                                    解禁一次
                                                  </Button>
                                                ) : (
                                                  <span className="text-xs text-gray-500">
                                                    剩 {shot.remainingAttempts} / {shot.allowedAttempts}
                                                  </span>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          ))
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {isLoading && !data && (
        <div className="rounded-md border bg-white p-8 text-center text-gray-500">
          加载中...
        </div>
      )}
    </div>
  );
}
