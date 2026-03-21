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
}

interface RedisData {
  queueKey: string;
  activeKey: string;
  globalKey: string;
  queue: RedisItem[];
  active: RedisItem[];
  global: RedisItem[];
}

export default function AdminRedisPage() {
  const [data, setData] = useState<RedisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRedisData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/redis');
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

  useEffect(() => {
    fetchRedisData();
  }, []);

  const renderTable = (title: string, keyName: string, items: RedisItem[]) => (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-gray-500 mt-1 font-mono">{keyName}</p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => handleClearKey(keyName)}>
          清空全部
        </Button>
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
                  <TableCell className="font-mono text-xs">{item.member}</TableCell>
                  <TableCell className="font-mono text-xs">{item.score}</TableCell>
                  <TableCell>{item.date}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteMember(keyName, item.member)}>
                      移除
                    </Button>
                  </TableCell>
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
        <h2 className="text-2xl font-serif">Redis 队列管理 (Upstash)</h2>
        <Button onClick={fetchRedisData} variant="outline">刷新状态</Button>
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
          {renderTable('视频等待队列 (Queue)', data.queueKey, data.queue)}
          {renderTable('视频处理中任务 (Active)', data.activeKey, data.active)}
          {renderTable('全局并发信号量 (Global Semaphore)', data.globalKey, data.global)}
        </>
      )}
    </div>
  );
}
