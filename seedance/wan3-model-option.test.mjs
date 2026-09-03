import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../ai-assistant.html', import.meta.url), 'utf8');
const submitSource = await readFile(new URL('../supabase/functions/seedance-submit/index.ts', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../supabase/functions/seedance-worker/index.ts', import.meta.url), 'utf8');

test('frontend exposes Wan 3.0 without removing existing Seedance models', () => {
  assert.match(appSource, /wan30:\s*\{/);
  assert.match(appSource, /label:\s*['"]Wan 3\.0['"]/);
  assert.match(appSource, /minDuration:\s*2,\s*maxDuration:\s*30/);
  assert.match(appSource, /resolutions:\s*\[['"]480p['"],['"]720p['"],['"]1080p['"]\]/);
  assert.match(appSource, /value:\s*['"]wan30['"]/);
  for (const alias of ['v25', 'v20', 'fast', 'mini', 'v15']) {
    assert.match(appSource, new RegExp(`value:\\s*['"]${alias}['"]`));
  }
  assert.match(htmlSource, /<option value="wan30">Wan 3\.0/);
});

test('submit and worker route Wan through DashScope while preserving Ark', () => {
  assert.match(submitSource, /modelAlias === ['"]wan30['"] \? ['"]dashscope['"] : ['"]ark['"]/);
  assert.match(submitSource, /wan_payload/);
  assert.match(submitSource, /WAN3_DURATION_LIMIT_EXCEEDED/);
  assert.match(submitSource, /ark_payload/);
  assert.match(workerSource, /processQueuedWanSubmission/);
  assert.match(workerSource, /queryWan3Task/);
  assert.match(workerSource, /processQueuedArkSubmission/);
  assert.doesNotMatch(workerSource, /!dashscopeKey\s*\|\|\s*!workspaceId/);
  assert.match(workerSource, /DASHSCOPE_API_KEY["']\)\s*\|\|\s*Deno\.env\.get\(["']QWEN_API_KEY/);
});
