import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const r54 = readFileSync(new URL('./r54-deliverables.js', import.meta.url), 'utf8');

test('foreign project collaboration is not blocked by the old read-only guard', () => {
  assert.doesNotMatch(app, /不能在其他用户的项目下新增任务/);
  assert.match(app, /function r16CurrentProjectWritable[\s\S]*canMutateVideoOwner/);
});

test('shared project reads are not restricted to the original owner id', () => {
  assert.match(app, /function r16ScopeProjectRead\([^)]*\)[\s\S]*return scopeVideoRead\(query, state\.user\)/);
});

test('cloud draft restoration keeps foreign-owner tasks visible to authenticated collaborators', () => {
  assert.doesNotMatch(app, /isVideoSuperAdmin\(state\.user\) \|\| !ownerId \|\| ownerId === state\.user\.id/);
  assert.doesNotMatch(app, /isVideoSuperAdmin\(state\.user\) \|\| ownerId === state\.user\.id/);
});

test('delete remains owner-only after collaborative editing is enabled', () => {
  assert.match(app, /canDeleteVideoOwner/);
  assert.match(app, /function r16CurrentProjectDeletable/);
  assert.match(app, /r16AssertCurrentProjectDeletable/);
});

test('R54 separates collaborator actions from owner-only destructive actions', () => {
  assert.match(r54, /function canCollaborate\(group\)/);
  assert.match(r54, /function isOwner\(group\)/);
});
