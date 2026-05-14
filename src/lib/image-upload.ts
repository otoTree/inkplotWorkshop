import { put } from '@vercel/blob';

const IMAGE_URL_PATTERN = /^https?:\/\//i;

const guessExtensionFromUrl = (url: string) => {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
};

const getExtensionFromContentType = (contentType: string) => {
  const subtype = contentType.split('/')[1]?.split(';')[0]?.trim().toLowerCase();
  if (!subtype) return 'png';
  if (subtype === 'jpeg') return 'jpg';
  return subtype;
};

export const persistImageSource = async (
  source: string,
  folder: string
): Promise<string> => {
  if (!source || typeof source !== 'string') return source;

  if (source.startsWith('data:image/')) {
    const matches = source.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return source;

    const contentType = matches[1];
    const b64Data = matches[2];
    const buffer = Buffer.from(b64Data, 'base64');
    const ext = getExtensionFromContentType(contentType);
    const filename = `${folder}/img_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}.${ext}`;

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType,
    });

    return blob.url;
  }

  if (IMAGE_URL_PATTERN.test(source)) {
    const imageResponse = await fetch(source);
    if (!imageResponse.ok) {
      throw new Error(`无法下载远程图片: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const contentTypeHeader =
      imageResponse.headers.get('content-type') || 'image/png';
    const contentType = contentTypeHeader.startsWith('image/')
      ? contentTypeHeader
      : 'image/png';
    const ext =
      guessExtensionFromUrl(source) || getExtensionFromContentType(contentType);
    const filename = `${folder}/img_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}.${ext}`;

    const blob = await put(filename, Buffer.from(arrayBuffer), {
      access: 'public',
      contentType,
    });

    return blob.url;
  }

  return source;
};
