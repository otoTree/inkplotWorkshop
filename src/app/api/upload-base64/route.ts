import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(req: Request) {
  try {
    const { dataUrl, folder = 'uploads' } = await req.json();

    if (!dataUrl || typeof dataUrl !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid dataUrl' }, { status: 400 });
    }

    // Only process base64 data URIs
    if (dataUrl.startsWith('data:image/')) {
      const matches = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const contentType = matches[1];
        const b64Data = matches[2];
        const buffer = Buffer.from(b64Data, 'base64');
        const ext = contentType.split('/')[1] || 'png';
        const filename = `${folder}/img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
        
        const blob = await put(filename, buffer, {
          access: 'public',
          contentType,
        });
        
        return NextResponse.json({ url: blob.url });
      }
    }

    // If it's already a URL, just return it
    return NextResponse.json({ url: dataUrl });

  } catch (error: any) {
    console.error('[Upload Base64 Error] Exception:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}