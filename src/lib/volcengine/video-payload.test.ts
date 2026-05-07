import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSeedance2VideoPayload } from './video-payload.ts';

test('buildSeedance2VideoPayload prefers active asset URIs', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'doubao-seedance-2-0-pro',
    prompt: '图片1保持角色一致，完成一个转身镜头。',
    references: [
      {
        usableUrl: 'asset://asset-20260424120352-8lkvp',
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

  assert.equal(payload.content[1].type, 'image_url');
  const reference = payload.content[1];
  assert.equal(reference.type, 'image_url');
  if (reference.type === 'image_url') {
    assert.equal(reference.image_url.url, 'asset://asset-20260424120352-8lkvp');
  }
});

test('buildSeedance2VideoPayload uses URLs when references are not synced', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'doubao-seedance-2-0-pro',
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

  const reference = payload.content[1];
  assert.equal(reference.type, 'image_url');
  if (reference.type === 'image_url') {
    assert.equal(reference.image_url.url, 'https://example.com/a.png');
  }
});

test('buildSeedance2VideoPayload falls back to source URL for non-active asset URIs', () => {
  const payload = buildSeedance2VideoPayload({
    model: 'doubao-seedance-2-0-pro',
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
