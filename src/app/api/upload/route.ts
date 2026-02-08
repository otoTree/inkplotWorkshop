import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!filename || !request.body) {
    return NextResponse.json({ error: 'Filename and body are required' }, { status: 400 });
  }

  // Use the user ID as a folder prefix to avoid collisions and better organize
  const path = `${user.id}/${filename}`;

  try {
    const blob = await put(path, request.body, {
      access: 'public',
    });

    return NextResponse.json(blob);
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
