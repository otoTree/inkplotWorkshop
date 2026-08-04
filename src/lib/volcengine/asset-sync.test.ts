import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVolcengineReferenceAssets } from './asset-sync.ts';

const models = [
  'seedance-2-0-fast-tezan',
  'seedance-2-0-tezan',
  'intsd2-x',
] as const;

test('all Seedance models use object-storage URLs', async () => {
  for (const model of models) {
    const resolved = await resolveVolcengineReferenceAssets({
      references: [
        {
          id: 'asset-local-1',
          name: '主角',
          type: 'character',
          imageUrl: 'https://storage.example.com/a.png',
          volcengineAssetId: 'asset-20260424120352-8lkvp',
          volcengineAssetStatus: 'Active',
        },
      ],
      settings: {
        model,
        syncAssetsToPrivateLibrary: true,
        assetGroupId: 'group-1',
      },
    });

    assert.equal(resolved.references[0].usableUrl, 'https://storage.example.com/a.png');
    assert.equal(resolved.references[0].mode, 'url');
    assert.equal(resolved.requestContentMode, 'url');
    assert.deepEqual(resolved.referenceAssetIds, []);
    assert.equal(resolved.requiresAssetReadiness, false);
    assert.deepEqual(resolved.pendingAssets, []);
  }
});

test('legacy sync options never call the asset-library client', async () => {
  let called = false;
  const resolved = await resolveVolcengineReferenceAssets({
    references: [{ imageUrl: 'https://storage.example.com/b.png' }],
    settings: { syncAssetsToPrivateLibrary: true },
    forceCreateAssetGroup: true,
    client: new Proxy(
      {},
      {
        get() {
          called = true;
          throw new Error('asset-library client must not be used');
        },
      }
    ),
  });

  assert.equal(called, false);
  assert.equal(resolved.references[0].usableUrl, 'https://storage.example.com/b.png');
});

test('references without an object-storage URL are omitted', async () => {
  const resolved = await resolveVolcengineReferenceAssets({
    references: [
      {
        volcengineAssetId: 'asset-only-id',
        volcengineAssetStatus: 'Active',
      },
    ],
  });

  assert.deepEqual(resolved.references, []);
  assert.deepEqual(resolved.referenceAssetIds, []);
});
