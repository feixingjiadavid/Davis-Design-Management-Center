import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTaskFromArk } from './seedance-task-sync.mjs';

function memoryAdapter() {
  const state = { taskUpdates: [], segmentUpdates: [], outputs: [] };
  return {
    state,
    async updateTask(id, patch) { state.taskUpdates.push({ id, patch }); },
    async updateSegment(id, ownerId, patch) { state.segmentUpdates.push({ id, ownerId, patch }); },
    async findOutputByTaskId(taskId) { return state.outputs.find(row => row.task_id === taskId) || null; },
    async insertOutput(row) { const output = { id: 'output-1', ...row }; state.outputs.push(output); return output; },
    async updateOutput(id, patch) {
      const row = state.outputs.find(item => item.id === id);
      Object.assign(row, patch);
      return row;
    },
  };
}

const task = {
  id: 'task-1',
  owner_id: 'owner-1',
  project_id: 'project-1',
  segment_id: 'segment-1',
  provider_task_id: 'cgt-test',
  status: 'queued',
  progress: 20,
};

test('persists moderation failure instead of leaving the task queued', async () => {
  const adapter = memoryAdapter();
  await syncTaskFromArk(task, {
    status: 'failed',
    error: {
      code: 'InputTextSensitiveContentDetected',
      message: '提示词敏感，无法生成',
    },
  }, adapter, '2026-07-27T00:00:00.000Z');

  assert.equal(adapter.state.taskUpdates[0].patch.status, 'failed');
  assert.equal(adapter.state.taskUpdates[0].patch.progress, 100);
  assert.equal(adapter.state.taskUpdates[0].patch.error_message, '提示词敏感，无法生成');
  assert.equal(adapter.state.segmentUpdates[0].patch.status, 'failed');
});

test('writes one idempotent video output containing the Ark URL', async () => {
  const adapter = memoryAdapter();
  const ark = {
    status: 'succeeded',
    content: { video_url: 'https://ark.example/video.mp4' },
  };

  await syncTaskFromArk(task, ark, adapter, '2026-07-27T00:00:00.000Z');
  await syncTaskFromArk(task, ark, adapter, '2026-07-27T00:01:00.000Z');

  assert.equal(adapter.state.outputs.length, 1);
  assert.equal(adapter.state.outputs[0].task_id, 'task-1');
  assert.equal(adapter.state.outputs[0].storage_path, 'ark://cgt-test.mp4');
  assert.equal(adapter.state.outputs[0].metadata.provider_video_url, 'https://ark.example/video.mp4');
  assert.equal(adapter.state.taskUpdates.at(-1).patch.status, 'succeeded');
});


test('keeps task processing while Google Drive upload is pending or failed', async () => {
  const adapter = memoryAdapter();
  adapter.syncOutputToDrive = async () => ({
    storage_status: 'failed',
    storage_error: 'temporary Drive error',
  });
  const result = await syncTaskFromArk(task, {
    status: 'succeeded',
    content: { video_url: 'https://ark.example/video.mp4' },
  }, adapter, '2026-07-27T00:02:00.000Z');

  assert.equal(result.status, 'processing');
  assert.equal(result.progress, 99);
  assert.equal(result.output.storage_status, 'failed');
  assert.equal(adapter.state.taskUpdates.at(-1).patch.status, 'processing');
  assert.equal(adapter.state.segmentUpdates.at(-1).patch.status, 'processing');
});

test('reports success only after Google Drive returns completed', async () => {
  const adapter = memoryAdapter();
  adapter.syncOutputToDrive = async () => ({
    storage_status: 'completed',
    google_drive_file_id: 'drive-file-1',
  });
  const result = await syncTaskFromArk(task, {
    status: 'succeeded',
    content: { video_url: 'https://ark.example/video.mp4' },
  }, adapter, '2026-07-27T00:03:00.000Z');

  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.storage_status, 'completed');
  assert.equal(result.output.google_drive_file_id, 'drive-file-1');
});
