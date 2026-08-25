import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVolcengineReferenceAssets } from './asset-sync.ts';

test('domestic Seedance models use active asset-library IDs when sync is enabled', async () => {
  const resolved = await resolveVolcengineReferenceAssets({
    references: [{
      id: 'asset-local-1',
      imageUrl: 'https://storage.example.com/a.png',
      volcengineAssetId: 'asset-active-1',
      volcengineAssetStatus: 'Active',
    }],
    settings: {
      model: 'seedance-2-0',
      syncAssetsToPrivateLibrary: true,
      assetGroupId: 'group-1',
    },
  });

  assert.equal(resolved.references[0].usableUrl, 'asset://asset-active-1');
  assert.equal(resolved.references[0].mode, 'asset_uri');
  assert.equal(resolved.requestContentMode, 'asset_uri');
  assert.deepEqual(resolved.referenceAssetIds, ['asset-active-1']);
  assert.equal(resolved.requiresAssetReadiness, false);
});

test('international Seedance models always use object-storage URLs', async () => {
  const resolved = await resolveVolcengineReferenceAssets({
    references: [{
      imageUrl: 'https://storage.example.com/b.png',
      volcengineAssetId: 'asset-active-2',
      volcengineAssetStatus: 'Active',
    }],
    settings: { model: 'intsd2-x', syncAssetsToPrivateLibrary: true },
  });

  assert.equal(resolved.references[0].usableUrl, 'https://storage.example.com/b.png');
  assert.equal(resolved.references[0].mode, 'url');
  assert.equal(resolved.requestContentMode, 'url');
  assert.deepEqual(resolved.referenceAssetIds, []);
});

test('domestic sync uploads new references and waits for Active status', async () => {
  const created: Record<string, unknown>[] = [];
  const resolved = await resolveVolcengineReferenceAssets({
    references: [{
      id: 'asset-local-2',
      name: '场景',
      imageUrl: 'https://storage.example.com/c.png',
    }],
    settings: {
      model: 'seedance-2-0-fast-tezan',
      syncAssetsToPrivateLibrary: true,
      projectName: 'demo',
    },
    client: {
      createAssetGroup: async () => ({ Id: 'group-created' }),
      createAsset: async (input: Record<string, unknown>) => {
        created.push(input);
        return {
          Id: 'asset-processing-1',
          Status: 'Processing',
          GroupId: 'group-created',
          ProjectName: 'demo',
          AssetType: 'Image',
        };
      },
    },
  });

  assert.equal(created[0]?.URL, 'https://storage.example.com/c.png');
  assert.equal(resolved.requiresAssetReadiness, true);
  assert.equal(resolved.pendingAssets[0]?.reason, 'processing');
  assert.equal(resolved.references[0]?.mode, 'url');
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
