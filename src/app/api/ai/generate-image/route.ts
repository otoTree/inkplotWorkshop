import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, size = "2K", images } = body;

    const apiKey = process.env.ARK_API_KEY;
    const baseURL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
    const model = process.env.ARK_IMAGE_MODEL || "doubao-seedream-4-5-251128";

    if (!apiKey) {
      console.error('[Image Gen Error] ARK_API_KEY is missing');
      return NextResponse.json({ error: 'ARK_API_KEY is not configured' }, { status: 500 });
    }

    console.log(`[Image Gen Request] Model: ${model}, Prompt: ${prompt}`);

    const response = await fetch(`${baseURL}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        size: size,
        response_format: 'url',
        n: images ? (Array.isArray(images) ? images.length : 1) : 1,
        // Volcengine specific extras, merged into top level or extra_body depending on API style. 
        // OpenAI SDK puts them in body. Standard OpenAI API puts them in body.
        // But the aicut code used `extra_body`. Let's assume standard body merge.
        watermark: true, 
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Image Gen Error] API Response:', errorText);
      return NextResponse.json({ error: 'Failed to generate image', details: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Image Gen Error] Exception:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
