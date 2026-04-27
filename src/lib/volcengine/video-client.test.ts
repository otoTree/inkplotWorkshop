import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractVolcengineVideoUrl,
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
