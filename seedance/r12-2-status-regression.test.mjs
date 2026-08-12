import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('./a-ui-category-tools.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./a-ui-layout-fix.css', import.meta.url), 'utf8');

test('unmarked/internal review states resolve to backup in the business UI', () => {
  assert.match(ui, /function businessStatus\(value\)/);
  assert.match(ui, /if\(raw==='accepted'\)return 'accepted'/);
  assert.match(ui, /if\(raw==='rejected'\)return 'rejected'/);
  assert.match(ui, /return 'backup'/);
});

test('current task context drives both top buttons and matching sidebar pill', () => {
  assert.match(ui, /davis-video-review-context-changed/);
  assert.match(ui, /syncReviewButtons\(status\)/);
  assert.match(ui, /syncSidebarPill\(localId,status\)/);
});

test('all sidebar pills are normalized without polling', () => {
  assert.match(ui, /function normalizeSidebarPills/);
  assert.match(ui, /MutationObserver/);
  assert.doesNotMatch(ui, /setInterval\(/);
});

test('semantic status colors are distinct', () => {
  assert.match(css, /button\.active\[data-a-review="accepted"\][^{]*\{[^}]*#e8f6ec/s);
  assert.match(css, /button\.active\[data-a-review="backup"\][^{]*\{[^}]*#fff3c7/s);
  assert.match(css, /button\.active\[data-a-review="rejected"\][^{]*\{[^}]*#fde8e8/s);
  assert.match(css, /\.r54-pill\[data-status="backup"\][^{]*\{[^}]*#fff5d6/s);
  assert.match(css, /\.r54-pill\[data-status="rejected"\][^{]*\{[^}]*#fdeaea/s);
});
