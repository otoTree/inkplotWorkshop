import { isSeedance2Model } from './video-client.ts';

export type ProjectVideoModelPreference = 'legacy' | 'seedance-2.0';
export type ProjectVideoAspectRatio = '9:16' | '16:9';
export type Seedance2VideoModelSelection =
  | 'dreamina-seedance-2-0-260128'
  | 'doubao-seedance-2-0-260128';
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
export const DEFAULT_SEEDANCE_2_VIDEO_MODEL: ProjectVideoModelSelection =
  'dreamina-seedance-2-0-260128';
export const SEEDANCE_2_VIDEO_MODEL_OPTIONS = [
  {
    value: 'dreamina-seedance-2-0-260128' as const,
    label: 'Seedance 2.0 国际版',
  },
  {
    value: 'doubao-seedance-2-0-260128' as const,
    label: 'Seedance 2.0 国内版',
  },
] satisfies Array<{ value: Seedance2VideoModelSelection; label: string }>;
export const DEFAULT_VOLCENGINE_PROJECT_NAME = 'default';
export const DEFAULT_PROJECT_VIDEO_ASPECT_RATIO: ProjectVideoAspectRatio = '9:16';
export const PROJECT_VIDEO_MODEL_OPTIONS = [
  {
    value: 'legacy' as const,
    label: '默认视频模型',
    description: '使用服务端默认视频模型配置。',
  },
  {
    value: DEFAULT_SEEDANCE_2_VIDEO_MODEL,
    label: 'Seedance 2.0 国际版',
    description: `${DEFAULT_SEEDANCE_2_VIDEO_MODEL}，国际版默认模型。`,
  },
  {
    value: 'doubao-seedance-2-0-260128' as const,
    label: 'Seedance 2.0 国内版',
    description: 'doubao-seedance-2-0-260128，国内版模型。',
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

  return {
    syncAssetsToPrivateLibrary: settings?.syncAssetsToPrivateLibrary === true,
    assetGroupId: normalizeOptionalString(settings?.assetGroupId),
    projectName: normalizeOptionalString(settings?.projectName) || DEFAULT_VOLCENGINE_PROJECT_NAME,
    model: normalizeProjectVideoGenerationModel(settings?.model, preferredVideoModel),
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
