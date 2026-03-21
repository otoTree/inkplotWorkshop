import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin/auth';
import { Redis } from '@upstash/redis';
import { completeVideoTask, getAIAPIConfig, getAIVideoStatus } from '@/lib/ai-server';
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
    const configKey = `${config.baseUrl}|${config.apiKey}|${config.maxConcurrency}`;
    const baseKey = `video_concurrency:${configKey}`;
    const queueKey = `${baseKey}:queue`;
    const activeKey = `${baseKey}:active`;
    const globalKey = `global_concurrency:${configKey}`;
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || '20')));

    // Opportunistically clean up a small batch of finished active tasks so the dashboard reflects reality
    // without blocking the whole page on a long serial provider scan.
    const rawActiveItems = await redis.zrange(activeKey, 0, -1, { withScores: true });
    const activeMembersToCheck: string[] = [];
    for (let i = 0; i < rawActiveItems.length; i += 2) {
      const member = String(rawActiveItems[i]);
      if (!member.startsWith('pending:') && !member.startsWith('job_')) {
        activeMembersToCheck.push(member);
      }
    }

    const cleanupBatch = activeMembersToCheck.slice(0, 8);
    await Promise.all(cleanupBatch.map(async (member) => {
      try {
        const providerStatus = await getAIVideoStatus(member);
        const statusInfo = providerStatus.data || providerStatus;
        const status = (statusInfo.status || '').toLowerCase();
        if (['completed', 'succeeded', 'success', 'failed', 'error'].includes(status)) {
          await completeVideoTask(member);
        }
      } catch (err) {
        console.error(`Failed to auto-clean active task ${member}:`, err);
      }
    }));

    // Get queue items
    const queueItems = await redis.zrange(queueKey, 0, -1, { withScores: true });
    // Get active items
    const activeItems = await redis.zrange(activeKey, 0, -1, { withScores: true });
    // Get global items
    const globalItems = await redis.zrange(globalKey, 0, -1, { withScores: true });

    const formatItems = async (items: unknown[]) => {
      const formatted = [];
      for (let i = 0; i < items.length; i += 2) {
        const member = String(items[i]);
        let mappedShotId: string | null = null;
        if (!member.startsWith('pending:') && !member.startsWith('job_')) {
          mappedShotId = await redis.get<string>(`video_task_map:${configKey}:${member}`) || null;
        }
        formatted.push({
          member,
          score: Number(items[i + 1]),
          date: new Date(Number(items[i + 1])).toISOString(),
          mappedShotId,
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
      active: await formatItems(activeItems),
      global: await formatItems(globalItems),
      shotTasks: shotTasks || [],
      shotTasksCount: shotTasksCount || 0,
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error fetching redis stats:', error);
    return NextResponse.json({ error: error.message || 'Internal Error' }, { status: 500 });
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
