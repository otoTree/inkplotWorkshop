import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_VOLCENGINE_ASSET_BATCH_SIZE,
  MAX_VOLCENGINE_ASSET_BATCH_SIZE,
  normalizeVolcengineAssetBatchSize,
  selectVolcengineAssetBatch,
} from './asset-batch.ts';

test('selectVolcengineAssetBatch returns stable cursor batches', () => {
  const assets = [
    { id: 'c', sync: true },
    { id: 'a', sync: true },
    { id: 'd', sync: false },
    { id: 'b', sync: true },
  ];

  const first = selectVolcengineAssetBatch(assets, (asset) => asset.sync, null, 2);
  assert.deepEqual(first.items.map((asset) => asset.id), ['a', 'b']);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, 'b');
  assert.equal(first.remaining, 1);

  const second = selectVolcengineAssetBatch(assets, (asset) => asset.sync, first.nextCursor, 2);
  assert.deepEqual(second.items.map((asset) => asset.id), ['c']);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
  assert.equal(second.remaining, 0);
});

test('normalizeVolcengineAssetBatchSize applies defaults and upper bound', () => {
  assert.equal(normalizeVolcengineAssetBatchSize(undefined), DEFAULT_VOLCENGINE_ASSET_BATCH_SIZE);
  assert.equal(normalizeVolcengineAssetBatchSize(0), DEFAULT_VOLCENGINE_ASSET_BATCH_SIZE);
  assert.equal(normalizeVolcengineAssetBatchSize(12.9), 12);
  assert.equal(normalizeVolcengineAssetBatchSize(1000), MAX_VOLCENGINE_ASSET_BATCH_SIZE);
});
