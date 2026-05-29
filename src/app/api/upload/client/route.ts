import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300;

const MAX_IMAGE_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const ASSET_PATH_PATTERN = /^assets\/[a-zA-Z0-9_-]+\/(character|location|prop)\/[a-zA-Z0-9._-]+$/;

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: HandleUploadBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid upload payload' }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!ASSET_PATH_PATTERN.test(pathname)) {
          throw new Error('Invalid upload path');
        }

        return {
          allowedContentTypes: ['image/*'],
          maximumSizeInBytes: MAX_IMAGE_UPLOAD_SIZE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
