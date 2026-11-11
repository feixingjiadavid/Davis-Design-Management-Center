import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { patchV46Source } from './app.js';

const runtimeSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const submitSource = await readFile(new URL('../supabase/functions/seedance-submit/index.ts', import.meta.url), 'utf8');

test('Seedance 2.5 is available with the official Ark model capabilities', () => {
  assert.match(runtimeSource, /v25:\s*\{/);
  assert.match(runtimeSource, /label:\s*'Seedance 2\.5'/);
  assert.match(runtimeSource, /maxDuration:\s*30/);
  assert.match(runtimeSource, /resolutions:\s*\['480p','720p','1080p'\]/);
  assert.match(runtimeSource, /pricing:\s*\{\s*noVideo:\s*70,\s*withVideo:\s*42\s*\}/);
  assert.match(runtimeSource, /\{ value:'v25', label:'Seedance 2\.5/);
  assert.match(submitSource, /fallback:\s*"doubao-seedance-2-5-260628"/);
  assert.match(submitSource, /return "v25"/);
  assert.match(submitSource, /maxDuration:\s*30/);
});

const patchedRuntime = patchV46Source(
  (await readFile(new URL('./app-v46.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'),
  {
    supabaseUrl: 'https://example.test/supabase-config.js',
    dbUrl: 'https://example.test/db.js',
    projectVersionUrl: 'https://example.test/project-version-policy.mjs',
    accessControlSource: await readFile(new URL('./access-control.mjs', import.meta.url), 'utf8'),
  },
);
const submitStart = patchedRuntime.indexOf('async function r21ConfirmMaterialRights(');
const submitEnd = patchedRuntime.indexOf('\nfunction resetSegmentForNewSubmit(', submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart, 'locate the actual patched submission functions');
const submitCode = patchedRuntime.slice(submitStart, submitEnd);

// Only external storage/database/Edge boundaries are simulated. The patched
// production submitOne and its pre-submit helpers execute unchanged.
function submissionHarness(model, { invalidReference = false, mode = 'text_only' } = {}) {
  const calls = [];
  const reference = { remoteAssetId: 'image-1', remotePath: 'images/one.png', type: 'image/png', name: 'one.png' };
  const segment = { id: 'segment-1', index: 0, model, prompt: '@图片1 两人拥抱', duration: 4, resolution: '720p', fromFrameId: 'first', toFrameId: 'last' };
  const context = {
    state: {
      user: { id: 'owner-1' }, referenceAssets: [reference],
      draft: { remoteProjectId: 'project-1', mode, ratio: '16:9', fitMode: 'contain', finalWidth: 1280, finalHeight: 720,
        frames: [{ id: 'first', remoteAssetId: 'first-asset' }, { id: 'last', remoteAssetId: 'last-asset' }] },
    },
    // A previous optimizer run must not inject stale person diagnostics.
    __davisVisionDiagnostics: [{ contains_real_person: true, real_person_count: 9, multi_person_detected: true }],
    TIMEOUTS: { database: 1000 },
    r16AssertCurrentProjectWritable: () => true,
    commitTextReferenceAssets: () => [reference],
    validatePromptReferenceTokens: () => { if (invalidReference) throw new Error('invalid reference token'); },
    referenceToken: () => '@图片1',
    buildStrictFrameLockPrompt: item => item.prompt,
    withTimeout: operation => operation,
    errorMessage: error => error?.message || String(error),
    renderJobs() {}, persist: async () => {},
    isRetryableSubmitError: () => false,
    supabase: {
      from(table) {
        if (table === 'video_assets') return { select: () => ({ in: async () => ({ data: [{ id: 'image-1', object_path: 'images/one.png' }] }) }) };
        assert.equal(table, 'video_segments');
        return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'remote-segment-1' } }) }) }) };
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/one.png' } }) }) },
      functions: { invoke: async name => { calls.push({ name }); return { error: new Error('vision service offline') }; } },
    },
    invokeEdgeFunction: async (name, body) => { calls.push({ name, body }); return { task_id: 'task-1', status: 'queued' }; },
  };
  vm.createContext(context);
  vm.runInContext(submitCode, context, { filename: 'production-submit.js' });
  return { run: () => context.submitOne(segment), calls, segment };
}

for (const model of ['wan30', 'wan30prime', 'v25']) {
  test(`${model} submits reference images when the vision service is unavailable`, async () => {
    const harness = submissionHarness(model);
    const result = await harness.run();
    assert.equal(result.remoteTaskId, 'task-1');
    assert.equal(result.status, 'queued');
    assert.deepEqual(harness.calls.map(call => call.name), ['seedance-submit']);
    const payload = harness.calls[0].body;
    assert.equal(payload.model_alias, model);
    assert.deepEqual(Array.from(payload.reference_asset_ids), ['image-1']);
    assert.equal(payload.reference_directions[0].asset_id, 'image-1');
    for (const field of ['contains_real_person', 'real_person_count', 'multi_person_detected']) {
      assert.equal(Object.hasOwn(payload, field), false, `omit stale ${field}`);
    }
  });
}

test('reference token validation still rejects invalid bindings before submitting', async () => {
  const harness = submissionHarness('wan30', { invalidReference: true });
  await assert.rejects(harness.run, /invalid reference token/);
  assert.deepEqual(harness.calls, []);
});

test('first/last-frame submissions preserve both frame assets', async () => {
  const harness = submissionHarness('wan30', { mode: 'first_last' });
  await harness.run();
  assert.deepEqual(harness.calls.map(call => call.name), ['seedance-submit']);
  assert.deepEqual(Array.from(harness.calls[0].body.asset_ids), ['first-asset', 'last-asset']);
  assert.equal(harness.calls[0].body.submit_mode, 'first_last_frame_video');
});
