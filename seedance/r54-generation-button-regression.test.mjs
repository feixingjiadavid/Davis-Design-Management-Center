import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('only the deliverables module intercepts paid generation clicks', async () => {
  const paidSafety = await readFile(new URL('./r54-paid-safety.js', import.meta.url), 'utf8');
  const deliverables = await readFile(new URL('./r54-deliverables.js', import.meta.url), 'utf8');

  assert.doesNotMatch(paidSafety, /closest\?\.\('#generate-all,#generate-segment'/);
  assert.match(deliverables, /hasExistingGenerationRecord/);
  assert.match(deliverables, /当前生成任务尚未加载完成/);
});
