import {
  ArtStyleConfig,
  Project,
  ProjectVisualStylePreset,
  ProjectVisualStylePresetSource,
} from '@/types';

type ProjectVisualStyleFields = Pick<Project, 'visualStylePreset' | 'artStyle' | 'characterArtStyle' | 'sceneArtStyle'>;

export const DEFAULT_PROJECT_VISUAL_STYLE_PRESET: ProjectVisualStylePreset = 'domestic-live-action';

export const PROJECT_VISUAL_STYLE_PRESET_LABELS: Record<ProjectVisualStylePreset, string> = {
  'overseas-live-action': '海外真人剧',
  'domestic-live-action': '国内真人剧',
  'domestic-3dcg': '国内 3DCG 剧',
};

export const PROJECT_VISUAL_STYLE_PRESET_OPTIONS = [
  { value: 'overseas-live-action', label: PROJECT_VISUAL_STYLE_PRESET_LABELS['overseas-live-action'] },
  { value: 'domestic-live-action', label: PROJECT_VISUAL_STYLE_PRESET_LABELS['domestic-live-action'] },
  { value: 'domestic-3dcg', label: PROJECT_VISUAL_STYLE_PRESET_LABELS['domestic-3dcg'] },
] as const satisfies ReadonlyArray<{ value: ProjectVisualStylePreset; label: string }>;

export const PROJECT_VISUAL_STYLE_PRESET_DESCRIPTIONS: Record<ProjectVisualStylePreset, string> = {
  'overseas-live-action': '国际流媒体真人剧质感，强调摄影写实与高级电影感。',
  'domestic-live-action': '国产真人短剧语境，强调情绪张力、现实场景与表演质感。',
  'domestic-3dcg': '国产 3DCG 剧集语言，允许风格化角色、材质细节与渲染表现。',
};

const PROJECT_VISUAL_STYLE_PRESET_ALIASES: Record<ProjectVisualStylePreset, string[]> = {
  'overseas-live-action': [
    'overseas-live-action',
    'overseas_live_action',
    '海外真人剧',
    '海外真人',
    '欧美真人剧',
    '欧美真人',
    'western live action',
    'international live action',
    'live action overseas',
  ],
  'domestic-live-action': [
    'domestic-live-action',
    'domestic_live_action',
    '国内真人剧',
    '国内真人',
    '国产真人剧',
    '国产真人',
    '华语真人剧',
    'chinese live action',
    'mainland live action',
  ],
  'domestic-3dcg': [
    'domestic-3dcg',
    'domestic_3dcg',
    'domestic-3d-cg',
    '国内3dcg剧',
    '国内 3dcg 剧',
    '国内3d剧',
    '国内 3d 剧',
    '国内cg剧',
    '国内 3dcg',
    '国产3dcg剧',
    '国产 3dcg 剧',
    'chinese 3dcg',
    'domestic 3dcg',
  ],
};

const PROJECT_VISUAL_STYLE_PRESET_DERIVED_STYLES: Record<ProjectVisualStylePreset, Required<ArtStyleConfig>> = {
  'overseas-live-action': {
    visualStylePreset: 'overseas-live-action',
    artStyle: 'Premium overseas live-action drama, cinematic realism, photorealistic, high-end streaming series look',
    characterArtStyle: 'Overseas live-action drama character styling, photorealistic skin texture, cinematic portrait lighting',
    sceneArtStyle: 'Overseas live-action drama production design, realistic locations, layered cinematic lighting, premium atmosphere',
  },
  'domestic-live-action': {
    visualStylePreset: 'domestic-live-action',
    artStyle: 'Premium domestic live-action short drama, cinematic realism, photorealistic, emotionally heightened Chinese drama look',
    characterArtStyle: 'Domestic live-action drama character styling, photorealistic portrait, polished wardrobe, expressive cinematic lighting',
    sceneArtStyle: 'Domestic live-action drama environments, realistic Chinese settings, cinematic lighting, emotionally charged atmosphere',
  },
  'domestic-3dcg': {
    visualStylePreset: 'domestic-3dcg',
    artStyle: 'Domestic premium 3DCG short drama, stylized cinematic rendering, high-detail characters, dramatic lighting',
    characterArtStyle: 'Domestic 3DCG character design, stylized proportions, high-detail materials, cinematic rim lighting',
    sceneArtStyle: 'Domestic 3DCG environment design, stylized sets, cinematic volumetric lighting, detailed rendered atmosphere',
  },
};

const LEGACY_3DCG_HINTS = ['3dcg', '3d cg', '3d', 'cg', 'c4d', 'blender', '动画', '卡通', '二次元'];
const LEGACY_OVERSEAS_HINTS = ['海外', '欧美', 'western', 'hollywood', 'netflix', 'hbo', 'caucasian', 'latino', 'black'];
const LEGACY_DOMESTIC_HINTS = ['国内', '国产', '华语', '中式', '国风', '东方'];

const cleanString = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const normalizeProjectVisualStylePreset = (value: unknown): ProjectVisualStylePreset | undefined => {
  const normalized = cleanString(value)?.toLowerCase();
  if (!normalized) return undefined;

  for (const [preset, aliases] of Object.entries(PROJECT_VISUAL_STYLE_PRESET_ALIASES) as Array<[ProjectVisualStylePreset, string[]]>) {
    if (aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return preset;
    }
  }

  return undefined;
};

