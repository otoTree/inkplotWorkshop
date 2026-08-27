import assert from 'node:assert/strict';
import test from 'node:test';
import { getAIAPIConfigKey } from './ai-server.ts';

const baseConfig = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-sensitive-value',
  model: 'test-model',
  timeoutMs: 300_000,
  maxConcurrency: 10,
  minIntervalMs: 0,
};

test('Redis config keys are stable without exposing the API key', () => {
  const first = getAIAPIConfigKey(baseConfig);
  const second = getAIAPIConfigKey({ ...baseConfig });

  assert.equal(first, second);
  assert.equal(first.includes(baseConfig.apiKey), false);
  assert.match(first, /^https:\/\/api\.example\.com\/v1\|[a-f0-9]{16}\|10$/);
});

test('Redis config keys change when the API credential changes', () => {
  assert.notEqual(
    getAIAPIConfigKey(baseConfig),
    getAIAPIConfigKey({ ...baseConfig, apiKey: 'sk-another-value' })
  );
});
