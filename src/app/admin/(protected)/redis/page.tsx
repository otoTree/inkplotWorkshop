'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RedisItem {
  member: string;
  score: number;
  date: string;
  mappedShotId?: string | null;
}

interface RedisData {
  page: number;
  pageSize: number;
  queueKey: string;
  activeKey: string;
  globalKey: string;
  queue: RedisItem[];
  active: RedisItem[];
  global: RedisItem[];
  shotTasks: Array<{
    id: string;
    user_id?: string | null;
    episode_id?: string | null;
    sequence_number?: number | null;
    video_status?: string | null;
    video_generation_id?: string | null;
    video_url?: string | null;
    created_at?: string | null;
  }>;
  shotTasksCount: number;
}

export default function AdminRedisPage() {
  const [data, setData] = useState<RedisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchRedisData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/redis?page=${page}&pageSize=${pageSize}`);
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        setError(json.error || 'Failed to fetch');
      }
    } catch (err) {
      console.error(err);
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMember = async (key: string, member: string) => {
    if (!confirm(`确定删除 ${member} 吗？`)) return;
    try {
      const res = await fetch(`/api/admin/redis?key=${encodeURIComponent(key)}&member=${encodeURIComponent(member)}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRedisData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearKey = async (key: string) => {
    if (!confirm(`确定清空整个队列/集合 ${key} 吗？`)) return;
    try {
      const res = await fetch(`/api/admin/redis?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRedisData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecover = async (videoId: string) => {
    // Only recover if it looks like a task ID (usually not starting with "job_" or "pending:")
    if (videoId.startsWith('pending:')) {
      alert('这是一个等待调度的占位符，请直接移除或等待其超时。');
      return;
    }
    if (videoId.startsWith('job_')) {
      alert('这是一个排队中的 Job ID，尚未发送给 AI 提供商，无法恢复。如果卡住了请直接移除。');
      return;
    }

    if (!confirm(`将向 AI 厂商查询 ${videoId} 的真实状态，并尝试更新数据库和清理队列。确定吗？`)) return;
    
    try {
      const res = await fetch('/api/admin/redis/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });
      const json = await res.json();
      
      if (res.ok) {
        alert(`恢复成功！\n厂商状态: ${json.providerStatus}\n数据库更新状态: ${json.dbStatus}\n关联镜头: ${json.mappedShotId || '未命中映射'}\n更新了 ${json.updatedShotsCount} 个镜头`);
        fetchRedisData();
      } else {
        alert(`恢复失败: ${json.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('网络错误');
    }
  };

  const handleRecoverAll = async (items: RedisItem[]) => {
    const realTaskIds = items
      .map(item => item.member)
      .filter(id => !id.startsWith('pending:') && !id.startsWith('job_'));

    if (realTaskIds.length === 0) {
      alert('没有可恢复的真实任务（只有占位符或等待队列）。');
      return;
    }

    if (!confirm(`将批量向 AI 厂商查询 ${realTaskIds.length} 个任务的真实状态并更新。确定吗？`)) return;

    try {
      const res = await fetch('/api/admin/redis/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: realTaskIds }),
      });
      const json = await res.json();
      
      if (res.ok) {
        let successCount = 0;
        let failCount = 0;
        json.results.forEach((r: any) => {
          if (r.success) successCount++;
          else failCount++;
        });
        alert(`批量恢复完成！\n成功: ${successCount}\n失败/跳过: ${failCount}`);
        fetchRedisData();
      } else {
        alert(`批量恢复失败: ${json.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('网络错误');
    }
  };

  useEffect(() => {
    fetchRedisData();
    const interval = setInterval(fetchRedisData, 5000);
    return () => clearInterval(interval);
  }, [page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.shotTasksCount / pageSize)) : 1;

  const renderTable = (title: string, keyName: string, items: RedisItem[], showRecoverAll: boolean = false) => (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-gray-500 mt-1 font-mono">{keyName}</p>
        </div>
        <div className="flex gap-2">
          {showRecoverAll && (
            <Button variant="secondary" size="sm" onClick={() => handleRecoverAll(items)}>
              一键恢复所有任务
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={() => handleClearKey(keyName)}>
            清空全部
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member (Job ID / Task ID)</TableHead>
              <TableHead>Score (Timestamp)</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4 text-gray-500">队列为空</TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.member}>
                  <TableCell className="font-mono text-xs">
                    <div>{item.member}</div>
                    {item.mappedShotId && (
                      <div className="text-[10px] text-gray-500 mt-1">shot: {item.mappedShotId}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.score}</TableCell>
                  <TableCell>{item.date}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleRecover(item.member)} disabled={item.member.startsWith('job_') || item.member.startsWith('pending:')}>
                        恢复
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteMember(keyName, item.member)}>
                        移除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderShotTaskTable = () => (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>数据库视频任务</CardTitle>
          <p className="text-sm text-gray-500 mt-1">显示 `shots` 表中的 queued / processing / completed / failed 任务</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page <= 1}>
            上一页
          </Button>
          <span className="text-sm text-gray-500">第 {page} / {totalPages} 页</span>
          <Button variant="outline" size="sm" onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
            下一页
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>镜头</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>任务ID</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data || data.shotTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4 text-gray-500">暂无数据库任务</TableCell>
              </TableRow>
            ) : (
              data.shotTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-mono text-xs">
                    <div>{task.id}</div>
                    {task.sequence_number !== null && task.sequence_number !== undefined && (
                      <div className="text-[10px] text-gray-500 mt-1">seq: {task.sequence_number}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      task.video_status === 'completed'
                        ? 'default'
                        : task.video_status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                    }>
                      {task.video_status || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{task.video_generation_id || '-'}</TableCell>
                  <TableCell>{task.created_at || '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif">并发队列管理 (Upstash Redis)</h2>
        <div className="flex gap-2">
          <Button 
            onClick={async () => {
              if(!confirm('确定要将全站所有仍处于 queued 且尚未拿到真实任务 ID 的镜头重置为 pending 吗？已经拿到真实任务 ID 的镜头不会被重置。')) return;
              try {
                const res = await fetch('/api/admin/redis/recover', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'reset-stuck-shots' })
                });
                const data = await res.json();
                alert(data.message || '重置完成');
                fetchRedisData();
              } catch(e) { alert('请求失败'); }
            }} 
            variant="destructive"
          >
            强制重置所有卡住的镜头
          </Button>
          <Button onClick={fetchRedisData} variant="outline">刷新状态</Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 p-4 rounded-md">
          {error}
        </div>
      )}

      {isLoading && !data && (
        <div className="text-center py-12">加载中...</div>
      )}

      {data && (
        <>
          {renderShotTaskTable()}
          {renderTable('视频等待队列 (Queue)', data.queueKey, data.queue)}
          {renderTable('视频处理中任务 (Active)', data.activeKey, data.active, true)}
          {renderTable('全局并发信号量 (Global Semaphore)', data.globalKey, data.global)}
        </>
      )}
    </div>
  );
}
