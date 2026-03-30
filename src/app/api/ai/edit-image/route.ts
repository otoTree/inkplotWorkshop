import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, callAIChatCompletion, extractFirstMessageContent, extractImageUrls, getAIAPIConfig } from '@/lib/ai-server';
import { put } from '@vercel/blob';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { imageUrl, prompt, upload = false, n = 1, aspectRatio = '1:1' } = body;
    if (!imageUrl || !prompt) {
      return NextResponse.json({ error: 'Missing imageUrl or prompt' }, { status: 400 });
    }

    const finalPrompt = aspectRatio !== '1:1' ? `${prompt}, aspect ratio ${aspectRatio}` : prompt;

    // Construct messages for Gemini image editing
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          },
          {
            type: 'text',
            text: finalPrompt
          }
        ]
      }
    ];

    const result = await callAIChatCompletion({
      messages,
      config: getAIAPIConfig(),
      extraPayload: { model: 'gemini-3-pro-image-preview', n }
    });

    let urls = extractImageUrls(result);
    
    if (urls.length === 0) {
      let raw = '';
      try {
        raw = extractFirstMessageContent(result);
      } catch {
        raw = '';
      }
      return NextResponse.json({ error: 'Image editing returned no urls', raw }, { status: 502 });
    }

    if (upload) {
      urls = await Promise.all(urls.map(async (url) => {
        if (url.startsWith('data:image/')) {
          const matches = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const contentType = matches[1];
            const b64Data = matches[2];
            const buffer = Buffer.from(b64Data, 'base64');
            const ext = contentType.split('/')[1] || 'png';
            const filename = `edited-images/img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
            
            const blob = await put(filename, buffer, {
              access: 'public',
              contentType,
            });
            return blob.url;
          }
        }
        return url;
      }));
    }

    return NextResponse.json({ data: urls.map((url) => ({ url })) });

  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    const err = error as { message?: string };
    console.error('[Image Edit Error] Exception:', error);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
