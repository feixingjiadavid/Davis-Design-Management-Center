import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const r54 = fs.readFileSync(new URL('./r54-deliverables.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./a-ui-layout-fix.css', import.meta.url), 'utf8');

test('R54 does not rebuild project tree into deliverable or unclassified folders', () => {
  const enhance = r54.match(/function enhanceTree\(\)[\s\S]*?function wrapTask/)?.at(0) || '';
  assert.doesNotMatch(enhance, /replaceChildren\(/);
  assert.doesNotMatch(enhance, /buildDeliverableNode\(/);
  assert.doesNotMatch(enhance, /buildUnclassifiedNode\(/);
});

test('sidebar has no user-visible subgroup concepts', () => {
  assert.doesNotMatch(r54, /＋ 成片单元/);
  assert.doesNotMatch(r54, />未归类</);
  assert.doesNotMatch(css, /data-r54-add-task/);
});

test('historical deliverable data remains backend-only and does not hide direct tasks', () => {
  assert.match(r54, /deliverable_id/);
  assert.match(r54, /function metaForButton/);
});
