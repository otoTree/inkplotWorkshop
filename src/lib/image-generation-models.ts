export const SUPPORTED_IMAGE_GENERATION_MODELS = [
  'gemini-3-pro-image-preview',
  'gpt-image-2',
] as const;

export type SupportedImageGenerationModel =
  (typeof SUPPORTED_IMAGE_GENERATION_MODELS)[number];

export const DEFAULT_IMAGE_GENERATION_MODEL: SupportedImageGenerationModel =
  'gemini-3-pro-image-preview';

export const IMAGE_GENERATION_MODEL_LABELS: Record<
  SupportedImageGenerationModel,
  string
> = {
  'gemini-3-pro-image-preview': 'Gemini 3 Pro Image',
  'gpt-image-2': 'GPT-Image-2',
};

export const IMAGE_GENERATION_MODEL_DESCRIPTIONS: Record<
  SupportedImageGenerationModel,
  string
> = {
  'gemini-3-pro-image-preview': 'Google Gemini 系列，适合通用文生图与参考图生成',
  'gpt-image-2': 'OpenAI 图像系列，适合高质量构图与参考图生成',
};

export const isSupportedImageGenerationModel = (
  value: unknown
): value is SupportedImageGenerationModel =>
  typeof value === 'string' &&
  SUPPORTED_IMAGE_GENERATION_MODELS.includes(
    value as SupportedImageGenerationModel
  );

export const normalizeImageGenerationModel = (
  value: unknown
): SupportedImageGenerationModel =>
  isSupportedImageGenerationModel(value)
    ? value
    : DEFAULT_IMAGE_GENERATION_MODEL;
