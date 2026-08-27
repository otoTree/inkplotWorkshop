import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin/auth';
import { Redis } from '@upstash/redis';
import { getAIAPIConfig, getAIAPIConfigKey } from '@/lib/ai-server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    if (!isKVConfigured) {
      return NextResponse.json({ error: 'Redis KV is not configured in environment variables' }, { status: 400 });
    }

    const redis = Redis.fromEnv();
    const config = getAIAPIConfig();
    const configKey = getAIAPIConfigKey(config);
    const baseKey = `video_concurrency:${configKey}`;
    const queueKey = `${baseKey}:queue`;
    const activeKey = `${baseKey}:active`;
    const globalKey = `global_concurrency:${configKey}`;
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || '20')));

    const [queueItems, activeItems, globalItems] = await Promise.all([
      redis.zrange(queueKey, 0, 99, { withScores: true }),
      redis.zrange(activeKey, 0, 99, { withScores: true }),
      redis.zrange(globalKey, 0, 99, { withScores: true }),
    ]);

    const formatItems = async (items: unknown[], includeShotMapping = false) => {
      const members = [];
      for (let i = 0; i < items.length; i += 2) {
        members.push(String(items[i]));
      }
      const taskIds = includeShotMapping
        ? members.filter((member) => !member.startsWith('pending:') && !member.startsWith('job_'))
        : [];
      const mappedShotIds = taskIds.length > 0
        ? await redis.mget<(string | null)[]>(taskIds.map((member) => `video_task_map:${configKey}:${member}`))
        : [];
      const mappedShotIdByTask = new Map(taskIds.map((taskId, index) => [taskId, mappedShotIds[index] || null]));
      const formatted = [];
      for (let i = 0; i < items.length; i += 2) {
        const member = String(items[i]);
        formatted.push({
          member,
          score: Number(items[i + 1]),
          date: new Date(Number(items[i + 1])).toISOString(),
          mappedShotId: mappedShotIdByTask.get(member) || null,
        });
      }
      return formatted;
    };

    const supabase = createAdminClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data: shotTasks, count: shotTasksCount, error: shotTasksError } = await supabase
      .from('shots')
      .select('id, user_id, episode_id, sequence_number, video_status, video_generation_id, video_url, created_at', { count: 'exact' })
      .in('video_status', ['queued', 'processing', 'completed', 'failed'])
      .order('created_at', { ascending: false })
      .range(from, to);

    if (shotTasksError) {
      throw shotTasksError;
    }

    return NextResponse.json({
      page,
      pageSize,
      queueKey,
      activeKey,
      globalKey,
      queue: await formatItems(queueItems),
      active: await formatItems(activeItems, true),
      global: await formatItems(globalItems),
      shotTasks: shotTasks || [],
      shotTasksCount: shotTasksCount || 0,
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error fetching redis stats:', error);
    const message = /max requests limit|monthly request|request limit exceeded/i.test(error.message)
      ? 'Upstash Redis 月度请求额度已用尽，请升级计划或等待额度重置。'
      : '读取 Redis 状态失败，请查看服务端日志。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const member = searchParams.get('member');

    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

    const redis = Redis.fromEnv();
    
    if (member) {
      // Delete specific member from sorted set
      await redis.zrem(key, member);
    } else {
      // Delete entire key
      await redis.del(key);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
  }
}
