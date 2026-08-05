import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getVideoGenerationTaskNotFoundError,
  isVideoGenerationTaskNotFoundError,
} from './video-generation-error.ts';

test('detects the provider NotFound InvalidRequestError response', () => {
  const error = {
    error: {
      code: 'NotFound',
      message: 'Task not found',
      type: 'InvalidRequestError',
    },
  };

  assert.equal(isVideoGenerationTaskNotFoundError(error), true);
  assert.deepEqual(getVideoGenerationTaskNotFoundError(error), error);
});

test('detects the exact response when it is JSON encoded', () => {
  assert.equal(
    isVideoGenerationTaskNotFoundError(JSON.stringify({
      error: {
        code: 'NotFound',
        message: 'Task not found',
        type: 'InvalidRequestError',
      },
    })),
    true
  );
});

test('does not handle other task-not-found formats', () => {
  assert.equal(
    isVideoGenerationTaskNotFoundError({
      error: {
        code: 'task_not_found',
        message: 'Generation task was not found.',
        type: 'api_error',
      },
    }),
    false
  );
  assert.equal(
    isVideoGenerationTaskNotFoundError({
      error_code: 'query_http_error',
      error_message: 'Task not found',
    }),
    false
  );
});
