import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIAPIError, downloadAIVideo } from '@/lib/ai-server';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const videoId = searchParams.get('videoId');
    const variant = searchParams.get('variant') || 'mp4';

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    const upstream = await downloadAIVideo(videoId, variant);
    
    // Handle manual redirects from the upstream API (e.g., Luma API redirecting to CDN)
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location');
      if (location) {
        return NextResponse.redirect(location);
      }
    }

    // If the upstream fetched a redirected URL (CDN) and followed it
    if (upstream.redirected && upstream.url) {
      return NextResponse.redirect(upstream.url);
    }

    const headers = new Headers();
    const safeHeaders = ['content-type', 'content-length', 'content-disposition', 'accept-ranges', 'content-range'];
    upstream.headers.forEach((value, key) => {
      if (safeHeaders.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    headers.set('Cache-Control', 'no-store');

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    if (error instanceof AIAPIError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    const err = error as { message?: string };
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
