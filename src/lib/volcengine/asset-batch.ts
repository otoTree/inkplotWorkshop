export const DEFAULT_VOLCENGINE_ASSET_BATCH_SIZE = 5;
export const MAX_VOLCENGINE_ASSET_BATCH_SIZE = 10;

export const normalizeVolcengineAssetBatchSize = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_VOLCENGINE_ASSET_BATCH_SIZE;
  return Math.min(Math.floor(parsed), MAX_VOLCENGINE_ASSET_BATCH_SIZE);
};

export const selectVolcengineAssetBatch = <T extends { id: string }>(
  assets: T[],
  predicate: (asset: T) => boolean,
  cursor: string | null | undefined,
  batchSize: number
) => {
  const eligible = assets
    .filter(predicate)
    .sort((left, right) => left.id.localeCompare(right.id))
    .filter((asset) => !cursor || asset.id > cursor);
  const items = eligible.slice(0, batchSize);
  const hasMore = eligible.length > items.length;

  return {
    items,
    hasMore,
    nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
    remaining: Math.max(eligible.length - items.length, 0),
  };
};
