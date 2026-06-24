import { NextResponse } from 'next/server';
import { runVideoGenerationCronTick } from '@/lib/video-generation-cron';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await runVideoGenerationCronTick());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Cron job error:', err);
    return NextResponse.json({ error: message || 'Internal Error' }, { status: 500 });
  }
}