const inferProjectVisualStylePreset = (fields: Partial<ProjectVisualStyleFields>): ProjectVisualStylePreset | undefined => {
  const haystack = [fields.artStyle, fields.characterArtStyle, fields.sceneArtStyle]
    .map((item) => cleanString(item)?.toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (!haystack) return undefined;
  if (LEGACY_3DCG_HINTS.some((hint) => haystack.includes(hint))) return 'domestic-3dcg';
  if (LEGACY_OVERSEAS_HINTS.some((hint) => haystack.includes(hint))) return 'overseas-live-action';
  if (LEGACY_DOMESTIC_HINTS.some((hint) => haystack.includes(hint))) return 'domestic-live-action';
  return undefined;
};

const readProjectVisualStyleFields = (value: unknown): Partial<ProjectVisualStyleFields> => {
  if (!value) return {};

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return {
      visualStylePreset: normalizeProjectVisualStylePreset(
        record.visualStylePreset ?? record.projectVisualStylePreset ?? record.dramaVisualStylePreset
      ),
      artStyle: cleanString(record.artStyle),
      characterArtStyle: cleanString(record.characterArtStyle),
      sceneArtStyle: cleanString(record.sceneArtStyle),
    };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === 'object') {
        return readProjectVisualStyleFields(parsed);
      }
    } catch {
      return {
        visualStylePreset: normalizeProjectVisualStylePreset(trimmed),
        artStyle: trimmed,
      };
    }

    return {
      visualStylePreset: normalizeProjectVisualStylePreset(trimmed),
      artStyle: trimmed,
    };
  }

  return {};
};

export const parseProjectVisualStyle = (value: unknown): ArtStyleConfig => {
  const resolved = resolveProjectVisualStyleSelection(value);
  return {
    visualStylePreset: resolved.visualStylePreset,
    artStyle: resolved.artStyle,
    characterArtStyle: resolved.characterArtStyle,
    sceneArtStyle: resolved.sceneArtStyle,
  };
};

export const resolveProjectVisualStyleSelection = (
  value: unknown
): ArtStyleConfig & { source: ProjectVisualStylePresetSource } => {
  const fields = readProjectVisualStyleFields(value);
  const inferredPreset = inferProjectVisualStylePreset(fields);
  const source: ProjectVisualStylePresetSource = fields.visualStylePreset
    ? 'preset'
    : inferredPreset
      ? 'legacy-inferred'
      : 'default';

  return {
    visualStylePreset:
      fields.visualStylePreset ||
      inferredPreset ||
      DEFAULT_PROJECT_VISUAL_STYLE_PRESET,
    artStyle: fields.artStyle,
    characterArtStyle: fields.characterArtStyle,
    sceneArtStyle: fields.sceneArtStyle,
    source,
  };
};

export const serializeProjectVisualStyle = (input: Partial<Project>): string | null => {
  const artStyle = cleanString(input.artStyle);
  const characterArtStyle = cleanString(input.characterArtStyle);
  const sceneArtStyle = cleanString(input.sceneArtStyle);
  const visualStylePreset =
    normalizeProjectVisualStylePreset(input.visualStylePreset) ||
    inferProjectVisualStylePreset({ artStyle, characterArtStyle, sceneArtStyle });

  if (!visualStylePreset && !artStyle && !characterArtStyle && !sceneArtStyle) {
    return null;
  }

  return JSON.stringify({
    visualStylePreset: visualStylePreset || DEFAULT_PROJECT_VISUAL_STYLE_PRESET,
    artStyle,
    characterArtStyle,
    sceneArtStyle,
  });
};

export const resolveArtStyleConfig = (input?: unknown): Required<ArtStyleConfig> => {
  const parsed = parseProjectVisualStyle(input);
  const preset = parsed.visualStylePreset || DEFAULT_PROJECT_VISUAL_STYLE_PRESET;
  const derived = PROJECT_VISUAL_STYLE_PRESET_DERIVED_STYLES[preset];

  return {
    visualStylePreset: preset,
    artStyle: parsed.artStyle || derived.artStyle,
    characterArtStyle: parsed.characterArtStyle || parsed.artStyle || derived.characterArtStyle,
    sceneArtStyle: parsed.sceneArtStyle || parsed.artStyle || derived.sceneArtStyle,
  };
};

export const buildVisualStyleRequestPayload = (input?: unknown): Required<ArtStyleConfig> => {
  const resolved = resolveArtStyleConfig(input);
  return {
    visualStylePreset: resolved.visualStylePreset,
    artStyle: resolved.artStyle,
    characterArtStyle: resolved.characterArtStyle,
    sceneArtStyle: resolved.sceneArtStyle,
  };
};

export const getProjectVisualStylePresetLabel = (preset?: ProjectVisualStylePreset) => {
  return PROJECT_VISUAL_STYLE_PRESET_LABELS[
    preset || DEFAULT_PROJECT_VISUAL_STYLE_PRESET
  ];
};
