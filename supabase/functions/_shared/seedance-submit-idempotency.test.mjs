import test from 'node:test';
import assert from 'node:assert/strict';
import { existingSubmissionResult } from './seedance-submit-policy.mjs';

test('returns a provider-bound task without creating another Ark task', () => {
  const result = existingSubmissionResult({
    id: 'local-task',
    provider_task_id: 'cgt-existing',
    status: 'queued',
    progress: 20,
    project_id: 'project-1',
    segment_id: 'segment-1',
  });
  assert.equal(result.success, true);
  assert.equal(result.provider_task_id, 'cgt-existing');
  assert.equal(result.retryable, false);
});

test('blocks another Ark POST while provider binding is unknown', () => {
  const result = existingSubmissionResult({
    id: 'local-task',
    provider_task_id: null,
    status: 'submitting',
    progress: 12,
    project_id: 'project-1',
    segment_id: 'segment-1',
  });
  assert.equal(result.success, false);
  assert.equal(result.task_id, 'local-task');
  assert.equal(result.retryable, false);
  assert.match(result.error, /already accepted/i);
});
