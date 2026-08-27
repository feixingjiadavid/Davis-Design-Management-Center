import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

test('reference images are vision-analyzed before the submit payload is built', () => {
  assert.match(runtimeSource, /async function r55AnalyzeReferenceAssetsBeforeSubmit/);
  assert.match(runtimeSource, /'seedance-vision-analyze'/);
  assert.match(runtimeSource, /asset_id:\s*ref\.remoteAssetId/);
  assert.match(runtimeSource, /await r55AnalyzeReferenceAssetsBeforeSubmit\(textReferenceAssets\)/);
  assert.match(runtimeSource, /contains_real_person:\s*analysis\?\.contains_real_person/);
  assert.match(runtimeSource, /real_person_count:\s*Math\.max\(0, Number\(analysis\?\.real_person_count/);
  assert.match(runtimeSource, /multi_person_detected:\s*analysis\?\.multi_person_detected/);
});
