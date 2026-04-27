export type Seedance2Reference = {
  usableUrl: string;
  mode: 'asset_uri' | 'url';
  contentType?: 'image_url' | 'video_url' | 'audio_url';
  role?: 'reference_image' | 'reference_video' | 'reference_audio';
};

export type Seedance2VideoPayload = {
  model: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string }; role: 'reference_image' }
    | { type: 'video_url'; video_url: { url: string }; role: 'reference_video' }
    | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' }
  >;
  generate_audio?: boolean;
  ratio?: string;
  duration?: number;
  watermark?: boolean;
};

export const buildSeedance2VideoPayload = ({
  model,
  prompt,
  references = [],
  duration,
  ratio = '9:16',
  generateAudio = true,
  watermark = false,
}: {
  model: string;
  prompt: string;
  references?: Seedance2Reference[];
  duration?: number;
  ratio?: string;
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
    if (!reference.usableUrl) continue;
    const contentType = reference.contentType || 'image_url';
    if (contentType === 'video_url') {
      content.push({
        type: 'video_url',
        video_url: { url: reference.usableUrl },
        role: reference.role === 'reference_video' ? reference.role : 'reference_video',
      });
    } else if (contentType === 'audio_url') {
      content.push({
        type: 'audio_url',
        audio_url: { url: reference.usableUrl },
        role: reference.role === 'reference_audio' ? reference.role : 'reference_audio',
      });
    } else {
      content.push({
        type: 'image_url',
        image_url: { url: reference.usableUrl },
        role: 'reference_image',
      });
    }
  }

  return {
    model,
    content,
    generate_audio: generateAudio,
    ratio,
    ...(duration ? { duration } : {}),
    watermark,
  };
};
