# Davis Video Full Vision and Versioned Resubmission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image precision optimization understand every project image before DeepSeek runs, and make an edited resubmission create an independent `V-N` project instead of mutating or blocking the original project.

**Architecture:** Add small, pure policy modules for bounded vision execution and version naming/cloning, cover them with Node tests, then integrate them into the existing browser runtime. The prompt optimizer will process all eligible images with concurrency 3 and up to 3 attempts per image; any terminal failure aborts optimization. The video runtime will mark “re-edit intent”, fork the current draft immediately before submission, clear all remote/task/output bindings on the fork, allocate the next name from both local drafts and the owner's Supabase projects, and let the existing upload/submit path create a fresh remote project.

**Tech Stack:** Browser ES modules, vanilla JavaScript, Node built-in test runner, Supabase JS client, GitHub Pages.

---

## Task 1: Add and test the all-image vision execution policy

**Files:**
- Create: `seedance/vision-analysis-policy.mjs`
- Create: `seedance/vision-analysis-policy.test.mjs`

- [ ] **Step 1: Write failing tests for all-image coverage and bounded concurrency**

Test that 10 inputs all execute, results preserve input order, and the observed active worker count never exceeds 3.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAllImages } from './vision-analysis-policy.mjs';

test('analyzes every image with concurrency 3', async () => {
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run the test against the online-fetched file set:

```powershell
node --test seedance/vision-analysis-policy.test.mjs
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Write failing retry and terminal-failure tests**

Cover:
- an image succeeds on its third attempt;
- the next DeepSeek phase is never invoked by the policy;
- one image failing all three attempts rejects with its exact image name and final reason;
- no result is silently omitted.

- [ ] **Step 4: Implement the minimal policy**

Export `analyzeAllImages(images, analyzeOne, options)` with:
- default concurrency `3`;
- default attempts `3`;
- optional retry delay callback;
- deterministic result order;
- per-image attempt tracking;
- an aggregate terminal error containing `failures: [{ index, name, reason, attempts }]`.

No image cap, skip path, or partial-success return is allowed.

- [ ] **Step 5: Run policy tests and verify they pass**

```powershell
node --test seedance/vision-analysis-policy.test.mjs
```

Expected: PASS for 10-image coverage, concurrency, retry, order, and terminal failure.

## Task 2: Integrate mandatory all-image vision into prompt optimization

**Files:**
- Modify: `seedance/prompt-optimizer.js`
- Modify: `ai-assistant.html`
- Test: `seedance/vision-analysis-policy.test.mjs`

- [ ] **Step 1: Add a regression test for “no skip/no fallback” integration policy**

Add a source-level assertion that the optimizer:
- imports `analyzeAllImages`;
- does not use `MAX_VISION_IMAGES`;
- does not expose a vision skip action;
- does not continue to DeepSeek when any image has a terminal error.

- [ ] **Step 2: Run the regression test and verify it fails**

Expected: FAIL against the current optimizer because it caps representative images at 3 and uses `Promise.allSettled` plus skip/fallback behavior.

- [ ] **Step 3: Replace the capped candidate selection**

Change `visibleImageCandidates()` to return every valid project image in project order. Keep only genuine invalid/empty records out of the list; do not sample or truncate.

- [ ] **Step 4: Make each image analysis retryable and strictly validated**

Wrap the existing `analyzeSingleImage` Edge call through `analyzeAllImages`. A HTTP 200 response without a non-empty `vision_context` is a failed attempt, not success. Retain the 45-second per-attempt timeout and report the server-provided error when available.

- [ ] **Step 5: Remove skip and text-fallback behavior**

The image precision action must:
1. display progress `completed/total`;
2. wait until every image returns a valid context;
3. call DeepSeek only after `completed === total`;
4. on terminal failure, stop, keep the original prompt unchanged, and show exact failed image names/reasons with a retry action.

- [ ] **Step 6: Cache-bust the optimizer module**

Increment the `prompt-optimizer.js` version query in `ai-assistant.html` so production browsers receive the fix.

- [ ] **Step 7: Run all optimizer policy tests**

Expected: PASS with 10 images, no skip, no truncation, and no partial fallback.

## Task 3: Add and test project version naming and clean cloning

**Files:**
- Create: `seedance/project-version-policy.mjs`
- Create: `seedance/project-version-policy.test.mjs`

- [ ] **Step 1: Write failing naming tests**

Cover:
- `冰岛视频` with no prior version → `冰岛视频 V-2`;
- `冰岛视频 V-2` → base `冰岛视频`;
- local `V-2` plus remote `V-3` → `V-4`;
- unrelated project names do not affect the sequence;
- suffix parsing is anchored to the end of the name.

- [ ] **Step 2: Write failing clone-sanitization tests**

Given a completed source draft, assert the fork:
- receives a new local ID and new timestamps;
- keeps mode, ratio, dimensions, fit mode, frames, prompts, segment settings, and reference assets;
- preserves Blob data through structured cloning;
- clears draft/workspace `remoteProjectId`;
- clears frame/reference `remoteAssetId`, `remotePath`, Ark-safe upload bindings;
- clears outputs, output history, jobs, Drive URLs, provider task IDs, remote task IDs, remote segment IDs, output paths, errors, and progress;
- resets segment status to `draft`;
- records `versionSourceDraftId` and `versionNumber`.

- [ ] **Step 3: Run tests and verify they fail**

```powershell
node --test seedance/project-version-policy.test.mjs
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 4: Implement the pure version policy**

Export:
- `parseProjectVersion(name)`;
- `nextProjectVersionName(currentName, existingNames)`;
- `cloneDraftAsVersion(sourceDraft, nextName, idFactory, now)`.

The base project counts as version 1. New versions start at `V-2`.

- [ ] **Step 5: Run policy tests and verify they pass**

Expected: PASS for naming collisions and complete remote/task/output sanitization.

## Task 4: Integrate version forking into re-edit submission

**Files:**
- Modify: `seedance/app.js`
- Modify: `ai-assistant.html`
- Test: `seedance/project-version-policy.test.mjs`

- [ ] **Step 1: Add runtime imports and re-edit intent**

Import the version policy into the production wrapper. Patch `reEditSegment(segmentId)` so it records:
- source draft ID;
- selected segment ID;
- a one-shot `pendingVersionFork` flag.

It should still navigate to the existing editor and must not mutate the source project.

- [ ] **Step 2: Resolve all existing version names**

Immediately before the confirmed submit, collect:
- every local draft name;
- every owner-visible `video_projects.name` from Supabase matching the parsed base name.

If the remote query fails, abort before charging/submitting and explain that version allocation could not be verified. Never guess a potentially colliding version.

- [ ] **Step 3: Fork before upload or Ark submission**

When `pendingVersionFork` is set:
1. compute the next `V-N` name;
2. create the sanitized clone;
3. save it to IndexedDB;
4. insert it into `state.drafts`;
5. switch `state.draft` to the clone and rebind the cloned segment ID;
6. persist and render;
7. continue through existing `ensureRemoteProject → uploadNeededFrames → submitOne`.

The existing source draft remains untouched and selectable.

- [ ] **Step 4: Remove same-project “allowResubmit” mutation**

Update the runtime patch so “重新编辑后提交” no longer clears and reuses bindings in the original draft. Failed tasks with no output may still use the existing explicit retry behavior, but completed/existing projects must fork.

- [ ] **Step 5: Ensure the remote project uses the versioned name**

The fork has no remote project ID, so `ensureRemoteProject()` must insert a new `video_projects` row using `冰岛视频 V-2` (and later versions) before assets/tasks are created.

- [ ] **Step 6: Cache-bust the application runtime**

Increment:
- `PRODUCTION_BUILD` in `seedance/app.js`;
- the `seedance/app.js` query version in `ai-assistant.html`.

- [ ] **Step 7: Run policy and runtime source tests**

Expected: PASS for source preservation, clean fork bindings, `V-N` naming, and patched re-edit integration.

## Task 5: Online verification and deployment

**Files:**
- Verify: `seedance/prompt-optimizer.js`
- Verify: `seedance/app.js`
- Verify: `ai-assistant.html`
- Verify: Supabase `video_projects`, `video_assets`, `video_segments`, `video_tasks`

- [ ] **Step 1: Run the complete automated test set**

```powershell
node --test seedance/vision-analysis-policy.test.mjs seedance/project-version-policy.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 2: Validate the production runtime can be generated**

Fetch the current online `app-v46.js`, execute `patchV46Source` in a Node/browser-compatible harness, and parse the generated module. Expected: no missing patch marker and no syntax error.

- [ ] **Step 3: Commit the implementation atomically**

Commit message:

```
fix: require full image understanding and version edited video projects
```

- [ ] **Step 4: Verify GitHub Pages cache versions**

Fetch the deployed `ai-assistant.html` and confirm both new query versions are present.

- [ ] **Step 5: Browser acceptance test for all-image understanding**

In `https://davis-design.cn/ai-assistant.html`:
1. open a project with 10 images;
2. start image precision optimization;
3. verify progress reaches `10/10`;
4. verify no skip warning appears;
5. verify DeepSeek starts only after image 10 succeeds;
6. force one vision failure and verify optimization stops with the exact image name/reason and the original prompt is unchanged.

- [ ] **Step 6: Browser acceptance test for versioned resubmission**

For `冰岛视频`:
1. open an existing completed project;
2. click `重新编辑`;
3. modify the prompt;
4. submit;
5. verify a separate local project `冰岛视频 V-2` appears;
6. verify Supabase contains a new `video_projects` row named `冰岛视频 V-2`;
7. verify its assets, segments, and tasks reference the new project ID;
8. verify the old project and its Drive-backed video remain unchanged;
9. repeat to verify `冰岛视频 V-3`.

- [ ] **Step 7: Record final evidence**

Report modified GitHub files, commit SHA, automated test output, deployed build identifiers, and the Supabase project/task IDs produced by the acceptance test. Do not claim the live generation/Drive step succeeded unless its database rows and Drive-backed output were actually observed.
