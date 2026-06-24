
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError } from '@/lib/ai-server';
import { generateStoryboardPayload } from '@/lib/storyboard-service';

export const maxDuration = 300; // Longer timeout for storyboard generation

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    return NextResponse.json(await generateStoryboardPayload(body));

  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
