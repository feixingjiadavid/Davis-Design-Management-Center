import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('R54 helpers never intercept native generation button clicks', async () => {
  const paidSafety = await readFile(new URL('./r54-paid-safety.js', import.meta.url), 'utf8');
  const deliverables = await readFile(new URL('./r54-deliverables.js', import.meta.url), 'utf8');

  assert.doesNotMatch(paidSafety, /closest\?\.\('#generate-all,#generate-segment'/);
  assert.doesNotMatch(deliverables, /void guardPaidClick\(event\)/);
});
