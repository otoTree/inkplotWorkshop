import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/admin/auth';
import { Redis } from '@upstash/redis';
import { getAIAPIConfig } from '@/lib/ai-server';

export async function GET() {
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

    // Get queue items
    const queueItems = await redis.zrange(queueKey, 0, -1, { withScores: true });
    // Get active items
    const activeItems = await redis.zrange(activeKey, 0, -1, { withScores: true });
    // Get global items
    const globalItems = await redis.zrange(globalKey, 0, -1, { withScores: true });

    const formatItems = (items: (string | number)[]) => {
      const formatted = [];
      for (let i = 0; i < items.length; i += 2) {
        formatted.push({
          member: items[i] as string,
          score: items[i + 1] as number,
          date: new Date(items[i + 1] as number).toISOString(),
        });
      }
      return formatted;
    };

    return NextResponse.json({
      queueKey,
      activeKey,
      globalKey,
      queue: formatItems(queueItems),
      active: formatItems(activeItems),
      global: formatItems(globalItems),
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
