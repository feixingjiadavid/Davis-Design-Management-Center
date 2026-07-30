import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeArkCreateFailure } from './seedance-ark-errors.mjs';

test('maps Seedance real-person privacy rejection to a non-retryable Chinese action message', () => {
  const result = normalizeArkCreateFailure({
    error: {
      code: 'InputImageSensitiveContentDetected.PrivacyInformation',
      message: "The request failed because the input image 'content[1]' may contain real person.",
      param: 'content[1]',
      type: 'BadRequest',
      request_id: '0217853920410490302f8d6c7c8f58cdd8d6dccad7d1f79ce73db',
    },
  }, 400);

  assert.equal(result.code, 'ARK_REAL_PERSON_AUTH_REQUIRED');
  assert.equal(result.retryable, false);
  assert.equal(result.referenceNumber, 1);
  assert.equal(result.requestId, '0217853920410490302f8d6c7c8f58cdd8d6dccad7d1f79ce73db');
  assert.match(result.message, /第 1 张参考图/);
  assert.match(result.message, /可信素材库/);
  assert.match(result.message, /Asset ID/);
  assert.doesNotMatch(result.message, /Ark create rejected/);
});

test('keeps ordinary Ark failures identifiable without misclassifying them as privacy errors', () => {
  const result = normalizeArkCreateFailure({
    error: {
      code: 'InvalidParameter',
      message: 'duration is invalid',
      param: 'duration',
    },
  }, 400);

  assert.equal(result.code, 'InvalidParameter');
  assert.equal(result.retryable, false);
  assert.match(result.message, /duration is invalid/);
});

test('marks transient Ark HTTP failures retryable', () => {
  const result = normalizeArkCreateFailure({ error: { message: 'busy' } }, 503);

  assert.equal(result.retryable, true);
  assert.equal(result.httpStatus, 503);
});

test('extracts Ark request id from provider message when not exposed as a field', () => {
  const result = normalizeArkCreateFailure({
    error: {
      code: 'InvalidParameter',
      message: 'request rejected. Request id: abc-123-xyz',
    },
  }, 400);
  assert.equal(result.requestId, 'abc-123-xyz');
});
