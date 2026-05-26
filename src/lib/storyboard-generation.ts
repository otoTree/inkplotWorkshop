export type StoryboardAssetContext = {
  id?: string;
  name: string;
  type?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type StoryboardCharacterContext = {
  name: string;
  description: string;
  imageUrl?: string;
};

export const NO_SUBTITLE_VIDEO_PROMPT_SUFFIX =
  '不要生成字幕，不要生成任何屏幕文字、标题、标语、下三分之一字幕或对白字幕。';

export const appendNoSubtitleDirective = (prompt: string) => {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return '';
  if (trimmedPrompt.includes(NO_SUBTITLE_VIDEO_PROMPT_SUFFIX)) {
    return trimmedPrompt;
  }
  return `${trimmedPrompt}\n${NO_SUBTITLE_VIDEO_PROMPT_SUFFIX}`;
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
  sequence?: number;
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

export type StoryboardDialogueLine = {
  speaker: string;
  text: string;
  raw: string;
  normalizedText: string;
};

export type StoryboardDialogueOverfill = {
  sequence?: number;
  duration: number;
  estimatedSeconds: number;
  dialogue: string;
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
  assets: Array<{
    id?: unknown;
    name?: unknown;
    type?: unknown;
    description?: unknown;
    metadata?: unknown;
  }>
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
      description:
        typeof asset?.description === 'string' && asset.description.trim()
          ? asset.description.trim().slice(0, 220)
          : undefined,
      metadata:
        asset?.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
          ? (asset.metadata as Record<string, unknown>)
          : undefined,
    });
  }

  return result;
};

export const normalizeStoryboardDialogueText = (value: string) =>
  value
    .replace(/[“”"'‘’「」『』]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();

export const extractStoryboardDialogueLines = (value: string): StoryboardDialogueLine[] => {
  const plainText = extractStoryboardScriptText(value);
  if (!plainText) return [];

  return plainText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^：:\n]{1,24})[：:]\s*(.+)$/);
      if (!match) return null;

      const speaker = match[1].trim();
      const text = match[2].trim();
      const normalizedText = normalizeStoryboardDialogueText(text);
      if (!speaker || !normalizedText) return null;

      return {
        speaker,
        text,
        raw: `${speaker}：${text}`,
        normalizedText,
      };
    })
    .filter((line): line is StoryboardDialogueLine => Boolean(line));
};

const getShotDialogueText = (shot: Pick<StoryboardGeneratedShot | StoryboardPlanShot, 'dialogue'>) =>
  typeof shot.dialogue === 'string' ? shot.dialogue : '';

export const findMissingStoryboardDialogues = (
  scriptContent: string,
  shots: Array<Pick<StoryboardGeneratedShot | StoryboardPlanShot, 'dialogue'>>
) => {
  const sourceDialogues = extractStoryboardDialogueLines(scriptContent);
  if (sourceDialogues.length === 0) return [];

  const generatedDialogueText = normalizeStoryboardDialogueText(
    shots.map(getShotDialogueText).filter(Boolean).join('\n')
  );
  if (!generatedDialogueText) return sourceDialogues;

  return sourceDialogues.filter((line) => {
    if (!line.normalizedText) return false;
    return !generatedDialogueText.includes(line.normalizedText);
  });
};

