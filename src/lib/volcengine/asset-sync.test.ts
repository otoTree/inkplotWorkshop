import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVolcengineReferenceAssets } from './asset-sync.ts';

test('resolveVolcengineReferenceAssets returns original URLs when sync is disabled', async () => {
  const resolved = await resolveVolcengineReferenceAssets({
    references: [
      {
        id: 'asset-local-1',
        name: '主角',
        type: 'character',
        imageUrl: 'https://example.com/a.png',
      },
    ],
    settings: { syncAssetsToPrivateLibrary: false },
  });

  assert.equal(resolved.references[0].usableUrl, 'https://example.com/a.png');
  assert.equal(resolved.references[0].mode, 'url');
});

test('resolveVolcengineReferenceAssets returns asset URI for active synced assets', async () => {
  const resolved = await resolveVolcengineReferenceAssets({
    references: [
      {
        id: 'asset-local-1',
        name: '主角',
        type: 'character',
        imageUrl: 'https://example.com/a.png',
        volcengineAssetId: 'asset-20260424120352-8lkvp',
        volcengineAssetStatus: 'Active',
      },
    ],
    settings: {
      syncAssetsToPrivateLibrary: true,
      assetGroupId: 'group-1',
      projectName: 'default',
    },
  });

  assert.equal(resolved.references[0].usableUrl, 'asset://asset-20260424120352-8lkvp');
  assert.equal(resolved.references[0].mode, 'asset_uri');
});
