import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVolcengineSubmissionMetadata,
  createSeedance2VideoTask,
  extractVolcengineVideoUrl,
  getConfiguredVolcengineVideoModel,
  getSeedance2VideoTask,
  getVolcengineTaskSnapshot,
  getVolcengineVideoConfig,
  mergeVolcengineTaskMetadata,
  mapVolcengineTaskStatus,
} from './video-client.ts';

test('gateway base URL uses /v1 video generation and task routes', async () => {
  const originalFetch = globalThis.fetch;
  const requested: Array<{ url: string; method: string; body?: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requested.push({
      url: String(input),
      method: init?.method || 'GET',
      ...(init?.body ? { body: String(init.body) } : {}),
    });
    return new Response(JSON.stringify({ id: 'task-1', status: 'processing' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const config = {
    baseUrl: 'https://jphhngvqjmgr.sealosbja.site',
    apiKey: 'test-key',
    model: 'seedance-2-0-fast-tezan',
    timeoutMs: 1000,
    apiStyle: 'gateway' as const,
  };

  try {
    await createSeedance2VideoTask(
      {
        model: config.model,
        content: [{ type: 'text', text: 'test' }],
        resolution: '480p',
      },
      config
    );
    await getSeedance2VideoTask('task/id', config);

    assert.deepEqual(requested, [
      {
        url: 'https://jphhngvqjmgr.sealosbja.site/v1/videos/generations',
        method: 'POST',
        body: JSON.stringify({
          model: config.model,
          content: [{ type: 'text', text: 'test' }],
          resolution: '480p',
        }),
      },
      {
        url: 'https://jphhngvqjmgr.sealosbja.site/v1/tasks/task%2Fid',
        method: 'GET',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mapVolcengineTaskStatus maps succeeded to completed', () => {
  assert.equal(mapVolcengineTaskStatus('succeeded'), 'completed');
});

test('mapVolcengineTaskStatus maps failed-like states to failed', () => {
  assert.equal(mapVolcengineTaskStatus('failed'), 'failed');
  assert.equal(mapVolcengineTaskStatus('error'), 'failed');
  assert.equal(mapVolcengineTaskStatus('cancelled'), 'failed');
});

test('extractVolcengineVideoUrl reads nested content.video_url first', () => {
  assert.equal(
    extractVolcengineVideoUrl({
      status: 'succeeded',
      content: {
        video_url: 'https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/test.mp4',
      },
      video_url: 'https://example.com/lower-priority.mp4',
    }),
    'https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/test.mp4'
  );
});

test('getVolcengineTaskSnapshot prefers content.video_url and maps status', () => {
  const snapshot = getVolcengineTaskSnapshot({
    id: 'cgt-test',
    status: 'succeeded',
    content: {
      video_url: 'https://example.com/test.mp4',
    },
    usage: {
      total_tokens: 100,
    },
  });

  assert.equal(snapshot.rawStatus, 'succeeded');
  assert.equal(snapshot.videoStatus, 'completed');
  assert.equal(snapshot.videoUrl, 'https://example.com/test.mp4');
  assert.deepEqual(snapshot.usage, { total_tokens: 100 });
});

test('mergeVolcengineTaskMetadata keeps unified status metadata shape', () => {
  const metadata = buildVolcengineSubmissionMetadata({
    model: 'doubao-seedance-2-0-260128',
    requestContentMode: 'asset_uri',
    referenceAssetIds: ['asset-1'],
    aspectRatio: '9:16',
    resolution: '480p',
    result: {
      id: 'cgt-test',
      status: 'processing',
    },
  });

  const merged = mergeVolcengineTaskMetadata(metadata, {
    id: 'cgt-test',
    status: 'failed',
    error: {
      code: 'INVALID_PARAMETER',
      message: 'content.image_url.url is invalid',
    },
  });

  assert.equal(merged.provider, 'volcengine');
  assert.equal(merged.model, 'doubao-seedance-2-0-260128');
  assert.equal(merged.requestContentMode, 'asset_uri');
  assert.deepEqual(merged.referenceAssetIds, ['asset-1']);
  assert.equal(merged.rawStatus, 'failed');
  assert.deepEqual(merged.error, {
    code: 'INVALID_PARAMETER',
    message: 'content.image_url.url is invalid',
  });
});

test('getVolcengineVideoConfig prefers ARTS env and normalizes base url', () => {
  const previous = {
    ARTS_VIDEO_BASE_URL: process.env.ARTS_VIDEO_BASE_URL,
    ARTS_API_BASE_URL: process.env.ARTS_API_BASE_URL,
    ARTS_API_KEY: process.env.ARTS_API_KEY,
    ARTS_VIDEO_MODEL: process.env.ARTS_VIDEO_MODEL,
    VOLCENGINE_ARK_VIDEO_BASE_URL: process.env.VOLCENGINE_ARK_VIDEO_BASE_URL,
    VOLCENGINE_ARK_VIDEO_API_KEY: process.env.VOLCENGINE_ARK_VIDEO_API_KEY,
    VOLCENGINE_ARK_VIDEO_MODEL: process.env.VOLCENGINE_ARK_VIDEO_MODEL,
    ARK_BASE_URL: process.env.ARK_BASE_URL,
    ARK_VIDEO_MODEL: process.env.ARK_VIDEO_MODEL,
  };

  process.env.ARTS_API_BASE_URL = 'https://apis.artsapi.com/api';
  delete process.env.ARTS_VIDEO_BASE_URL;
  process.env.ARTS_API_KEY = 'arts-video-key';
  process.env.ARTS_VIDEO_MODEL = 'seedance-2-0-fast-tezan';
  process.env.VOLCENGINE_ARK_VIDEO_BASE_URL = 'https://legacy.example.com/api/v3';
  process.env.VOLCENGINE_ARK_VIDEO_API_KEY = 'legacy-video-key';
  process.env.VOLCENGINE_ARK_VIDEO_MODEL = 'legacy-model';

  try {
    const config = getVolcengineVideoConfig();
    assert.equal(config.baseUrl, 'https://apis.artsapi.com/api/v3');
    assert.equal(config.apiKey, 'arts-video-key');
    assert.equal(config.model, 'seedance-2-0-fast-tezan');
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

test('getVolcengineVideoConfig preserves dedicated gateway base URL', () => {
  const previous = {
    ARTS_VIDEO_BASE_URL: process.env.ARTS_VIDEO_BASE_URL,
    ARTS_API_BASE_URL: process.env.ARTS_API_BASE_URL,
    ARTS_API_KEY: process.env.ARTS_API_KEY,
    ARTS_VIDEO_MODEL: process.env.ARTS_VIDEO_MODEL,
  };

  process.env.ARTS_VIDEO_BASE_URL = 'https://jphhngvqjmgr.sealosbja.site/';
  process.env.ARTS_API_BASE_URL = 'https://legacy.example.com/api/v3';
  process.env.ARTS_API_KEY = 'gateway-key';
  process.env.ARTS_VIDEO_MODEL = 'seedance-2-0-fast-tezan';

  try {
    const config = getVolcengineVideoConfig('seedance-2-0-tezan');
    assert.equal(config.baseUrl, 'https://jphhngvqjmgr.sealosbja.site');
    assert.equal(config.apiStyle, 'gateway');
    assert.equal(config.apiKey, 'gateway-key');
    assert.equal(config.model, 'seedance-2-0-tezan');
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

test('getConfiguredVolcengineVideoModel falls back to legacy envs', () => {
  const previous = {
    ARTS_VIDEO_MODEL: process.env.ARTS_VIDEO_MODEL,
    VOLCENGINE_ARK_VIDEO_MODEL: process.env.VOLCENGINE_ARK_VIDEO_MODEL,
    ARK_VIDEO_MODEL: process.env.ARK_VIDEO_MODEL,
    AI_API_VIDEO_MODEL: process.env.AI_API_VIDEO_MODEL,
  };

  delete process.env.ARTS_VIDEO_MODEL;
  process.env.VOLCENGINE_ARK_VIDEO_MODEL = 'legacy-seedance-2-model';
  process.env.AI_API_VIDEO_MODEL = 'generic-model';

  try {
    assert.equal(getConfiguredVolcengineVideoModel(), 'legacy-seedance-2-model');
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

test('getConfiguredVolcengineVideoModel prefers project override when provided', () => {
  const previous = {
    ARTS_VIDEO_MODEL: process.env.ARTS_VIDEO_MODEL,
  };

  process.env.ARTS_VIDEO_MODEL = 'seedance-2-0-fast-tezan';

  try {
    assert.equal(
      getConfiguredVolcengineVideoModel('seedance-2-0-tezan'),
      'seedance-2-0-tezan'
    );
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

test('getVolcengineVideoConfig falls back to ARK base url and model envs', () => {
  const previous = {
    ARTS_VIDEO_BASE_URL: process.env.ARTS_VIDEO_BASE_URL,
    ARTS_API_BASE_URL: process.env.ARTS_API_BASE_URL,
    ARTS_API_KEY: process.env.ARTS_API_KEY,
    ARTS_VIDEO_MODEL: process.env.ARTS_VIDEO_MODEL,
    VOLCENGINE_ARK_VIDEO_BASE_URL: process.env.VOLCENGINE_ARK_VIDEO_BASE_URL,
    VOLCENGINE_ARK_VIDEO_API_KEY: process.env.VOLCENGINE_ARK_VIDEO_API_KEY,
    VOLCENGINE_ARK_VIDEO_MODEL: process.env.VOLCENGINE_ARK_VIDEO_MODEL,
    ARK_BASE_URL: process.env.ARK_BASE_URL,
    ARK_API_KEY: process.env.ARK_API_KEY,
    ARK_VIDEO_MODEL: process.env.ARK_VIDEO_MODEL,
  };

  delete process.env.ARTS_VIDEO_BASE_URL;
  delete process.env.ARTS_API_BASE_URL;
  delete process.env.ARTS_API_KEY;
  delete process.env.ARTS_VIDEO_MODEL;
  delete process.env.VOLCENGINE_ARK_VIDEO_BASE_URL;
  delete process.env.VOLCENGINE_ARK_VIDEO_API_KEY;
  delete process.env.VOLCENGINE_ARK_VIDEO_MODEL;
  process.env.ARK_BASE_URL = 'https://ark.example.com/api';
  process.env.ARK_API_KEY = 'ark-key';
  process.env.ARK_VIDEO_MODEL = 'seedance-2-0-fast-tezan';

  try {
    const config = getVolcengineVideoConfig();
    assert.equal(config.baseUrl, 'https://ark.example.com/api/v3');
    assert.equal(config.apiKey, 'ark-key');
    assert.equal(config.model, 'seedance-2-0-fast-tezan');
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

test('getVolcengineVideoConfig uses project model override', () => {
  const previous = {
    ARTS_VIDEO_BASE_URL: process.env.ARTS_VIDEO_BASE_URL,
    ARTS_API_BASE_URL: process.env.ARTS_API_BASE_URL,
    ARTS_API_KEY: process.env.ARTS_API_KEY,
    ARTS_VIDEO_MODEL: process.env.ARTS_VIDEO_MODEL,
  };

  delete process.env.ARTS_VIDEO_BASE_URL;
  process.env.ARTS_API_BASE_URL = 'https://apis.artsapi.com/api';
  process.env.ARTS_API_KEY = 'arts-video-key';
  process.env.ARTS_VIDEO_MODEL = 'seedance-2-0-fast-tezan';

  try {
    const config = getVolcengineVideoConfig('seedance-2-0-tezan');
    assert.equal(config.model, 'seedance-2-0-tezan');
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

test('getConfiguredVolcengineVideoModel ignores non-seedance generic fallback', () => {
  const previous = {
    ARTS_VIDEO_MODEL: process.env.ARTS_VIDEO_MODEL,
    VOLCENGINE_ARK_VIDEO_MODEL: process.env.VOLCENGINE_ARK_VIDEO_MODEL,
    ARK_VIDEO_MODEL: process.env.ARK_VIDEO_MODEL,
    AI_API_VIDEO_MODEL: process.env.AI_API_VIDEO_MODEL,
  };

  delete process.env.ARTS_VIDEO_MODEL;
  delete process.env.VOLCENGINE_ARK_VIDEO_MODEL;
  delete process.env.ARK_VIDEO_MODEL;
  process.env.AI_API_VIDEO_MODEL = 'kling-v3-omni-pro';

  try {
    assert.equal(getConfiguredVolcengineVideoModel(), '');
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
