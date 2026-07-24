import { isSeedance2Model } from './video-client.ts';

export type ProjectVideoModelPreference = 'legacy' | 'seedance-2.0';
export type ProjectVideoAspectRatio = '9:16' | '16:9';
export type Seedance2VideoModelSelection =
  | 'seedance-2-0-fast-tezan'
  | 'seedance-2-0-tezan'
  | 'intsd2-x';
export type ProjectVideoModelSelection = 'legacy' | Seedance2VideoModelSelection;

export type ProjectVideoSettingsLike = {
  syncAssetsToPrivateLibrary?: boolean | null;
  assetGroupId?: string | null;
  projectName?: string | null;
  model?: string | null;
  preferredVideoModel?: string | null;
  aspectRatio?: string | null;
};

export type NormalizedProjectVideoSettings = {
  syncAssetsToPrivateLibrary: boolean;
  assetGroupId?: string;
  projectName: string;
  model: ProjectVideoModelSelection;
  preferredVideoModel: ProjectVideoModelPreference;
  aspectRatio: ProjectVideoAspectRatio;
};

export type VideoGenerationMetadataLike = {
  provider?: string | null;
  model?: string | null;
  requestContentMode?: string | null;
  referenceAssetIds?: unknown;
};

export const DEFAULT_PROJECT_VIDEO_MODEL: ProjectVideoModelPreference = 'legacy';
export const FAST_SEEDANCE_2_VIDEO_MODEL = 'seedance-2-0-fast-tezan';
export const STANDARD_SEEDANCE_2_VIDEO_MODEL = 'seedance-2-0-tezan';
export const INTERNATIONAL_SEEDANCE_2_VIDEO_MODEL = 'intsd2-x';
export const DEFAULT_SEEDANCE_2_VIDEO_MODEL: ProjectVideoModelSelection =
  FAST_SEEDANCE_2_VIDEO_MODEL;
export const SEEDANCE_2_VIDEO_MODEL_OPTIONS = [
  {
    value: FAST_SEEDANCE_2_VIDEO_MODEL,
    label: 'Seedance 2.0 Fast',
  },
  {
    value: STANDARD_SEEDANCE_2_VIDEO_MODEL,
    label: 'Seedance 2.0 标准版',
  },
  {
    value: INTERNATIONAL_SEEDANCE_2_VIDEO_MODEL,
    label: 'Seedance 2.0 国际版',
  },
] satisfies Array<{ value: Seedance2VideoModelSelection; label: string }>;
export const DEFAULT_VOLCENGINE_PROJECT_NAME = 'tz';
export const DEFAULT_PROJECT_VIDEO_ASPECT_RATIO: ProjectVideoAspectRatio = '9:16';
export const PROJECT_VIDEO_MODEL_OPTIONS = [
  {
    value: 'legacy' as const,
    label: '默认视频模型',
    description: '使用服务端默认视频模型配置。',
  },
  {
    value: DEFAULT_SEEDANCE_2_VIDEO_MODEL,
    label: 'Seedance 2.0 Fast',
    description: `${DEFAULT_SEEDANCE_2_VIDEO_MODEL}，快速模型。`,
  },
  {
    value: STANDARD_SEEDANCE_2_VIDEO_MODEL,
    label: 'Seedance 2.0 标准版',
    description: `${STANDARD_SEEDANCE_2_VIDEO_MODEL}，标准模型。`,
  },
  {
    value: INTERNATIONAL_SEEDANCE_2_VIDEO_MODEL,
    label: 'Seedance 2.0 国际版',
    description: `${INTERNATIONAL_SEEDANCE_2_VIDEO_MODEL}，直接使用对象存储链接，不经过火山素材库。`,
  },
] as const;

const normalizeOptionalString = (value: string | null | undefined) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const isSupportedSeedance2VideoModel = (
  value: string | null | undefined
): value is Seedance2VideoModelSelection =>
  SEEDANCE_2_VIDEO_MODEL_OPTIONS.some((option) => option.value === value);

export const isInternationalSeedance2Model = (value: string | null | undefined) =>
  normalizeOptionalString(value)?.toLowerCase() === INTERNATIONAL_SEEDANCE_2_VIDEO_MODEL;

export const normalizeProjectVideoModel = (
  value: string | null | undefined
): ProjectVideoModelPreference => {
  if (value === 'legacy' || value === 'seedance-2.0') return value;
  if (typeof value === 'string' && isSeedance2Model(value)) return 'seedance-2.0';
  return DEFAULT_PROJECT_VIDEO_MODEL;
};

export const normalizeProjectVideoGenerationModel = (
  value: string | null | undefined,
  preferredVideoModel?: ProjectVideoModelPreference
): ProjectVideoModelSelection => {
  const normalizedValue = normalizeOptionalString(value);
  if (normalizedValue === 'legacy') return 'legacy';
  if (isSupportedSeedance2VideoModel(normalizedValue)) {
    return normalizedValue;
  }
  if (normalizedValue && isSeedance2Model(normalizedValue)) {
    return DEFAULT_SEEDANCE_2_VIDEO_MODEL;
  }
  if (preferredVideoModel === 'seedance-2.0') return DEFAULT_SEEDANCE_2_VIDEO_MODEL;
  return 'legacy';
};

export const normalizeProjectVideoAspectRatio = (
  value: string | null | undefined
): ProjectVideoAspectRatio => (value === '16:9' ? '16:9' : DEFAULT_PROJECT_VIDEO_ASPECT_RATIO);

export const normalizeProjectVideoSettings = (
  settings?: ProjectVideoSettingsLike | null
): NormalizedProjectVideoSettings => {
  const preferredVideoModel = normalizeProjectVideoModel(
    settings?.preferredVideoModel ?? settings?.model
  );
  const model = normalizeProjectVideoGenerationModel(settings?.model, preferredVideoModel);

  return {
    syncAssetsToPrivateLibrary:
      !isInternationalSeedance2Model(model) && settings?.syncAssetsToPrivateLibrary === true,
    assetGroupId: normalizeOptionalString(settings?.assetGroupId),
    projectName: normalizeOptionalString(settings?.projectName) || DEFAULT_VOLCENGINE_PROJECT_NAME,
    model,
    preferredVideoModel,
    aspectRatio: normalizeProjectVideoAspectRatio(settings?.aspectRatio),
  };
};

export const shouldUseSeedance2ForProject = (settings?: ProjectVideoSettingsLike | null) =>
  normalizeProjectVideoSettings(settings).preferredVideoModel === 'seedance-2.0';

export const resolveProjectVideoGenerationModel = (
  settings?: ProjectVideoSettingsLike | null
) => {
  const normalized = normalizeProjectVideoSettings(settings);
  return normalized.model === 'legacy' ? undefined : normalized.model;
};

const looksLikeVolcengineProvider = (value: string | null | undefined) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'volcengine' || normalized.includes('seedance');
};

const hasReferenceAssetIds = (value: unknown) =>
  Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);

export const inferVideoTaskProvider = (
  videoId: string,
  metadata?: VideoGenerationMetadataLike | null
): 'volcengine' | 'legacy' => {
  if (looksLikeVolcengineProvider(metadata?.provider)) return 'volcengine';
  if (metadata?.provider === 'legacy') return 'legacy';
  if (isSeedance2Model(metadata?.model)) return 'volcengine';
  if (normalizeOptionalString(metadata?.requestContentMode)) return 'volcengine';
  if (hasReferenceAssetIds(metadata?.referenceAssetIds)) return 'volcengine';
  if (/^cgt-/i.test(videoId)) return 'volcengine';
  return 'legacy';
};
