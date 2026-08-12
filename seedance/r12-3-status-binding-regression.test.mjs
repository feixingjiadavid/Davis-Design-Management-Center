import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('./a-ui-category-tools.js', import.meta.url), 'utf8');
const r54 = readFileSync(new URL('./r54-deliverables.js', import.meta.url), 'utf8');

test('top status buttons send exact local task id directly to R54', () => {
  assert.match(ui, /davis-video-review-status-requested/);
  assert.match(ui, /detail:\{localId,status:next\}/);
  assert.doesNotMatch(ui, /select\.dispatchEvent\(new Event\('change'/);
});

test('R54 accepts exact task status request and persists that local task', () => {
  assert.match(r54, /davis-video-review-status-requested/);
  assert.match(r54, /setReview\(localId,status\)/);
  assert.match(r54, /davis-video-review-status-changed/);
});

test('task selection uses event draftId for review context instead of guessing active DOM', () => {
  assert.match(r54, /renderContext\(event\.detail\?\.draftId/);
  assert.match(r54, /function renderContext\(localIdOverride=''/);
});
