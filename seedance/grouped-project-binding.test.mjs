import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseGroupedProjectBinding, applyProjectBindingToDraft } from './grouped-project-binding.mjs';

test('matches grouped remote project by task_name when local draft name is only child task name', () => {
  const local = {
    name: 'test',
    mode: 'first_last',
    parentGroupId: 'group-1',
    createdAt: Date.parse('2026-09-16T02:08:40Z'),
    workspaces: { first_last: { remoteProjectId: null, segments: [] } },
  };
  const projects = [
    {
      id: 'remote-project', owner_id: 'owner-1', name: '小蓝书视频 · test', task_name: 'test',
      parent_group_id: 'group-1', mode: 'first_last', status: 'generating',
      created_at: '2026-09-16T02:08:40Z', project_category: 'Smart文化-小蓝书运营',
    },
  ];
  assert.equal(chooseGroupedProjectBinding(local, projects)?.id, 'remote-project');
});

test('prefers same parent group when two projects have the same child task name', () => {
  const local = { name: 'test', mode: 'first_last', parentGroupId: 'group-2', createdAt: Date.now() };
  const projects = [
    { id: 'wrong', name: 'A · test', task_name: 'test', parent_group_id: 'group-1', mode: 'first_last', created_at: new Date().toISOString() },
    { id: 'right', name: 'B · test', task_name: 'test', parent_group_id: 'group-2', mode: 'first_last', created_at: new Date().toISOString() },
  ];
  assert.equal(chooseGroupedProjectBinding(local, projects)?.id, 'right');
});

test('writes exact remote binding into active workspace so normal cloud recovery can load segments and outputs', () => {
  const draft = {
    name: 'test', mode: 'first_last', lockedMode: 'first_last',
    workspaces: { first_last: { remoteProjectId: null, segments: [] } },
  };
  const project = {
    id: 'remote-project', owner_id: 'owner-1', name: '小蓝书视频 · test', task_name: 'test',
    parent_group_id: 'group-1', project_category: 'Smart文化-小蓝书运营', mode: 'first_last',
  };
  const changed = applyProjectBindingToDraft(draft, project);
  assert.equal(changed, true);
  assert.equal(draft.remoteProjectId, 'remote-project');
  assert.equal(draft.workspaces.first_last.remoteProjectId, 'remote-project');
  assert.equal(draft.workspaces.first_last.remoteBindingLocked, true);
  assert.equal(draft.workspaces.first_last.remoteBindingVersion, 'r5.3');
  assert.equal(draft.taskName, 'test');
});
