import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

test('production runtime injects task-selection helper used by r49SelectDraft', () => {
  const source = read('seedance/app.js');
  assert.match(source, /r50ApplySelectedTaskDom\s*,\s*r49SelectDraft/,
    'r50ApplySelectedTaskDom must be injected before r49SelectDraft uses it');
});

test('selected task review status is explicitly propagated to the top-right business buttons', () => {
  const r54 = read('seedance/r54-deliverables.js');
  const ui = read('seedance/a-ui-category-tools.js');
  assert.match(r54, /davis-video-review-context-changed/,
    'R54 must publish the selected task review context');
  assert.match(ui, /davis-video-review-context-changed/,
    'top-right status buttons must subscribe to the selected task review context');
  assert.match(ui, /syncReviewButtons\(status\)/,
    'the selected task status must directly drive the active top-right button');
});
