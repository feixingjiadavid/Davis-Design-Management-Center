import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARK_CREATE_TIMEOUT_MS,
  STALE_UNBOUND_AFTER_MS,
  existingSubmissionResult,
  hasQueuedArkPayload,
  isStaleUnboundTask,
  staleUnboundFailurePayload,
} from './seedance-submit-policy.mjs';

test('allows worker enough time for the observed slow Ark create call', () => {
  assert.equal(ARK_CREATE_TIMEOUT_MS, 120_000);
});

test('detects only active unbound tasks after ten minutes', () => {
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
});

test('produces a terminal provider-binding timeout error for legacy tasks', () => {
  const payload = staleUnboundFailurePayload();
  assert.equal(payload.status, 'failed');
  assert.match(payload.error.message, /provider_task_id/i);
  assert.match(payload.error.message, /timeout/i);
});

test('recognizes durable Ark payloads for worker submission', () => {
  assert.equal(hasQueuedArkPayload({ request_payload: { ark_payload: { model: 'seedance' } } }), true);
  assert.equal(hasQueuedArkPayload({ request_payload: {} }), false);
});

test('idempotent replay remains successful while worker binding is pending', () => {
  const result = existingSubmissionResult({
    id: 'task-queued',
    project_id: 'project-1',
    segment_id: 'segment-1',
    provider_task_id: null,
    status: 'queued',
    progress: 10,
  });
  assert.equal(result.success, true);
  assert.equal(result.submission_pending, true);
  assert.equal(result.provider_task_id, null);
});
