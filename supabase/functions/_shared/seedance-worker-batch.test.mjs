import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from './seedance-worker-batch.mjs';

test('processes a worker batch with bounded concurrency', async () => {
  let active = 0;
  let maxActive = 0;
  const values = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(values, [10, 20, 30, 40, 50]);
  assert.equal(maxActive, 2);
});
