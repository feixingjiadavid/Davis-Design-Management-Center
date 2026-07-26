import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTaskFromArk } from './seedance-task-sync.mjs';

test('keeps an active task queued when Ark returns a transient unknown response', async () => {
  const updates = [];
  const adapter = {
    async updateTask(id, patch) { updates.push({ id, patch }); },
    async updateSegment() {},
    async findOutputByTaskId() { return null; },
    async insertOutput() { throw new Error('must not insert'); },
    async updateOutput() { throw new Error('must not update'); },
  };
  const task = {
    id: 'task-unknown',
    owner_id: 'owner-1',
    segment_id: 'segment-1',
    provider_task_id: 'cgt-unknown',
    status: 'queued',
    progress: 20,
  };

  await syncTaskFromArk(task, { status: 'unknown' }, adapter);
  assert.equal(updates[0].patch.status, 'queued');
  assert.equal(updates[0].patch.progress, 20);
});
