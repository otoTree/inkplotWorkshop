import type { Shot } from '@/types';

export type VideoHistoryStatus = NonNullable<Shot['videoStatus']>;

export interface VideoGenerationHistoryItem {
  id: string;
  attemptNumber: number;
  startedAt: string;
  updatedAt: string;
  status: VideoHistoryStatus;
  generationId?: string | null;
  videoUrl?: string | null;
  prompt?: string;
  description?: string;
  provider?: string;
  model?: string;
  error?: Record<string, unknown> | string | null;
}

export interface VideoGenerationHistory {
  totalAttempts: number;
  activeAttemptId?: string;
  cumulativeDescription: string;
  items: VideoGenerationHistoryItem[];
}

type VideoGenerationMetadata = NonNullable<Shot['videoGenerationMetadata']>;

const MAX_HISTORY_ITEMS = 30;
const MAX_DESCRIPTION_LENGTH = 900;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const compactText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const limitText = (value: string, limit = MAX_DESCRIPTION_LENGTH) =>
  value.length > limit ? `${value.slice(0, limit - 1)}...` : value;

const makeAttemptId = () => {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `video-history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const toHistoryItem = (value: unknown): VideoGenerationHistoryItem | null => {
  if (!isRecord(value)) return null;
  const attemptNumber = Number(value.attemptNumber);
  const startedAt = compactText(value.startedAt);
  const updatedAt = compactText(value.updatedAt) || startedAt;
  const status = compactText(value.status) as VideoHistoryStatus;

  if (!Number.isFinite(attemptNumber) || !startedAt || !status) return null;

  return {
    id: compactText(value.id) || makeAttemptId(),
    attemptNumber,
    startedAt,
    updatedAt,
    status,
    generationId:
      typeof value.generationId === 'string' || value.generationId === null
        ? value.generationId
        : undefined,
    videoUrl:
      typeof value.videoUrl === 'string' || value.videoUrl === null
        ? value.videoUrl
        : undefined,
    prompt: compactText(value.prompt) || undefined,
    description: compactText(value.description) || undefined,
    provider: compactText(value.provider) || undefined,
    model: compactText(value.model) || undefined,
    error:
      typeof value.error === 'string' || isRecord(value.error) || value.error === null
        ? value.error
        : undefined,
  };
};

export const normalizeVideoGenerationHistory = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined
): VideoGenerationHistory => {
  const rawHistory = isRecord(metadata) ? metadata.videoHistory : null;
  const rawItems = isRecord(rawHistory) && Array.isArray(rawHistory.items)
    ? rawHistory.items
    : [];
  const items = rawItems
    .map(toHistoryItem)
    .filter((item): item is VideoGenerationHistoryItem => Boolean(item))
    .sort((a, b) => a.attemptNumber - b.attemptNumber)
    .slice(-MAX_HISTORY_ITEMS);
  const totalAttempts =
    isRecord(rawHistory) && Number.isFinite(Number(rawHistory.totalAttempts))
      ? Math.max(Number(rawHistory.totalAttempts), items.length)
      : items.length;

  return {
    totalAttempts,
    activeAttemptId:
      isRecord(rawHistory) && typeof rawHistory.activeAttemptId === 'string'
        ? rawHistory.activeAttemptId
        : undefined,
    cumulativeDescription:
      isRecord(rawHistory) && typeof rawHistory.cumulativeDescription === 'string'
        ? rawHistory.cumulativeDescription
        : buildCumulativeDescription(items),
    items,
  };
};

const buildCumulativeDescription = (items: VideoGenerationHistoryItem[]) =>
  items
    .filter((item) => item.description)
    .map((item) => `第 ${item.attemptNumber} 次：${item.description}`)
    .join('\n');

const writeHistory = (
  metadata: VideoGenerationMetadata,
  history: VideoGenerationHistory
): VideoGenerationMetadata => ({
  ...metadata,
  videoHistory: {
    ...history,
    cumulativeDescription: buildCumulativeDescription(history.items),
    items: history.items.slice(-MAX_HISTORY_ITEMS),
  },
});

export const buildVideoGenerationAttemptDescription = (shot: {
  videoPrompt?: string | null;
  description?: string | null;
  sceneLabel?: string | null;
  characterAction?: string | null;
  emotion?: string | null;
  lightingAtmosphere?: string | null;
  camera?: string | null;
  size?: string | null;
  dialogue?: string | null;
  soundEffect?: string | null;
}) => {
  const parts = [
    compactText(shot.videoPrompt) ? `提示词：${compactText(shot.videoPrompt)}` : '',
    compactText(shot.sceneLabel) ? `场景：${compactText(shot.sceneLabel)}` : '',
    compactText(shot.description) ? `画面：${compactText(shot.description)}` : '',
    compactText(shot.characterAction) ? `动作：${compactText(shot.characterAction)}` : '',
    compactText(shot.emotion) ? `情绪：${compactText(shot.emotion)}` : '',
    compactText(shot.lightingAtmosphere) ? `光影：${compactText(shot.lightingAtmosphere)}` : '',
    compactText([shot.camera, shot.size].map(compactText).filter(Boolean).join(' '))
      ? `镜头：${[shot.camera, shot.size].map(compactText).filter(Boolean).join(' ')}`
      : '',
    compactText(shot.dialogue) ? `对白：${compactText(shot.dialogue)}` : '',
    compactText(shot.soundEffect) ? `音效：${compactText(shot.soundEffect)}` : '',
  ].filter(Boolean);

  return limitText(parts.join('；') || compactText(shot.videoPrompt));
};

export const startVideoGenerationAttempt = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined,
  params: {
    prompt?: string | null;
    description?: string | null;
    provider?: string;
    model?: string;
    aspectRatio?: string;
    resolution?: string;
  }
): VideoGenerationMetadata => {
  const base: VideoGenerationMetadata = {
    ...(isRecord(metadata) ? metadata : {}),
    error: null,
    ...(params.provider ? { provider: params.provider } : {}),
    ...(params.model ? { model: params.model } : {}),
    ...(params.aspectRatio ? { aspectRatio: params.aspectRatio } : {}),
    ...(params.resolution ? { resolution: params.resolution } : {}),
  };
  const history = normalizeVideoGenerationHistory(metadata);
  const now = new Date().toISOString();
  const nextAttemptNumber = history.totalAttempts + 1;
  const item: VideoGenerationHistoryItem = {
    id: makeAttemptId(),
    attemptNumber: nextAttemptNumber,
    startedAt: now,
    updatedAt: now,
    status: 'queued',
    generationId: null,
    videoUrl: null,
    prompt: compactText(params.prompt) || undefined,
    description: limitText(compactText(params.description || params.prompt)) || undefined,
    provider: params.provider,
    model: params.model,
    error: null,
  };

  return writeHistory(base, {
    totalAttempts: nextAttemptNumber,
    activeAttemptId: item.id,
    cumulativeDescription: '',
    items: [...history.items, item].slice(-MAX_HISTORY_ITEMS),
  });
};

export const ensureVideoGenerationAttempt = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined,
  params: Parameters<typeof startVideoGenerationAttempt>[1]
) => {
  const history = normalizeVideoGenerationHistory(metadata);
  return history.activeAttemptId || history.items.some((item) => item.status === 'queued')
    ? ((isRecord(metadata) ? metadata : {}) as VideoGenerationMetadata)
    : startVideoGenerationAttempt(metadata, params);
};

export const updateVideoGenerationAttempt = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined,
  updates: {
    status?: VideoHistoryStatus;
    generationId?: string | null;
    videoUrl?: string | null;
    provider?: string;
    model?: string;
    requestContentMode?: 'asset_uri' | 'url';
    referenceAssetIds?: string[];
    aspectRatio?: string;
    resolution?: string;
    rawStatus?: string;
    usage?: Record<string, unknown>;
    error?: Record<string, unknown> | string | null;
  }
): VideoGenerationMetadata => {
  const base: VideoGenerationMetadata = {
    ...(isRecord(metadata) ? metadata : {}),
    ...(updates.provider ? { provider: updates.provider } : {}),
    ...(updates.model ? { model: updates.model } : {}),
    ...(updates.requestContentMode ? { requestContentMode: updates.requestContentMode } : {}),
    ...(updates.referenceAssetIds ? { referenceAssetIds: updates.referenceAssetIds } : {}),
    ...(updates.aspectRatio ? { aspectRatio: updates.aspectRatio } : {}),
    ...(updates.resolution ? { resolution: updates.resolution } : {}),
    ...(updates.rawStatus ? { rawStatus: updates.rawStatus } : {}),
    ...(updates.usage ? { usage: updates.usage } : {}),
    ...('error' in updates ? { error: updates.error } : {}),
  };
  const history = normalizeVideoGenerationHistory(metadata);
  if (history.items.length === 0) return base;

  const targetIndex = (() => {
    if (history.activeAttemptId) {
      const index = history.items.findIndex((item) => item.id === history.activeAttemptId);
      if (index >= 0) return index;
    }
    if (updates.generationId) {
      const index = history.items.findIndex((item) => item.generationId === updates.generationId);
      if (index >= 0) return index;
    }
    return history.items.length - 1;
  })();

  const currentItem = history.items[targetIndex];
  const nextStatus = updates.status || currentItem.status;
  const nextItems = history.items.map((item, index) =>
    index === targetIndex
      ? {
          ...item,
          updatedAt: new Date().toISOString(),
          status: nextStatus,
          generationId:
            updates.generationId !== undefined ? updates.generationId : item.generationId,
          videoUrl: updates.videoUrl !== undefined ? updates.videoUrl : item.videoUrl,
          provider: updates.provider || item.provider,
          model: updates.model || item.model,
          error: 'error' in updates ? updates.error : item.error,
        }
      : item
  );
  const isTerminal = nextStatus === 'completed' || nextStatus === 'failed';

  return writeHistory(base, {
    ...history,
    activeAttemptId: isTerminal ? undefined : history.activeAttemptId,
    items: nextItems,
  });
};

export const upsertVideoGenerationAttempt = (
  metadata: Shot['videoGenerationMetadata'] | null | undefined,
  params: {
    status: VideoHistoryStatus;
    generationId?: string | null;
    videoUrl?: string | null;
    prompt?: string | null;
    description?: string | null;
    provider?: string;
    model?: string;
    startedAt?: string;
    updatedAt?: string;
    error?: Record<string, unknown> | string | null;
  }
): VideoGenerationMetadata => {
  const history = normalizeVideoGenerationHistory(metadata);
  if (params.generationId) {
    const existing = history.items.find((item) => item.generationId === params.generationId);
    if (existing) {
      return updateVideoGenerationAttempt(metadata, {
        status: params.status,
        generationId: params.generationId,
        videoUrl: params.videoUrl,
        provider: params.provider,
        model: params.model,
        error: params.error,
      });
    }
  }

  const base: VideoGenerationMetadata = {
    ...(isRecord(metadata) ? metadata : {}),
    ...(params.provider ? { provider: params.provider } : {}),
    ...(params.model ? { model: params.model } : {}),
    ...('error' in params ? { error: params.error } : {}),
  };
  const now = new Date().toISOString();
  const nextAttemptNumber = history.totalAttempts + 1;
  const item: VideoGenerationHistoryItem = {
    id: makeAttemptId(),
    attemptNumber: nextAttemptNumber,
    startedAt: params.startedAt || params.updatedAt || now,
    updatedAt: params.updatedAt || now,
    status: params.status,
    generationId: params.generationId,
    videoUrl: params.videoUrl,
    prompt: compactText(params.prompt) || undefined,
    description: limitText(compactText(params.description || params.prompt)) || undefined,
    provider: params.provider,
    model: params.model,
    error: params.error,
  };

  return writeHistory(base, {
    totalAttempts: nextAttemptNumber,
    activeAttemptId:
      item.status === 'completed' || item.status === 'failed'
        ? history.activeAttemptId
        : item.id,
    cumulativeDescription: '',
    items: [...history.items, item].slice(-MAX_HISTORY_ITEMS),
  });
};
