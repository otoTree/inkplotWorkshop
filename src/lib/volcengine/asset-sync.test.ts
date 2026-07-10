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

test('resolveVolcengineReferenceAssets prefers source URLs for international model requests', async () => {
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
    preferSourceUrls: true,
  });

  assert.equal(resolved.references[0].usableUrl, 'https://example.com/a.png');
  assert.equal(resolved.references[0].mode, 'url');
  assert.equal(resolved.requestContentMode, 'url');
  assert.deepEqual(resolved.referenceAssetIds, []);
  assert.equal(resolved.requiresAssetReadiness, false);
});

test('resolveVolcengineReferenceAssets keeps URL while remote asset is still processing', async () => {
  const updates: Array<Record<string, unknown>> = [];

  const resolved = await resolveVolcengineReferenceAssets({
    references: [
      {
        id: 'asset-local-2',
        name: '场景图',
        type: 'location',
        imageUrl: 'https://example.com/b.png',
        volcengineAssetId: 'asset-processing-1',
        volcengineAssetStatus: 'Processing',
      },
    ],
    settings: {
      syncAssetsToPrivateLibrary: true,
      assetGroupId: 'group-1',
      projectName: 'default',
    },
    persistence: {
      updateAsset: async (_assetId, patch) => {
        updates.push(patch);
      },
    },
    client: {
      getAsset: async () => ({
        Id: 'asset-processing-1',
        Status: 'Processing',
        GroupId: 'group-1',
        ProjectName: 'default',
        AssetType: 'Image',
      }),
    },
  });

  assert.equal(resolved.references[0].usableUrl, 'https://example.com/b.png');
  assert.equal(resolved.references[0].mode, 'url');
  assert.equal(updates[0]?.volcengine_asset_status, 'Processing');
});

test('resolveVolcengineReferenceAssets records failed asset error details', async () => {
  const updates: Array<Record<string, unknown>> = [];

  const resolved = await resolveVolcengineReferenceAssets({
    references: [
      {
        id: 'asset-local-3',
        name: '失败素材',
        type: 'location',
        imageUrl: 'https://example.com/c.png',
        volcengineAssetId: 'asset-failed-1',
        volcengineAssetStatus: 'Processing',
      },
    ],
    settings: {
      syncAssetsToPrivateLibrary: true,
      assetGroupId: 'group-1',
      projectName: 'default',
    },
    persistence: {
      updateAsset: async (_assetId, patch) => {
        updates.push(patch);
      },
    },
    client: {
      getAsset: async () => ({
        Id: 'asset-failed-1',
        Status: 'Failed',
        GroupId: 'group-1',
        ProjectName: 'default',
        AssetType: 'Image',
        Error: {
          Code: 'InvalidImageSize',
          Message: 'The image width or height is out of allowed range.',
        },
      }),
    },
  });

  assert.equal(resolved.references[0].usableUrl, 'https://example.com/c.png');
  assert.equal(resolved.references[0].mode, 'url');
  assert.deepEqual(updates[0]?.volcengine_asset_error, {
    Code: 'InvalidImageSize',
    Message: 'The image width or height is out of allowed range.',
  });
});

test('resolveVolcengineReferenceAssets marks non-active assets as pending readiness', async () => {
  const resolved = await resolveVolcengineReferenceAssets({
    references: [
      {
        id: 'asset-local-4',
        name: '待处理素材',
        type: 'location',
        imageUrl: 'https://example.com/d.png',
        volcengineAssetId: 'asset-processing-2',
        volcengineAssetStatus: 'Processing',
      },
    ],
    settings: {
      syncAssetsToPrivateLibrary: true,
      assetGroupId: 'group-1',
      projectName: 'default',
    },
    client: {
      getAsset: async () => ({
        Id: 'asset-processing-2',
        Status: 'Processing',
        GroupId: 'group-1',
        ProjectName: 'default',
        AssetType: 'Image',
      }),
    },
  });

  assert.equal(resolved.requiresAssetReadiness, true);
  assert.equal(resolved.pendingAssets.length, 1);
  assert.equal(resolved.pendingAssets[0]?.blockingAssetId, 'asset-processing-2');
  assert.equal(resolved.pendingAssets[0]?.reason, 'processing');
});

test('resolveVolcengineReferenceAssets auto-creates asset group when missing', async () => {
  const projectUpdates: Array<Record<string, unknown>> = [];
  const createdAssets: Array<Record<string, unknown>> = [];

  const resolved = await resolveVolcengineReferenceAssets({
    references: [
      {
        id: 'asset-local-5',
        name: '新素材',
        type: 'character',
        imageUrl: 'https://example.com/e.png',
      },
    ],
    settings: {
      syncAssetsToPrivateLibrary: true,
      projectName: 'demo-project',
    },
    persistence: {
      updateProjectVideoSettings: async (updates) => {
        projectUpdates.push(updates);
      },
    },
    client: {
      createAssetGroup: async () => ({
        Id: 'ag_auto_created',
      }),
      createAsset: async (input) => {
        createdAssets.push(input);
        return {
          Id: 'asset-created-1',
          Status: 'Processing',
          GroupId: 'ag_auto_created',
          ProjectName: 'demo-project',
          AssetType: 'Image',
        };
      },
    },
  });

  assert.equal(resolved.assetGroupId, 'ag_auto_created');
  assert.equal(projectUpdates[0]?.assetGroupId, 'ag_auto_created');
  assert.equal(createdAssets[0]?.GroupId, 'ag_auto_created');
  assert.equal(resolved.requiresAssetReadiness, true);
});
