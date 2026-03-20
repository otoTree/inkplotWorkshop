import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Redis } from '@upstash/redis';
import { getAIAPIConfig } from '@/lib/ai-server';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json({ position: 0 });
    }

    const isKVConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    if (!isKVConfigured) {
      return NextResponse.json({ position: 0 });
    }

    const config = getAIAPIConfig();
    const redis = Redis.fromEnv();
    
    // The key format must match getKey(config) exactly
    const configKey = `${config.baseUrl}|${config.apiKey}|${config.maxConcurrency}`;
    const queueKey = `video_concurrency:${configKey}:queue`;
    
    const rank = await redis.zrank(queueKey, jobId);
    
    return NextResponse.json({ 
      position: rank !== null ? rank + 1 : 0 
    });
  } catch (error) {
    console.error('Queue status check error:', error);
    return NextResponse.json({ position: 0 });
  }
}
