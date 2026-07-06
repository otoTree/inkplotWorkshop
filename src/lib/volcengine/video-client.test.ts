import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVolcengineSubmissionMetadata,
  extractVolcengineVideoUrl,
  getConfiguredVolcengineVideoModel,
  getVolcengineTaskSnapshot,
  getVolcengineVideoConfig,
  mergeVolcengineTaskMetadata,
  mapVolcengineTaskStatus,
} from './video-client.ts';

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
  process.env.ARTS_API_KEY = 'arts-video-key';
  process.env.ARTS_VIDEO_MODEL = 'doubao-seedance-2-0-260128';
  process.env.VOLCENGINE_ARK_VIDEO_BASE_URL = 'https://legacy.example.com/api/v3';
  process.env.VOLCENGINE_ARK_VIDEO_API_KEY = 'legacy-video-key';
  process.env.VOLCENGINE_ARK_VIDEO_MODEL = 'legacy-model';

  try {
    const config = getVolcengineVideoConfig();
    assert.equal(config.baseUrl, 'https://apis.artsapi.com/api/v3');
    assert.equal(config.apiKey, 'arts-video-key');
    assert.equal(config.model, 'doubao-seedance-2-0-260128');
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

  process.env.ARTS_VIDEO_MODEL = 'doubao-seedance-2-0-260128';

  try {
    assert.equal(
      getConfiguredVolcengineVideoModel('doubao-seedance-2-0-999999'),
      'doubao-seedance-2-0-999999'
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

  delete process.env.ARTS_API_BASE_URL;
  delete process.env.ARTS_API_KEY;
  delete process.env.ARTS_VIDEO_MODEL;
  delete process.env.VOLCENGINE_ARK_VIDEO_BASE_URL;
  delete process.env.VOLCENGINE_ARK_VIDEO_API_KEY;
  delete process.env.VOLCENGINE_ARK_VIDEO_MODEL;
  process.env.ARK_BASE_URL = 'https://ark.example.com/api';
  process.env.ARK_API_KEY = 'ark-key';
  process.env.ARK_VIDEO_MODEL = 'doubao-seedance-2-0-260128';

  try {
    const config = getVolcengineVideoConfig();
    assert.equal(config.baseUrl, 'https://ark.example.com/api/v3');
    assert.equal(config.apiKey, 'ark-key');
    assert.equal(config.model, 'doubao-seedance-2-0-260128');
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
    ARTS_API_BASE_URL: process.env.ARTS_API_BASE_URL,
    ARTS_API_KEY: process.env.ARTS_API_KEY,
    ARTS_VIDEO_MODEL: process.env.ARTS_VIDEO_MODEL,
  };

  process.env.ARTS_API_BASE_URL = 'https://apis.artsapi.com/api';
  process.env.ARTS_API_KEY = 'arts-video-key';
  process.env.ARTS_VIDEO_MODEL = 'doubao-seedance-2-0-260128';

  try {
    const config = getVolcengineVideoConfig('doubao-seedance-2-0-999999');
    assert.equal(config.model, 'doubao-seedance-2-0-999999');
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
