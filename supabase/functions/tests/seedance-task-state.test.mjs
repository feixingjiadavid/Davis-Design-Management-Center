import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyArkFailure, reduceTaskState, reduceSegmentStates } from '../_shared/seedance-task-state.mjs';

test('privacy rejection blocks only the affected segment', () => {
  const next = reduceTaskState(
    { status: 'submitting', progress: 12 },
    {
      type: 'provider_failure',
      code: 'InputImageSensitiveContentDetected.PrivacyInformation',
      requestId: 'req-1'
    }
  );
  assert.equal(next.status, 'provider_policy_blocked');
  assert.equal(next.progress, 0);
  assert.equal(next.retryable, false);
  assert.equal(next.retryCount, 0);
  assert.equal(next.projectTerminal, false);
  assert.equal(next.provider_request_id, 'req-1');
  assert.equal(next.provider_error_code, 'InputImageSensitiveContentDetected.PrivacyInformation');
});

test('privacy classification keeps diagnostics but public copy hides provider details', () => {
  const failure = classifyArkFailure({
    code: 'InputImageSensitiveContentDetected.PrivacyInformation',
    request_id: 'req-2'
  }, 400);
  assert.equal(failure.status, 'provider_policy_blocked');
  assert.equal(failure.retryable, false);
  assert.equal(failure.retryCount, 0);
  assert.equal(failure.errorType, 'InputImageSensitiveContentDetected.PrivacyInformation');
  assert.equal(failure.requestId, 'req-2');
  assert.match(failure.publicMessage, /当前视频模型/);
  assert.doesNotMatch(failure.publicMessage, /Ark|Asset|PrivacyInformation/);
});

test('task lifecycle is monotonic', () => {
  let state = { status: 'queued', progress: 0 };
  state = reduceTaskState(state, { type: 'provider_generating', progress: 35 });
  assert.equal(state.status, 'generating');
  state = reduceTaskState(state, { type: 'provider_succeeded' });
  assert.equal(state.status, 'uploading_drive');
  state = reduceTaskState(state, { type: 'drive_completed' });
  assert.equal(state.status, 'completed');
  assert.equal(state.progress, 100);
});

test('generic provider and drive failures are distinct', () => {
  assert.equal(reduceTaskState({ status: 'generating' }, {
    type: 'provider_failure', code: 'ProviderUnavailable'
  }).status, 'provider_error');
  assert.equal(reduceTaskState({ status: 'uploading_drive' }, {
    type: 'drive_failure'
  }).status, 'drive_sync_failed');
});

test('blocked segment does not change siblings', () => {
  const before = [
    { id: 'a', status: 'generating' },
    { id: 'b', status: 'completed' }
  ];
  const after = reduceSegmentStates(before, 'a', {
    type: 'provider_failure',
    code: 'InputImageSensitiveContentDetected.PrivacyInformation'
  });
  assert.equal(after[0].status, 'provider_policy_blocked');
  assert.deepEqual(after[1], before[1]);
});
