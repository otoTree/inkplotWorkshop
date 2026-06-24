import { NextResponse } from 'next/server';
import { runProductionTick } from '@/lib/production';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await runProductionTick({
      maxPlansPerTick: Number(body.maxPlansPerTick) || 3,
      maxStoryboardJobsPerTick: Number(body.maxStoryboardJobsPerTick) || 1,
      maxQueueJobsPerTick: Number(body.maxQueueJobsPerTick) || 3,
      maxVideoProcessingShots: Number(body.maxVideoProcessingShots) || 50,
      maxVideoQueuedShots: Number(body.maxVideoQueuedShots) || 10,
      maxRuntimeMs: Number(body.maxRuntimeMs) || 250_000,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Production cron error:', error);
    return NextResponse.json({ error: message || 'Internal Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
