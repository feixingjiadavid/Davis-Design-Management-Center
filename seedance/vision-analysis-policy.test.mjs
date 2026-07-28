import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAllImages, VisionAnalysisError } from './vision-analysis-policy.mjs';

test('analyzes all 10 images with concurrency limited to 3 and preserves order', async () => {
  let active = 0;
  let peak = 0;
  const images = Array.from({ length: 10 }, (_, index) => ({ name: `image-${index + 1}.png` }));
  const results = await analyzeAllImages(images, async image => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    return { vision_context: image.name };
  }, { concurrency: 3, attempts: 3 });

  assert.equal(results.length, 10);
  assert.equal(peak, 3);
  assert.deepEqual(results.map(item => item.vision_context), images.map(item => item.name));
});

test('retries a single image up to its third successful attempt', async () => {
  let calls = 0;
  const [result] = await analyzeAllImages([{ name: 'retry.png' }], async () => {
    calls += 1;
    if (calls < 3) throw new Error('temporary failure');
    return { vision_context: 'ok' };
  }, { attempts: 3 });
  assert.equal(calls, 3);
  assert.equal(result.vision_context, 'ok');
});

test('rejects the whole batch with exact terminal failures instead of returning partial results', async () => {
  await assert.rejects(
    () => analyzeAllImages([{ name: 'bad.png' }, { name: 'ok.png' }], async image => {
      if (image.name === 'bad.png') throw new Error('missing vision_context');
      return { vision_context: 'ok' };
    }, { concurrency: 3, attempts: 3 }),
    error => {
      assert.ok(error instanceof VisionAnalysisError);
      assert.deepEqual(error.failures, [{
        index: 0,
        name: 'bad.png',
        reason: 'missing vision_context',
        attempts: 3,
      }]);
      return true;
    },
  );
});
