import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // 核心优化：直接返回流 (ReadableStream) 而不是读取到内存中 (arrayBuffer)
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Proxy fetch error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
