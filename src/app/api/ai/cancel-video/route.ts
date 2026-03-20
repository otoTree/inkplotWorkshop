import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelVideoTask } from '@/lib/ai-server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await req.json();
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    await cancelVideoTask(jobId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
