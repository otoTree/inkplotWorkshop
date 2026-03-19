import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIVideoGeneration } from '@/lib/ai-server';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, duration = 15, metadata } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }


    const result = await callAIVideoGeneration(
      prompt,
      Number(duration) || 15,
      metadata || undefined,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
