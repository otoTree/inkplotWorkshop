'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { Episode } from '@/types';

interface EngagementDashboardProps {
  episodes: Episode[];
  currentEpisodeNumber?: number;
}

/**
 * 内流控制仪表盘
 * 显示 SI 走势、爽点分布、钩子状态
 */
export function EngagementDashboard({ episodes, currentEpisodeNumber }: EngagementDashboardProps) {
  // 准备图表数据
  const chartData = useMemo(() => {
    return episodes.map(ep => ({
      episode: ep.episodeNumber,
      si: ep.engagementState?.suppressionIndex || 0,
      payoff: ep.engagementState?.plannedPayoff?.level || null,
      hook: ep.engagementState?.hookContract?.strength || null
    }));
  }, [episodes]);

  // 当前集的状态
  const currentEpisode = useMemo(() => {
    if (!currentEpisodeNumber) return null;
    return episodes.find(ep => ep.episodeNumber === currentEpisodeNumber);
  }, [episodes, currentEpisodeNumber]);

  const currentState = currentEpisode?.engagementState;

  // 检查超期钩子
  const overdueHooks = useMemo(() => {
    if (!currentEpisodeNumber) return [];
    return episodes.filter(ep => {
      const hook = ep.engagementState?.hookContract;
      return hook && hook.status === 'active' && hook.fulfillByEpisode < currentEpisodeNumber;
    });
  }, [episodes, currentEpisodeNumber]);

  // 爽点统计
  const payoffStats = useMemo(() => {
    const stats = { S: 0, A: 0, B: 0, C: 0 };
    episodes.forEach(ep => {
      const level = ep.engagementState?.plannedPayoff?.level;
      if (level && ep.engagementState?.plannedPayoff?.released) {
        stats[level]++;
      }
    });
    return stats;
  }, [episodes]);

  if (episodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>内流控制仪表盘</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">暂无数据</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 当前状态 */}
      {currentState && (
        <Card>
          <CardHeader>
            <CardTitle>第 {currentEpisodeNumber} 集状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 压抑指数 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">压抑指数 (SI)</span>
                <span className="text-2xl font-bold">
                  {currentState.suppressionIndex.toFixed(2)}
                </span>
              </div>
              <Progress value={currentState.suppressionIndex * 100} className="h-2" />
              {currentState.suppressionIndex > 0.85 && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>
                    ⚠️ 压抑过载!必须在本集释放至少 B 级爽点
                  </AlertDescription>
                </Alert>
              )}
              {currentState.suppressionIndex < 0.3 && (
                <Alert className="mt-2">
                  <AlertDescription>
                    💡 压抑不足,建议增加对主角的打压或悬念
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* 计划爽点 */}
            {currentState.plannedPayoff && (
              <div>
                <span className="text-sm font-medium">计划释放爽点</span>
                <div className="flex items-center gap-2 mt-2">
                  <Badge
                    variant={currentState.plannedPayoff.level === 'S' ? 'default' : 'secondary'}
                    className="text-lg px-3 py-1"
                  >
                    {currentState.plannedPayoff.level} 级
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {currentState.plannedPayoff.description}
                  </span>
                </div>
              </div>
            )}

            {/* 钩子契约 */}
            {currentState.hookContract && (
              <div>
                <span className="text-sm font-medium">钩子契约</span>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{currentState.hookContract.type}</Badge>
                    <Badge>{currentState.hookContract.strength}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {currentState.hookContract.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    兑现期限: 第 {currentState.hookContract.fulfillByEpisode} 集
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 超期钩子警告 */}
      {overdueHooks.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            ⚠️ 存在 {overdueHooks.length} 个超期钩子未兑现
          </AlertDescription>
        </Alert>
      )}

      {/* SI 走势图 */}
      <Card>
        <CardHeader>
          <CardTitle>压抑指数走势</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="episode"
                label={{ value: '集数', position: 'insideBottom', offset: -5 }}
              />
              <YAxis
                domain={[0, 1]}
                label={{ value: 'SI', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-medium">第 {data.episode} 集</p>
                        <p className="text-sm">SI: {data.si.toFixed(2)}</p>
                        {data.payoff && (
                          <p className="text-sm">爽点: {data.payoff} 级</p>
                        )}
                        {data.hook && (
                          <p className="text-sm">钩子: {data.hook}</p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={0.85} stroke="red" strokeDasharray="3 3" label="过载线" />
              <ReferenceLine y={0.3} stroke="orange" strokeDasharray="3 3" label="低压线" />
              <Line
                type="monotone"
                dataKey="si"
                stroke="#8884d8"
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.payoff) {
                    const colors = { S: '#ef4444', A: '#f59e0b', B: '#10b981', C: '#6b7280' };
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={colors[payload.payoff as keyof typeof colors]}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }
                  return <circle cx={cx} cy={cy} r={3} fill="#8884d8" />;
                }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>S级爽点</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span>A级爽点</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>B级爽点</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 爽点统计 */}
      <Card>
        <CardHeader>
          <CardTitle>爽点统计</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-500">{payoffStats.S}</div>
              <div className="text-sm text-muted-foreground">S级 (史诗)</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-500">{payoffStats.A}</div>
              <div className="text-sm text-muted-foreground">A级 (阶段)</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">{payoffStats.B}</div>
              <div className="text-sm text-muted-foreground">B级 (小爽)</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-500">{payoffStats.C}</div>
              <div className="text-sm text-muted-foreground">C级 (微爽)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
