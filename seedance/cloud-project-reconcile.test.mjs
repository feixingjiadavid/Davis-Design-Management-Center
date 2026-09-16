import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudDraftFromProject } from './cloud-project-reconcile.mjs';

test('cloud project cache creates a fully bound local draft for cross-device recovery', () => {
  const project = {
    id: 'fd816722-f663-4ce1-b3f4-621564caee13',
    owner_id: 'owner-1',
    name: '小蓝书视频 · test',
    task_name: 'test',
    parent_group_id: 'group-1',
    mode: 'first_last',
    ratio: '16:9',
    frame_fit_mode: 'contain',
    project_category: 'Smart文化-OpenTalk',
    created_at: '2026-09-16T02:08:40Z',
    updated_at: '2026-09-16T02:32:44Z',
  };

  const draft = cloudDraftFromProject(project, 'owner-1');
  assert.equal(draft.id, 'cloud-fd816722-f663-4ce1-b3f4-621564caee13');
  assert.equal(draft.name, 'test');
  assert.equal(draft.remoteProjectId, project.id);
  assert.equal(draft.parentGroupId, 'group-1');
  assert.equal(draft.taskName, 'test');
  assert.equal(draft.workspaces.first_last.remoteProjectId, project.id);
  assert.equal(draft.workspaces.first_last.remoteBindingVersion, 'r5.3');
  assert.equal(draft.workspaces.first_last.remoteBindingLocked, true);
  assert.equal(draft.workspaces.first_last.cloudSyncedAt, 0);
});

test('cloud project cache preserves vertical project dimensions', () => {
  const draft = cloudDraftFromProject({
    id: 'p2', owner_id: 'owner-2', name: '竖屏 · A', task_name: 'A', mode: 'first_last', ratio: '9:16',
  }, 'owner-2');
  assert.equal(draft.finalWidth, 1080);
  assert.equal(draft.finalHeight, 1920);
});
