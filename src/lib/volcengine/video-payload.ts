export type Seedance2Reference = {
  usableUrl: string;
  mode: 'asset_uri' | 'url';
  sourceUrl?: string;
  volcengineAssetStatus?: string | null;
  contentType?: 'image_url' | 'video_url' | 'audio_url';
  role?: 'reference_image' | 'reference_video' | 'reference_audio';
};

export type Seedance2AspectRatio = '9:16' | '16:9';
export type Seedance2Resolution = '1080p';

export type Seedance2VideoPayload = {
  model: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string }; role: 'reference_image' }
    | { type: 'video_url'; video_url: { url: string }; role: 'reference_video' }
    | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' }
  >;
  generate_audio?: boolean;
  ratio?: Seedance2AspectRatio;
  resolution?: Seedance2Resolution;
  duration?: number;
  watermark?: boolean;
};

export const normalizeSeedance2AspectRatio = (value?: string | null): Seedance2AspectRatio =>
  value === '16:9' ? '16:9' : '9:16';

const isAssetUri = (value: string) => /^asset:\/\/[^/\s]+$/i.test(value);

const resolveReferenceUrl = (reference: Seedance2Reference) => {
  const fallbackUrl = reference.sourceUrl || (reference.mode === 'url' ? reference.usableUrl : '');

  if (reference.mode === 'asset_uri') {
    if (reference.volcengineAssetStatus === 'Active' && isAssetUri(reference.usableUrl)) {
      return reference.usableUrl;
    }
    return fallbackUrl || null;
  }

  if (isAssetUri(reference.usableUrl)) {
    return reference.volcengineAssetStatus === 'Active' ? reference.usableUrl : fallbackUrl || null;
  }

  return reference.usableUrl;
};

export const buildSeedance2VideoPayload = ({
  model,
  prompt,
  references = [],
  duration,
  ratio = '9:16',
  resolution = '1080p',
  generateAudio = true,
  watermark = false,
}: {
  model: string;
  prompt: string;
  references?: Seedance2Reference[];
  duration?: number;
  ratio?: Seedance2AspectRatio;
  resolution?: Seedance2Resolution;
  generateAudio?: boolean;
  watermark?: boolean;
}): Seedance2VideoPayload => {
  const content: Seedance2VideoPayload['content'] = [
    {
      type: 'text',
      text: prompt,
    },
  ];

  for (const reference of references) {
    const resolvedUrl = resolveReferenceUrl(reference);
    if (!resolvedUrl) continue;
    const contentType = reference.contentType || 'image_url';
    if (contentType === 'video_url') {
      content.push({
        type: 'video_url',
        video_url: { url: resolvedUrl },
        role: reference.role === 'reference_video' ? reference.role : 'reference_video',
      });
    } else if (contentType === 'audio_url') {
      content.push({
        type: 'audio_url',
        audio_url: { url: resolvedUrl },
        role: reference.role === 'reference_audio' ? reference.role : 'reference_audio',
      });
    } else {
      content.push({
        type: 'image_url',
        image_url: { url: resolvedUrl },
        role: 'reference_image',
      });
    }
  }

  return {
    model,
    content,
    generate_audio: generateAudio,
    ratio,
    resolution,
    ...(duration ? { duration } : {}),
    watermark,
  };
};
