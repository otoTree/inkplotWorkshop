import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SEEDANCE_2_VIDEO_MODEL,
  DEFAULT_PROJECT_VIDEO_ASPECT_RATIO,
  DEFAULT_PROJECT_VIDEO_MODEL,
  inferVideoTaskProvider,
  normalizeProjectVideoAspectRatio,
  normalizeProjectVideoGenerationModel,
  normalizeProjectVideoModel,
  normalizeProjectVideoSettings,
  shouldUseSeedance2ForProject,
} from './video-compat.ts';

test('normalizeProjectVideoModel defaults old projects to legacy', () => {
  assert.equal(normalizeProjectVideoModel(undefined), DEFAULT_PROJECT_VIDEO_MODEL);
  assert.equal(normalizeProjectVideoModel(''), DEFAULT_PROJECT_VIDEO_MODEL);
  assert.equal(normalizeProjectVideoModel('doubao-video'), DEFAULT_PROJECT_VIDEO_MODEL);
});

test('normalizeProjectVideoModel maps legacy seedance strings to seedance-2.0', () => {
  assert.equal(normalizeProjectVideoModel('doubao-seedance-2-0-pro'), 'seedance-2.0');
});

test('normalizeProjectVideoSettings applies explicit safe defaults', () => {
  assert.deepEqual(normalizeProjectVideoSettings(null), {
    syncAssetsToPrivateLibrary: false,
    assetGroupId: undefined,
    projectName: 'default',
    model: 'legacy',
    preferredVideoModel: 'legacy',
    aspectRatio: '9:16',
  });
});

test('normalizeProjectVideoGenerationModel upgrades old seedance preference to concrete model id', () => {
  assert.equal(
    normalizeProjectVideoGenerationModel(undefined, 'seedance-2.0'),
    DEFAULT_SEEDANCE_2_VIDEO_MODEL
  );
  assert.equal(DEFAULT_SEEDANCE_2_VIDEO_MODEL, 'dreamina-seedance-2-0-260128');
  assert.equal(
    normalizeProjectVideoGenerationModel('dreamina-seedance-2-0-260128'),
    'dreamina-seedance-2-0-260128'
  );
  assert.equal(
    normalizeProjectVideoGenerationModel('doubao-seedance-2-0-260128'),
    'doubao-seedance-2-0-260128'
  );
  assert.equal(
    normalizeProjectVideoGenerationModel('doubao-seedance-2-0-pro'),
    DEFAULT_SEEDANCE_2_VIDEO_MODEL
  );
  assert.equal(normalizeProjectVideoGenerationModel('legacy'), 'legacy');
});

test('normalizeProjectVideoAspectRatio keeps supported values and falls back safely', () => {
  assert.equal(normalizeProjectVideoAspectRatio('16:9'), '16:9');
  assert.equal(normalizeProjectVideoAspectRatio(undefined), DEFAULT_PROJECT_VIDEO_ASPECT_RATIO);
  assert.equal(normalizeProjectVideoAspectRatio('1:1'), DEFAULT_PROJECT_VIDEO_ASPECT_RATIO);
});

test('shouldUseSeedance2ForProject respects explicit project choice', () => {
  assert.equal(shouldUseSeedance2ForProject({ preferredVideoModel: 'seedance-2.0' }), true);
  assert.equal(shouldUseSeedance2ForProject({ preferredVideoModel: 'legacy' }), false);
});

test('inferVideoTaskProvider recognizes old volcengine metadata without provider', () => {
  assert.equal(
    inferVideoTaskProvider('task-anything', {
      model: 'doubao-seedance-2-0-pro',
    }),
    'volcengine'
  );
  assert.equal(
    inferVideoTaskProvider('task-anything', {
      requestContentMode: 'asset_uri',
    }),
    'volcengine'
  );
});

test('inferVideoTaskProvider falls back to legacy for old legacy tasks', () => {
  assert.equal(inferVideoTaskProvider('job_legacy_123', {}), 'legacy');
});

test('inferVideoTaskProvider recognizes legacy volcengine task ids', () => {
  assert.equal(inferVideoTaskProvider('cgt-20260507-demo', {}), 'volcengine');
});
