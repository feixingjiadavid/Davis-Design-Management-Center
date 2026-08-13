import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const access = fs.readFileSync(new URL('./access-control.mjs', import.meta.url), 'utf8');

test('new child task is owned by current authenticated user before first save/select', () => {
  const anchor = "const remoteName = `${group.name} · ${taskName}`, draft = newDraft(key,remoteName,group.project_category);";
  const i = app.indexOf(anchor);
  assert.notEqual(i, -1, 'child task creation anchor must exist');
  const block = app.slice(i, i + 1500);
  assert.match(block, /draft\.ownerId\s*=\s*state\.user\.id/);
  assert.match(block, /workspace\.ownerId\s*=\s*state\.user\.id/);
  const ownerWrite = block.indexOf('draft.ownerId = state.user.id');
  const firstSave = block.indexOf('await saveDraft(draft)');
  assert.ok(ownerWrite >= 0 && firstSave >= 0 && ownerWrite < firstSave, 'owner must be assigned before first save');
});

test('ordinary user reads remain owner scoped', () => {
  assert.match(access, /return query\.eq\(ownerColumn, userId\)/);
});

test('foreign owner mutation remains denied', () => {
  assert.match(access, /return currentUserId !== recordOwnerId/);
  assert.match(access, /return !isForeignVideoOwner\(user, ownerId\)/);
});
