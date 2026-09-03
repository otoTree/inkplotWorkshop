import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSeedance2VideoPayload,
  DEFAULT_SEEDANCE_2_RESOLUTION,
  INTSD2_X_RESOLUTION,
  resolveSeedance2Resolution,
} from './video-payload.ts';

test('buildSeedance2VideoPayload uses active domestic asset URIs', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'seedance-2-0-fast',
    prompt: '图片1保持角色一致，完成一个转身镜头。',
    references: [
      {
        usableUrl: 'asset://asset-20260424120352-8lkvp',
        sourceUrl: 'https://storage.example.com/active.png',
        mode: 'asset_uri',
        volcengineAssetStatus: 'Active',
        contentType: 'image_url',
        role: 'reference_image',
      },
    ],
    duration: 5,
    ratio: '9:16',
    generateAudio: true,
    watermark: false,
  });

  assert.equal(payload.ratio, '9:16');
  assert.equal(payload.resolution, DEFAULT_SEEDANCE_2_RESOLUTION);
  assert.equal(payload.content[1].type, 'image_url');
  const reference = payload.content[1];
  assert.equal(reference.type, 'image_url');
  if (reference.type === 'image_url') {
    assert.equal(reference.image_url.url, 'asset://asset-20260424120352-8lkvp');
  }
});

test('buildSeedance2VideoPayload uses URLs when references are not synced', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'seedance-2-0',
    prompt: '图片1保持场景一致。',
    references: [
      {
        usableUrl: 'https://example.com/a.png',
        mode: 'url',
        contentType: 'image_url',
        role: 'reference_image',
      },
    ],
    duration: 4,
    ratio: '16:9',
    generateAudio: false,
    watermark: false,
  });

  assert.equal(payload.ratio, '16:9');
  assert.equal(payload.resolution, DEFAULT_SEEDANCE_2_RESOLUTION);
  const reference = payload.content[1];
  assert.equal(reference.type, 'image_url');
  if (reference.type === 'image_url') {
    assert.equal(reference.image_url.url, 'https://example.com/a.png');
  }
});

test('buildSeedance2VideoPayload falls back to source URL for non-active asset URIs', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'seedance-2-0-fast',
    prompt: '图片1保持场景一致。',
    references: [
      {
        usableUrl: 'asset://asset-processing-1',
        sourceUrl: 'https://example.com/pending.png',
        mode: 'asset_uri',
        volcengineAssetStatus: 'Processing',
        contentType: 'image_url',
        role: 'reference_image',
      },
    ],
  });

  const reference = payload.content[1];
  assert.equal(reference.type, 'image_url');
  if (reference.type === 'image_url') {
    assert.equal(reference.image_url.url, 'https://example.com/pending.png');
  }
});

test('buildSeedance2VideoPayload accepts an active asset URI without source URL', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'seedance-2-0-fast',
    prompt: '不应提交素材 ID。',
    references: [
      {
        usableUrl: 'asset://asset-only-id',
        mode: 'asset_uri',
        volcengineAssetStatus: 'Active',
      },
    ],
  });

  assert.equal(payload.content.length, 2);
  const reference = payload.content[1];
  assert.equal(reference.type, 'image_url');
  if (reference.type === 'image_url') {
    assert.equal(reference.image_url.url, 'asset://asset-only-id');
  }
});

test('buildSeedance2VideoPayload always uses the fixed resolution', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'seedance-2-0-fast',
    prompt: '测试固定分辨率。',
  });

  assert.equal(payload.resolution, DEFAULT_SEEDANCE_2_RESOLUTION);
  assert.equal(payload.resolution, '480p');
});

test('buildSeedance2VideoPayload forces intsd2-x to 720p', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'intsd2-x',
    prompt: '测试国际版固定分辨率。',
  });

  assert.equal(resolveSeedance2Resolution('intsd2-x'), INTSD2_X_RESOLUTION);
  assert.equal(payload.resolution, '720p');
});

test('buildSeedance2VideoPayload builds the overseas Fast body with landscape size', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'intsd20-hc-f',
    prompt: 'A red ball resting on a plain white table, static camera, minimal motion.',
    references: [
      {
        usableUrl: 'https://storage.example.com/a.png',
        mode: 'url',
      },
      {
        usableUrl: 'https://storage.example.com/b.png',
        mode: 'url',
      },
    ],
    duration: 5,
    ratio: '16:9',
  });

  assert.deepEqual(payload, {
    model: 'intsd20-hc-f',
    prompt: 'A red ball resting on a plain white table, static camera, minimal motion.',
    size: '1280x720',
    duration: 5,
    reference_images: [
      { url: 'https://storage.example.com/a.png' },
      { url: 'https://storage.example.com/b.png' },
    ],
  });
});

test('buildSeedance2VideoPayload builds the overseas standard body with portrait size', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'intsd20-hc',
    prompt: '人物保持一致，缓慢走近镜头。',
    references: [
      {
        usableUrl: 'https://storage.example.com/character.png',
        mode: 'url',
      },
    ],
    duration: 5,
    ratio: '9:16',
  });

  assert.deepEqual(payload, {
    model: 'intsd20-hc',
    prompt: '人物保持一致，缓慢走近镜头。',
    size: '720x1280',
    duration: 5,
    reference_images: [{ url: 'https://storage.example.com/character.png' }],
  });
});
