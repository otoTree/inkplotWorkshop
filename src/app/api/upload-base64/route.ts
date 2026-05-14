import { NextResponse } from 'next/server';
import { persistImageSource } from '@/lib/image-upload';

export async function POST(req: Request) {
  try {
    const { dataUrl, folder = 'uploads' } = await req.json();

    if (!dataUrl || typeof dataUrl !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid dataUrl' }, { status: 400 });
    }

    const url = await persistImageSource(dataUrl, folder);
    return NextResponse.json({ url });

  } catch (error: any) {
    console.error('[Upload Base64 Error] Exception:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
