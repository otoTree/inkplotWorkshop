export type Seedance2Reference = {
  usableUrl: string;
  mode: 'asset_uri' | 'url';
  sourceUrl?: string;
  volcengineAssetStatus?: string | null;
  contentType?: 'image_url' | 'video_url' | 'audio_url';
  role?: 'reference_image' | 'reference_video' | 'reference_audio';
};

export type Seedance2AspectRatio = '9:16' | '16:9';
export type Seedance2Resolution = '480p';
export type OverseasSeedance2Size = '1280x720' | '720x1280';
export const DEFAULT_SEEDANCE_2_RESOLUTION: Seedance2Resolution = '480p';

export type ArkSeedance2VideoPayload = {
  model: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string }; role: 'reference_image' }
    | { type: 'video_url'; video_url: { url: string }; role: 'reference_video' }
    | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' }
  >;
  generate_audio?: boolean;
  ratio?: Seedance2AspectRatio;
  resolution: Seedance2Resolution;
  duration?: number;
  watermark?: boolean;
};

export type OverseasSeedance2VideoPayload = {
  model: 'intsd20-hc' | 'intsd20-hc-f';
  prompt: string;
  size: OverseasSeedance2Size;
  duration?: number;
  reference_images: Array<{ url: string }>;
};

export type Seedance2VideoPayload =
  | ArkSeedance2VideoPayload
  | OverseasSeedance2VideoPayload;

type Seedance2VideoPayloadForModel<TModel extends string> =
  TModel extends OverseasSeedance2VideoPayload['model']
    ? OverseasSeedance2VideoPayload
    : OverseasSeedance2VideoPayload['model'] extends TModel
      ? Seedance2VideoPayload
      : ArkSeedance2VideoPayload;

type BuildSeedance2VideoPayloadParams<TModel extends string> = {
  model: TModel;
  prompt: string;
  references?: Seedance2Reference[];
  duration?: number;
  ratio?: Seedance2AspectRatio;
  generateAudio?: boolean;
  watermark?: boolean;
};

export const isOverseasSeedance2Model = (
  model?: string | null
): model is OverseasSeedance2VideoPayload['model'] =>
  model === 'intsd20-hc' || model === 'intsd20-hc-f';

export const normalizeSeedance2AspectRatio = (value?: string | null): Seedance2AspectRatio =>
  value === '16:9' ? '16:9' : '9:16';

const isObjectStorageUrl = (value: string) => /^https?:\/\//i.test(value);

const resolveReferenceUrl = (reference: Seedance2Reference) => {
  if (reference.sourceUrl && isObjectStorageUrl(reference.sourceUrl)) {
    return reference.sourceUrl;
  }
  return isObjectStorageUrl(reference.usableUrl) ? reference.usableUrl : null;
};

export function buildSeedance2VideoPayload<TModel extends string>(
  params: BuildSeedance2VideoPayloadParams<TModel>
): Seedance2VideoPayloadForModel<TModel>;
export function buildSeedance2VideoPayload({
  model,
  prompt,
  references = [],
  duration,
  ratio = '9:16',
  generateAudio = true,
  watermark = false,
}: BuildSeedance2VideoPayloadParams<string>): Seedance2VideoPayload {
  const resolvedReferences = references.flatMap((reference) => {
    if (reference.contentType && reference.contentType !== 'image_url') return [];
    const resolvedUrl = resolveReferenceUrl(reference);
    return resolvedUrl ? [resolvedUrl] : [];
  });

  if (isOverseasSeedance2Model(model)) {
    return {
      model,
      prompt,
      size: ratio === '16:9' ? '1280x720' : '720x1280',
      ...(duration ? { duration } : {}),
      reference_images: resolvedReferences.map((url) => ({ url })),
    };
  }

  const content: ArkSeedance2VideoPayload['content'] = [
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
    resolution: DEFAULT_SEEDANCE_2_RESOLUTION,
    ...(duration ? { duration } : {}),
    watermark,
  };
}
