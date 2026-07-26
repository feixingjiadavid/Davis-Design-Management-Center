import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTaskFromArk } from './seedance-task-sync.mjs';

test('uses one atomic persistence call when the adapter provides it', async () => {
  let calls = 0;
  const adapter = {
    async persistResult(task, result, payload) {
      calls += 1;
      assert.equal(task.id, 'task-atomic');
      assert.equal(result.status, 'succeeded');
      assert.equal(payload.content.video_url, 'https://ark.example/atomic.mp4');
      return { status: 'succeeded', progress: 100, error_message: null, output_id: 'output-atomic' };
    },
    async updateTask() { throw new Error('non-atomic path must not run'); },
  };
  const task = {
    id: 'task-atomic',
    owner_id: 'owner-1',
    provider_task_id: 'cgt-atomic',
    status: 'running',
    progress: 60,
  };
  const result = await syncTaskFromArk(task, {
    status: 'succeeded',
    content: { video_url: 'https://ark.example/atomic.mp4' },
  }, adapter);

  assert.equal(calls, 1);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.id, 'output-atomic');
});

test('returns the database decision when success has no durable output URL', async () => {
  const adapter = {
    async persistResult() {
      return {
        status: 'running',
        progress: 60,
        error_message: 'Ark succeeded but video URL is missing; retrying',
        output_id: null,
      };
    },
  };
  const result = await syncTaskFromArk({
    id: 'task-missing-url',
    status: 'running',
    progress: 60,
  }, { status: 'succeeded' }, adapter);

  assert.equal(result.status, 'running');
  assert.match(result.errorMessage, /missing/i);
  assert.equal(result.output, null);
});
