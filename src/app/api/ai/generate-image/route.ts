import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIImageGeneration, extractFirstMessageContent, extractImageUrls } from '@/lib/ai-server';
import { persistImageSource } from '@/lib/image-upload';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      prompt,
      aspectRatio = '1:1',
      n = 1,
      upload = true,
      referenceImageUrl,
      model,
    } = body;
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const result = await callAIImageGeneration(
      prompt,
      aspectRatio,
      n,
      referenceImageUrl,
      model
    );
    let urls = extractImageUrls(result);
    
    if (urls.length === 0) {
      let raw = '';
      try {
        raw = extractFirstMessageContent(result);
      } catch {
        raw = '';
      }
      return NextResponse.json({ error: 'Image generation returned no urls', raw }, { status: 502 });
    }

    if (upload) {
      urls = await Promise.all(urls.map(async (url) => {
        return await persistImageSource(url, 'generated-images');
      }));
    }

    return NextResponse.json({ data: urls.map((url) => ({ url })) });

  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    const err = error as { message?: string };
    console.error('[Image Gen Error] Exception:', error);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
