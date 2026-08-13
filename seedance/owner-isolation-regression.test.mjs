import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const r54 = fs.readFileSync(new URL('./r54-deliverables.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./a-ui-layout-fix.css', import.meta.url), 'utf8');
const access = fs.readFileSync(new URL('./access-control.mjs', import.meta.url), 'utf8');

test('all video reads are owner-scoped, including administrator accounts', () => {
  assert.doesNotMatch(access, /if \(isVideoSuperAdmin\(user\)\) return query/);
  assert.match(access, /return query\.eq\(ownerColumn, userId\)/);
  const scopeStart = app.indexOf('function r16ScopeProjectRead(');
  assert.notEqual(scopeStart, -1);
  const scopeBlock = app.slice(scopeStart, scopeStart + 260);
  assert.match(scopeBlock, /return scopeVideoRead\(query, state\.user\)/);
  assert.doesNotMatch(scopeBlock, /query\.eq\('owner_id', ownerId\)/);
});

test('foreign and ownerless browser drafts are not adopted by another account', () => {
  assert.match(app, /function r17LocalDraftOwnerId\(/);
  assert.match(app, /function r17LocalDraftsForCurrentUser\(/);
  assert.match(app, /r17LocalDraftsForCurrentUser\(await listDrafts\(\)\)/);
  assert.doesNotMatch(app, /draft\.ownerId = draft\.remoteOwnerId \|\| draft\.ownerId \|\| state\.user\?\.id/);
});

test('R54 local and cloud state are explicitly scoped to current user', () => {
  assert.match(r54, /function localDraftsForCurrentUser\(/);
  assert.match(r54, /\.eq\('owner_id',state\.user\.id\)/);
});

test('creating a deliverable immediately continues into generation-task creation', () => {
  assert.match(r54, /openChildTaskForDeliverable\(gid,result\.data\.id\)/);
});

test('deliverable header exposes a visible create-task action', () => {
  assert.doesNotMatch(css, /\.project-child-list \.r54-deliverable-actions\{display:none!important\}/);
  assert.match(css, /data-r54-add-task/);
});

test('no active generation task is explained as no-task, not foreign read-only', () => {
  assert.match(app, /请先创建生成任务/);
});
