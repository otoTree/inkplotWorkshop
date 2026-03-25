import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');
  const folder = searchParams.get('folder');

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!filename || !request.body) {
    return NextResponse.json({ error: 'Filename and body are required' }, { status: 400 });
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeFolder = (folder || '')
    .split('/')
    .map(segment => segment.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .filter(Boolean)
    .join('/');
  const path = safeFolder ? `${user.id}/${safeFolder}/${safeFilename}` : `${user.id}/${safeFilename}`;

  try {
    const blob = await put(path, request.body, {
      access: 'public',
      contentType: request.headers.get('content-type') || undefined,
    });

    return NextResponse.json(blob);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
