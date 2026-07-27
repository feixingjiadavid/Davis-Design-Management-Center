import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARK_CREATE_TIMEOUT_MS,
  STALE_UNBOUND_AFTER_MS,
  isStaleUnboundTask,
  staleUnboundFailurePayload,
} from './seedance-submit-policy.mjs';

test('keeps Ark creation within the Edge request timeout', () => {
  assert.equal(ARK_CREATE_TIMEOUT_MS, 45_000);
});

test('fails only active unbound tasks after ten minutes', () => {
  const now = Date.parse('2026-07-27T00:20:00Z');
  assert.equal(STALE_UNBOUND_AFTER_MS, 10 * 60_000);
  assert.equal(isStaleUnboundTask({
    status: 'submitting',
    provider_task_id: null,
    updated_at: '2026-07-27T00:09:59Z',
  }, now), true);
  assert.equal(isStaleUnboundTask({
    status: 'queued',
    provider_task_id: null,
    updated_at: '2026-07-27T00:15:00Z',
  }, now), false);
  assert.equal(isStaleUnboundTask({
    status: 'running',
    provider_task_id: 'cgt-bound',
    updated_at: '2026-07-27T00:00:00Z',
  }, now), false);
  assert.equal(isStaleUnboundTask({
    status: 'failed',
    provider_task_id: null,
    updated_at: '2026-07-27T00:00:00Z',
  }, now), false);
});

test('produces a terminal provider-binding timeout error', () => {
  const payload = staleUnboundFailurePayload();
  assert.equal(payload.status, 'failed');
  assert.match(payload.error.message, /provider_task_id/i);
  assert.match(payload.error.message, /timeout/i);
});
