import assert from 'node:assert/strict';
import test from 'node:test';
import { createAsset, type VolcengineAssetConfig } from './asset-client.ts';

const config: VolcengineAssetConfig = {
  accessKeyId: 'ak-test',
  secretAccessKey: 'sk-test',
  region: 'cn-beijing',
  host: 'ark.cn-beijing.volcengineapi.com',
  version: '2024-01-01',
  projectName: 'default',
  groupId: 'group-test',
};

test('createAsset signs OpenAPI request and parses Result.Id', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestedBody: Record<string, unknown> = {};
  let requestedHeaders: Headers;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    requestedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ Result: { Id: 'asset-20260424120352-8lkvp' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await createAsset(
      {
        GroupId: 'group-test',
        URL: 'https://example.com/a.png',
        Name: 'reference',
        AssetType: 'Image',
        ProjectName: 'default',
      },
      config
    );

    assert.equal(result.Id, 'asset-20260424120352-8lkvp');
    assert.match(requestedUrl, /Action=CreateAsset/);
    assert.match(requestedUrl, /Version=2024-01-01/);
    assert.equal(requestedBody.URL, 'https://example.com/a.png');
    assert.equal(requestedHeaders!.get('Content-Type'), 'application/json');
    assert.ok(requestedHeaders!.get('X-Date'));
    assert.ok(requestedHeaders!.get('X-Content-Sha256'));
    assert.ok(requestedHeaders!.get('Authorization')?.startsWith('HMAC-SHA256'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
