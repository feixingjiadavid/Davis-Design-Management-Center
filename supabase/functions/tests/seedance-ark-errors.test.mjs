import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeArkCreateFailure } from '../_shared/seedance-ark-errors.mjs';

test('PrivacyInformation is a non-retryable provider policy block', () => {
  const result = normalizeArkCreateFailure({
    error: {
      code: 'InputImageSensitiveContentDetected.PrivacyInformation',
      message: 'The input image content[1] may contain real person',
      param: 'content[1]'
    },
    request_id: 'req-policy-1'
  }, 400);
  assert.equal(result.code, 'PROVIDER_POLICY_BLOCKED');
  assert.equal(result.providerCode, 'InputImageSensitiveContentDetected.PrivacyInformation');
  assert.equal(result.requestId, 'req-policy-1');
  assert.equal(result.retryable, false);
  assert.doesNotMatch(result.message, /Ark|Asset|PrivacyInformation/);
});
