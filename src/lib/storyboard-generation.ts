export type StoryboardAssetContext = {
  id?: string;
  name: string;
  type?: string;
};

export type StoryboardCharacterContext = {
  name: string;
  description: string;
  imageUrl?: string;
};

export type StoryboardSuggestedAssets =
  | {
      characters?: string[];
      locations?: string[];
    }
  | Array<{ name?: string | null }>;

export type StoryboardPlanShot = {
  sequence?: number;
  sceneLabel?: string;
  scriptExcerpt?: string;
  previousScriptExcerpt?: string;
  nextScriptExcerpt?: string;
  sourceBeatRange?: string;
  beat?: string;
  continuityIn?: string;
  continuityOut?: string;
  stateChange?: string;
  camera?: string;
  size?: string;
  duration?: number;
  dialogue?: string;
  suggestedAssetNames?: string[];
  suggestedAssets?: StoryboardSuggestedAssets;
  characters?: StoryboardCharacterContext[];
};

export type StoryboardGeneratedShot = {
  description?: string;
  sceneLabel?: string;
  scriptExcerpt?: string;
  previousScriptExcerpt?: string;
  nextScriptExcerpt?: string;
  sourceBeatRange?: string;
  characterAction?: string;
  emotion?: string;
  lightingAtmosphere?: string;
  soundEffect?: string;
  dialogue?: string;
  camera?: string;
  size?: string;
  duration?: number;
  sensitivityReduction?: number;
  videoPrompt?: string;
  characters?: StoryboardCharacterContext[];
  suggestedAssetNames?: string[];
  suggestedAssets?: StoryboardSuggestedAssets;
};

const STORYBOARD_TARGET_CHUNK_LENGTH = 2200;
const STORYBOARD_MAX_CHUNK_LENGTH = 3000;

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const stripHtmlPreservingBreaks = (value: string) => {
  const normalized = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<hr\s*\/?>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(normalized);
};

const normalizePlainText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const splitLongParagraph = (paragraph: string, maxChunkLength: number) => {
  if (paragraph.length <= maxChunkLength) return [paragraph];

  const sentences = paragraph
    .split(/(?<=[。！？!?；;])\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    const parts: string[] = [];
    for (let index = 0; index < paragraph.length; index += maxChunkLength) {
      parts.push(paragraph.slice(index, index + maxChunkLength).trim());
    }
    return parts.filter(Boolean);
  }

  const result: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxChunkLength) {
      if (current) result.push(current);
      if (sentence.length > maxChunkLength) {
        result.push(...splitLongParagraph(sentence, maxChunkLength));
        current = '';
      } else {
        current = sentence;
      }
    } else {
      current = next;
    }
  }

  if (current) result.push(current);
  return result;
};

export const extractStoryboardScriptText = (value: string) => {
  if (!value) return '';
  return normalizePlainText(stripHtmlPreservingBreaks(value));
};

export const chunkStoryboardScript = (
  content: string,
  {
    targetChunkLength = STORYBOARD_TARGET_CHUNK_LENGTH,
    maxChunkLength = STORYBOARD_MAX_CHUNK_LENGTH,
  }: {
    targetChunkLength?: number;
    maxChunkLength?: number;
  } = {}
) => {
  const plainText = extractStoryboardScriptText(content);
  if (!plainText) return [];

  const paragraphs = plainText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitLongParagraph(paragraph, maxChunkLength));

  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const nextChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    const shouldFlush =
      currentChunk.length > 0 &&
      nextChunk.length > maxChunkLength &&
      currentChunk.length >= Math.min(targetChunkLength, maxChunkLength);

    if (shouldFlush) {
      chunks.push(currentChunk);
      currentChunk = paragraph;
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk) chunks.push(currentChunk);

  return chunks;
};

export const compactStoryboardAssets = (
  assets: Array<{ id?: unknown; name?: unknown; type?: unknown }>
): StoryboardAssetContext[] => {
  const seen = new Set<string>();
  const result: StoryboardAssetContext[] = [];

  for (const asset of assets) {
    const name = typeof asset?.name === 'string' ? asset.name.trim() : '';
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      id: typeof asset?.id === 'string' ? asset.id : undefined,
      name,
      type: typeof asset?.type === 'string' ? asset.type : undefined,
    });
  }

  return result;
};

export const collectStoryboardSuggestedNames = (
  shot: Pick<StoryboardGeneratedShot | StoryboardPlanShot, 'suggestedAssetNames' | 'suggestedAssets'>
) => {
  const suggestedNames: string[] = [];

  if (Array.isArray(shot.suggestedAssetNames)) {
    suggestedNames.push(
      ...shot.suggestedAssetNames.filter((name): name is string => typeof name === 'string')
    );
  }

  if (shot.suggestedAssets) {
    if (Array.isArray(shot.suggestedAssets)) {
      suggestedNames.push(
        ...shot.suggestedAssets
          .map((item) => item?.name)
          .filter((name): name is string => typeof name === 'string')
      );
    } else {
      const { characters, locations } = shot.suggestedAssets;
      if (Array.isArray(characters)) suggestedNames.push(...characters);
      if (Array.isArray(locations)) suggestedNames.push(...locations);
    }
  }

  return Array.from(new Set(suggestedNames.map((name) => name.trim()).filter(Boolean)));
};

export const resolveStoryboardRelatedAssetIds = (
  shot: Pick<StoryboardGeneratedShot | StoryboardPlanShot, 'suggestedAssetNames' | 'suggestedAssets'>,
  assets: Array<{ id: string; name: string }>
) => {
  const relatedIds: string[] = [];
  const suggestedNames = collectStoryboardSuggestedNames(shot);
  const normalize = (value: string) => value.trim().toLowerCase();

  for (const name of suggestedNames) {
    const normalizedName = normalize(name);
    const exact = assets.find((asset) => normalize(asset.name) === normalizedName);
    const fuzzy = assets.find(
      (asset) =>
        normalize(asset.name).includes(normalizedName) ||
        normalizedName.includes(normalize(asset.name))
    );
    const matchedAsset = exact || fuzzy;
    if (matchedAsset && !relatedIds.includes(matchedAsset.id)) {
      relatedIds.push(matchedAsset.id);
    }
  }

  return relatedIds;
};