export const estimateStoryboardDialogueSeconds = (dialogue: string) => {
  const text = dialogue
    .replace(/^([^：:\n]{1,24})[：:]/gm, '')
    .replace(/[“”"'‘’「」『』]/g, '')
    .trim();
  if (!text) return 0;

  const cjkCount = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const nonCjkText = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ');
  const wordCount = (nonCjkText.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length;
  const lineCount = Math.max(1, text.split(/\n+/).filter((line) => line.trim()).length);

  return cjkCount / 3.6 + wordCount / 2.4 + lineCount * 0.35;
};

export const findOverfilledStoryboardDialogues = <
  T extends { dialogue?: string; duration?: number; sequence?: number }
>(
  shots: T[],
  maxDialogueShare = 0.68
): StoryboardDialogueOverfill[] =>
  shots
    .map((shot) => {
      const dialogue = getShotDialogueText(shot).trim();
      const duration = Number(shot.duration) || 0;
      const estimatedSeconds = estimateStoryboardDialogueSeconds(dialogue);

      return {
        sequence: shot.sequence,
        duration,
        estimatedSeconds,
        dialogue,
      };
    })
    .filter(
      (item) =>
        item.dialogue &&
        item.duration > 0 &&
        item.estimatedSeconds > Math.max(1, item.duration * maxDialogueShare)
    );

export const getStoryboardDialogueDiagnosticsPrompt = ({
  missingDialogues,
  overfilledDialogues,
}: {
  missingDialogues: StoryboardDialogueLine[];
  overfilledDialogues: StoryboardDialogueOverfill[];
}) => {
  const messages: string[] = [];

  if (missingDialogues.length > 0) {
    messages.push(
      `上一次规划遗漏了这些原剧本对白，必须逐句分配到镜头 dialogue 字段：${missingDialogues
        .slice(0, 20)
        .map((line) => line.raw)
        .join(' / ')}`
    );
  }

  if (overfilledDialogues.length > 0) {
    messages.push(
      `上一次规划存在对白超时，不能让角色高速说完。请拆到更多镜头或缩短每镜对白：${overfilledDialogues
        .slice(0, 12)
        .map(
          (item) =>
            `镜头${item.sequence || '?'}：${item.estimatedSeconds.toFixed(1)}秒对白 / ${item.duration}秒镜头`
        )
        .join('；')}`
    );
  }

  return messages.join('\n');
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
  shot: Pick<StoryboardGeneratedShot | StoryboardPlanShot, 'suggestedAssetNames' | 'suggestedAssets'> &
    Partial<{
      sceneLabel: string;
      scriptExcerpt: string;
      dialogue: string;
      videoPrompt: string;
      characters: StoryboardCharacterContext[];
    }>,
  assets: Array<{ id: string; name: string; type?: string; description?: string }>
) => {
  const relatedIds: string[] = [];
  const suggestedNames = collectStoryboardSuggestedNames(shot);
  const normalize = (value: string) => value.trim().toLowerCase();
  const context = normalize(
    [
      shot.sceneLabel,
      shot.scriptExcerpt,
      shot.dialogue,
      shot.videoPrompt,
      ...(Array.isArray(shot.characters)
        ? shot.characters.flatMap((character) => [character.name, character.description])
        : []),
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
  );
  const stateTokens = [
    '十年前',
    '十年后',
    '少年',
    '青年',
    '成年',
    '中年',
    '老年',
    '年轻',
    '年老',
    '过去',
    '现在',
    '未来',
    '受伤',
    '婚礼',
    '工作服',
    '作战服',
    'young',
    'old',
    'teen',
    'adult',
    'past',
    'future',
  ];
  const getContextualAsset = (candidates: typeof assets) =>
    candidates.find((asset) => {
      const haystack = normalize(`${asset.name} ${asset.description || ''}`);
      return stateTokens.some((token) => haystack.includes(token) && context.includes(token));
    });
  const hasStateToken = (asset: { name: string; description?: string }) => {
    const haystack = normalize(`${asset.name} ${asset.description || ''}`);
    return stateTokens.some((token) => haystack.includes(token));
  };

  for (const name of suggestedNames) {
    const normalizedName = normalize(name);
    const exact = assets.find((asset) => normalize(asset.name) === normalizedName);
    const fuzzyCandidates = assets.filter(
      (asset) =>
        normalize(asset.name).includes(normalizedName) ||
        normalizedName.includes(normalize(asset.name))
    );
    const nonCharacterCandidates = fuzzyCandidates.filter((asset) => asset.type !== 'character');
    const fuzzy =
      fuzzyCandidates.length === 1
        ? fuzzyCandidates[0]
        : getContextualAsset(fuzzyCandidates) ||
          (nonCharacterCandidates.length === 1 ? nonCharacterCandidates[0] : undefined);
    const matchedAsset =
      exact && (exact.type !== 'character' || hasStateToken(exact))
        ? exact
        : getContextualAsset(fuzzyCandidates) || exact || fuzzy;
    if (matchedAsset && !relatedIds.includes(matchedAsset.id)) {
      relatedIds.push(matchedAsset.id);
    }
  }

  return relatedIds;
};
