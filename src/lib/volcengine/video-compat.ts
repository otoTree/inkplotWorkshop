import { isSeedance2Model } from './video-client.ts';

export type ProjectVideoModelPreference = 'legacy' | 'seedance-2.0';
export type ProjectVideoAspectRatio = '9:16' | '16:9';

export type ProjectVideoSettingsLike = {
  syncAssetsToPrivateLibrary?: boolean | null;
  assetGroupId?: string | null;
  projectName?: string | null;
  preferredVideoModel?: string | null;
  aspectRatio?: string | null;
};

export type NormalizedProjectVideoSettings = {
  syncAssetsToPrivateLibrary: boolean;
  assetGroupId?: string;
  projectName: string;
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
export const DEFAULT_VOLCENGINE_PROJECT_NAME = 'default';
export const DEFAULT_PROJECT_VIDEO_ASPECT_RATIO: ProjectVideoAspectRatio = '9:16';

const normalizeOptionalString = (value: string | null | undefined) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const normalizeProjectVideoModel = (
  value: string | null | undefined
): ProjectVideoModelPreference => {
  if (value === 'legacy' || value === 'seedance-2.0') return value;
  if (typeof value === 'string' && isSeedance2Model(value)) return 'seedance-2.0';
  return DEFAULT_PROJECT_VIDEO_MODEL;
};

export const normalizeProjectVideoAspectRatio = (
  value: string | null | undefined
): ProjectVideoAspectRatio => (value === '16:9' ? '16:9' : DEFAULT_PROJECT_VIDEO_ASPECT_RATIO);

export const normalizeProjectVideoSettings = (
  settings?: ProjectVideoSettingsLike | null
): NormalizedProjectVideoSettings => ({
  syncAssetsToPrivateLibrary: settings?.syncAssetsToPrivateLibrary === true,
  assetGroupId: normalizeOptionalString(settings?.assetGroupId),
  projectName: normalizeOptionalString(settings?.projectName) || DEFAULT_VOLCENGINE_PROJECT_NAME,
  preferredVideoModel: normalizeProjectVideoModel(settings?.preferredVideoModel),
  aspectRatio: normalizeProjectVideoAspectRatio(settings?.aspectRatio),
});

export const shouldUseSeedance2ForProject = (settings?: ProjectVideoSettingsLike | null) =>
  normalizeProjectVideoSettings(settings).preferredVideoModel === 'seedance-2.0';

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
