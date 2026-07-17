import assert from 'node:assert/strict';
import test from 'node:test';
import { AIAPIError } from '../ai-server.ts';
import {
  createAsset,
  getAsset,
  getVolcengineAssetConfig,
  getVolcengineAssetProjectName,
  type VolcengineAssetConfig,
} from './asset-client.ts';

const config: VolcengineAssetConfig = {
  region: 'cn-beijing',
  baseUrl: 'https://ark.cn-beijing.volcengineapi.com',
  version: '2024-01-01',
  projectName: 'default',
  groupId: 'group-test',
  authMode: 'legacy',
  accessKeyId: 'ak-test',
  secretAccessKey: 'sk-test',
  host: 'ark.cn-beijing.volcengineapi.com',
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

test('getVolcengineAssetConfig prefers ARTS bearer config and preserves /api/v3', () => {
  const previous = {
    ARTS_ASSET_BASE_URL: process.env.ARTS_ASSET_BASE_URL,
    ARTS_API_BASE_URL: process.env.ARTS_API_BASE_URL,
    ARTS_API_KEY: process.env.ARTS_API_KEY,
    ARTS_ASSET_PROJECT_NAME: process.env.ARTS_ASSET_PROJECT_NAME,
    ARTS_ASSET_GROUP_ID: process.env.ARTS_ASSET_GROUP_ID,
    VOLCENGINE_ACCESS_KEY_ID: process.env.VOLCENGINE_ACCESS_KEY_ID,
    VOLCENGINE_SECRET_ACCESS_KEY: process.env.VOLCENGINE_SECRET_ACCESS_KEY,
  };

  delete process.env.ARTS_ASSET_BASE_URL;
  process.env.ARTS_API_BASE_URL = 'https://apis.artsapi.com/api/v3';
  process.env.ARTS_API_KEY = 'arts-key';
  process.env.ARTS_ASSET_PROJECT_NAME = 'arts-project';
  process.env.ARTS_ASSET_GROUP_ID = 'arts-group';
  process.env.VOLCENGINE_ACCESS_KEY_ID = 'legacy-ak';
  process.env.VOLCENGINE_SECRET_ACCESS_KEY = 'legacy-sk';

  try {
    const resolved = getVolcengineAssetConfig();
    assert.equal(resolved.authMode, 'arts');
    assert.equal(resolved.baseUrl, 'https://apis.artsapi.com/api/v3');
    assert.equal(resolved.apiKey, 'arts-key');
    assert.equal(resolved.projectName, 'arts-project');
    assert.equal(resolved.groupId, 'arts-group');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('shared gateway asset base URL appends only Action and Version', async () => {
  const previous = {
    ARTS_ASSET_BASE_URL: process.env.ARTS_ASSET_BASE_URL,
    ARTS_API_BASE_URL: process.env.ARTS_API_BASE_URL,
    ARTS_API_KEY: process.env.ARTS_API_KEY,
    ARTS_ASSET_PROJECT_NAME: process.env.ARTS_ASSET_PROJECT_NAME,
  };

  process.env.ARTS_API_BASE_URL = 'https://jphhngvqjmgr.sealosbja.site/';
  delete process.env.ARTS_ASSET_BASE_URL;
  process.env.ARTS_API_KEY = 'arts-key';
  delete process.env.ARTS_ASSET_PROJECT_NAME;
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ result: { id: 'asset-1', status: 'active' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const resolved = getVolcengineAssetConfig();
    assert.equal(resolved.baseUrl, 'https://jphhngvqjmgr.sealosbja.site');
    assert.equal(resolved.projectName, 'tz');
    assert.equal(getVolcengineAssetProjectName('default'), 'tz');
    await getAsset({ Id: 'asset-1', ProjectName: 'tz' }, resolved);
    assert.equal(
      requestedUrl,
      'https://jphhngvqjmgr.sealosbja.site?Action=GetAsset&Version=2024-01-01'
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('getVolcengineAssetConfig preserves dedicated gateway asset root', () => {
  const previous = {
    ARTS_ASSET_BASE_URL: process.env.ARTS_ASSET_BASE_URL,
    ARTS_API_BASE_URL: process.env.ARTS_API_BASE_URL,
    ARTS_API_KEY: process.env.ARTS_API_KEY,
  };

  process.env.ARTS_ASSET_BASE_URL = 'https://jphhngvqjmgr.sealosbja.site/';
  process.env.ARTS_API_BASE_URL = 'https://legacy.example.com/api/v3';
  process.env.ARTS_API_KEY = 'gateway-key';

  try {
    const resolved = getVolcengineAssetConfig();
    assert.equal(resolved.baseUrl, 'https://jphhngvqjmgr.sealosbja.site');
    assert.equal(resolved.authMode, 'arts');
    assert.equal(resolved.apiKey, 'gateway-key');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('createAsset rejects non-public URLs', async () => {
  assert.throws(
    () =>
      createAsset(
        {
          GroupId: 'group-test',
          URL: 'data:image/png;base64,abc',
          AssetType: 'Image',
          ProjectName: 'default',
        },
        config
      ),
    (error) => error instanceof AIAPIError && error.status === 400
  );
});

test('getAsset normalizes ARTS-style lowercase payload fields', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        result: {
          id: 'asset_arts_1',
          status: 'active',
          group_id: 'ag_1',
          project_name: 'arts-project',
          asset_type: 'image',
          error: {
            code: 'IGNORED',
            message: 'ignored when active',
          },
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }) as typeof fetch;

  try {
    const result = await getAsset({ Id: 'asset_arts_1', ProjectName: 'arts-project' }, {
      region: 'cn-beijing',
      baseUrl: 'https://apis.artsapi.com/api/v3',
      version: '2024-01-01',
      projectName: 'arts-project',
      groupId: 'ag_1',
      authMode: 'arts',
      apiKey: 'arts-key',
    });

    assert.equal(result.Id, 'asset_arts_1');
    assert.equal(result.Status, 'Active');
    assert.equal(result.GroupId, 'ag_1');
    assert.equal(result.ProjectName, 'arts-project');
    assert.equal(result.AssetType, 'Image');
    assert.equal(
      requestedUrl,
      'https://apis.artsapi.com/api/v3?Action=GetAsset&Version=2024-01-01'
    );
    assert.deepEqual(result.Error, {
      Code: 'IGNORED',
      Message: 'ignored when active',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
