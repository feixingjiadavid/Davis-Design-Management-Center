import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('prompt optimizer has no image cap, skip action, or partial allSettled fallback', async () => {
  const source = await readFile(new URL('./prompt-optimizer.js', import.meta.url), 'utf8');
  assert.match(source, /analyzeAllImages/);
  assert.match(source, /concurrency:\s*3/);
  assert.match(source, /attempts:\s*3/);
  assert.doesNotMatch(source, /MAX_VISION_IMAGES|representativeImages|Promise\.allSettled|ai-prompt-skip-vision|自动跳过/);
  assert.match(source, /图片理解失败，未进入 DeepSeek/);
  assert.match(source, /当前项目的全部图片/);
});

test('video runtime forks a clean V-N project before upload and uses the online r7 base', async () => {
  const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(source, /ORIGINAL_BUILD = '20260728-failed-resubmit-r7'/);
  assert.match(source, /nextProjectVersionName/);
  assert.match(source, /cloneDraftAsVersion/);
  assert.match(source, /pendingVersionFork/);
  assert.match(source, /r6ForkCurrentDraftForSubmit/);
  assert.match(source, /sourceSnapshot/);
  assert.match(source, /state\.draft = fork/);
  assert.match(source, /await uploadNeededFrames\(segmentIds\)/);
});
