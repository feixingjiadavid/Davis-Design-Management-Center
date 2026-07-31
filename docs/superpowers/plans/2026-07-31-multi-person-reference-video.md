# Multi-Person Reference Video Implementation Plan

> This plan supersedes `docs/superpowers/plans/2026-07-31-temporary-person-reference.md`. The superseded plan must not be used for production changes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-person photos the primary one-time Seedance reference workflow, with one project-version rights declaration, one Ark submission, callback-first completion, asynchronous Google Drive sync, and diagnosable provider policy blocks.

**Architecture:** `temporary_reference_person` is the product submit mode. When analysis indicates two or more real people or a group photo, the persisted task type is `multi_person_reference_video`; single-person life photos use `temporary_person_reference_video`. Ark receives the user's explicit `first_frame` or `reference_image` role exactly once. Long-term `real_person_asset_video` remains an advanced boundary and is not implemented or suggested to ordinary users in this release.

**Tech Stack:** Static ES modules, Supabase Auth/Postgres/RLS/Edge Functions, Node 22 built-in test runner for pure .mjs helpers, Ark contents generation API, Google Drive OAuth API, GitHub Actions.

## Global Constraints

- Primary scope: group photos, event photos, travel photos, selfies, and ordinary life photos.
- A material-rights confirmation is the user's declaration of lawful use; it is not per-person identity verification or official Asset authorization.
- Do not create `video_provider_assets` in this release.
- Do not add an Asset-management UI or automatically route any ordinary photo to Asset.
- Do not modify generation prompts, image bytes, encoding, URL, crop, compression, or watermark to bypass policy.
- Do not retry by exchanging `first_frame` and `reference_image`.
- A temporary person task creates at most one Ark task.
- `contains_real_person=true` never blocks the pre-submit path.
- PrivacyInformation maps to `provider_policy_blocked`, preserves the project, and does not fail unrelated segments.
- Final browser playback uses Google Drive fields only; provider URLs are backend history.
- All database changes are additive. Incident rollback never deletes confirmations, diagnostics, outputs, or Drive files.

---

## Release Scope and Deferred Scope

**Implement now**

1. Explicit submit mode, task type, and image-role routing.
2. `multi_person_reference_video` as the group-photo task type.
3. Project-version-level material-rights confirmation.
4. `callback_url` and anonymous `safety_identifier`.
5. Callback-first task updates with bounded stale-task polling fallback.
6. Asynchronous Google Drive synchronization.
7. Per-segment state machine and `provider_policy_blocked`.
8. Multi-person diagnostic and rejection-rate events.
9. User-friendly status that does not mention Ark or Asset authorization.

**Deferred**

- `video_provider_assets`.
- Assets API integration and automatic `asset://` creation.
- A long-term real-person asset-management interface.
- Any mandatory official real-person Asset onboarding.

## File Map

**Create**

- `supabase/migrations/20260731090000_seedance_multi_person_reference.sql`
- `supabase/functions/_shared/seedance-generation-router.mjs`
- `supabase/functions/_shared/seedance-task-state.mjs`
- `supabase/functions/_shared/seedance-callback-auth.mjs`
- `supabase/functions/seedance-material-rights/index.ts`
- `supabase/functions/seedance-callback/index.ts`
- `supabase/functions/tests/seedance-generation-router.test.mjs`
- `supabase/functions/tests/seedance-task-state.test.mjs`
- `supabase/functions/tests/seedance-callback-auth.test.mjs`
- `.github/workflows/seedance-edge-tests.yml`

**Modify**

- `supabase/functions/_shared/seedance-request-shape.mjs`
- `supabase/functions/_shared/seedance-ark-errors.mjs`
- `supabase/functions/_shared/seedance-task-sync.mjs`
- `supabase/functions/_shared/seedance-drive.mjs`
- `supabase/functions/seedance-submit/index.ts`
- `supabase/functions/seedance-worker/index.ts`
- `supabase/functions/seedance-status/index.ts`
- `supabase/functions/seedance-vision-analyze/index.ts`
- `seedance/project-version-policy.mjs`
- `seedance/app.js`

### Task 1: Lock Explicit Multi-Person Routing and State Semantics

**Files:**
- Create: `supabase/functions/_shared/seedance-generation-router.mjs`
- Create: `supabase/functions/_shared/seedance-task-state.mjs`
- Create: `supabase/functions/tests/seedance-generation-router.test.mjs`
- Create: `supabase/functions/tests/seedance-task-state.test.mjs`
- Modify: `supabase/functions/_shared/seedance-request-shape.mjs`
- Modify: `supabase/functions/_shared/seedance-ark-errors.mjs`
- Create: `.github/workflows/seedance-edge-tests.yml`

**Interfaces:**
- Produces `buildGenerationRoute(input)`.
- Produces `classifyArkFailure(payload, httpStatus)`.
- Produces `reduceTaskState(current, signal)`.
- Consumes explicit `submitMode`, `taskType`, `imageRole`, prompt, and media URLs.

- [ ] **Step 1: Write failing route tests**

~~~js
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationRoute } from '../_shared/seedance-generation-router.mjs';

test('group photo remains a temporary reference task', () => {
  const route = buildGenerationRoute({
    submitMode: 'temporary_reference_person',
    taskType: 'multi_person_reference_video',
    imageRole: 'reference_image',
    prompt: '保持多人场景',
    imageUrl: 'https://example.test/group.png',
    realPersonCount: 4,
    isGroupPhoto: true
  });
  assert.equal(route.submitMode, 'temporary_reference_person');
  assert.equal(route.taskType, 'multi_person_reference_video');
  assert.equal(route.content[1].role, 'reference_image');
  assert.equal(route.content[1].image_url.url, 'https://example.test/group.png');
  assert.equal(route.providerCreateLimit, 1);
});

test('first-frame intent is never inferred from image count', () => {
  const route = buildGenerationRoute({
    submitMode: 'temporary_reference_person',
    taskType: 'multi_person_reference_video',
    imageRole: 'first_frame',
    prompt: '保持多人场景',
    imageUrl: 'https://example.test/group.png'
  });
  assert.equal(route.content[1].role, 'first_frame');
});

test('missing role fails before provider submission', () => {
  assert.throws(() => buildGenerationRoute({
    submitMode: 'temporary_reference_person',
    taskType: 'multi_person_reference_video',
    prompt: 'p',
    imageUrl: 'https://example.test/group.png'
  }), /IMAGE_ROLE_REQUIRED/);
});
~~~

Also cover `text_to_video`, `image_first_frame`, `reference_image_video`, and `first_last_frame_video`. Do not add an Asset route test to the release suite.

- [ ] **Step 2: Write failing state tests**

~~~js
test('privacy rejection blocks only the affected segment', () => {
  const next = reduceTaskState(
    { status: 'submitting', progress: 12 },
    {
      type: 'provider_failure',
      code: 'InputImageSensitiveContentDetected.PrivacyInformation',
      requestId: 'req-1'
    }
  );
  assert.equal(next.status, 'provider_policy_blocked');
  assert.equal(next.progress, 0);
  assert.equal(next.retryable, false);
  assert.equal(next.retryCount, 0);
  assert.equal(next.projectTerminal, false);
});
~~~

Add monotonic transitions:
`queued -> generating -> uploading_drive -> completed`,
`generating -> provider_error`,
`uploading_drive -> drive_sync_failed`.
A blocked segment must not change sibling segments.

- [ ] **Step 3: Run tests and verify failure**

Run in GitHub Actions or an ephemeral checkout:

~~~text
node --test supabase/functions/tests/seedance-generation-router.test.mjs
node --test supabase/functions/tests/seedance-task-state.test.mjs
~~~

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement the minimal pure modules**

`buildGenerationRoute` must switch on explicit taskType and validate imageRole. It may use analysis to select `multi_person_reference_video` versus `temporary_person_reference_video`, but analysis must never select Asset or cancel submission.

`classifyArkFailure` must return:

~~~js
{
  status: 'provider_policy_blocked',
  errorType: 'InputImageSensitiveContentDetected.PrivacyInformation',
  requestId: 'req-1',
  retryable: false,
  retryCount: 0,
  publicMessage: '当前视频模型对该真人参考图片进行了安全限制。素材和项目已保存，你可以更换参考图片后重新生成。'
}
~~~

- [ ] **Step 5: Make request-shape delegate to the router**

Remove the current rule that a single image automatically becomes `first_frame`. The shared request-shape file may format output but cannot choose semantic roles.

- [ ] **Step 6: Run all tests and add CI**

Use Node 22 and:

~~~text
node --test supabase/functions/tests/*.test.mjs
~~~

Expected: PASS. CI runs when `supabase/functions/**` changes.

- [ ] **Step 7: Commit**

Commit message: `feat: add explicit multi-person Seedance routing`.

### Task 2: Add Additive Version, Confirmation, Metadata, and Analytics Schema

**Files:**
- Create: `supabase/migrations/20260731090000_seedance_multi_person_reference.sql`

**Interfaces:**
- Produces project-version identity, rights confirmations, task metadata, asset analysis metadata, and one analytics row per temporary task.
- Consumes existing project, asset, task, and Auth user IDs.

- [ ] **Step 1: Verify the schema is absent**

~~~sql
select
  to_regclass('public.video_material_rights_confirmations') is null as confirmation_table_missing,
  to_regclass('public.video_provider_policy_events') is null as event_table_missing,
  not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='video_tasks' and column_name='metadata'
  ) as task_metadata_missing;
~~~

Expected: all true.

- [ ] **Step 2: Write the migration**

Add:

~~~sql
alter table public.video_projects
  add column if not exists version_root_id uuid references public.video_projects(id),
  add column if not exists version_number integer not null default 1 check (version_number >= 1),
  add column if not exists version_source_project_id uuid references public.video_projects(id);

alter table public.video_assets
  add column if not exists analysis_metadata jsonb not null default '{}'::jsonb;

alter table public.video_tasks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table public.video_material_rights_confirmations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  project_version_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  terms_version text not null,
  confirmation_type text not null check (
    confirmation_type = 'temporary_reference_person_material_rights'
  ),
  created_at timestamptz not null default now(),
  unique (project_version_id, user_id, terms_version, confirmation_type)
);

create table public.video_provider_policy_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.video_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'ark'),
  model text not null,
  submit_mode text not null,
  task_type text not null,
  image_role text,
  error_type text,
  request_id text,
  retry_count integer not null default 0,
  outcome text not null check (outcome in (
    'submitted',
    'provider_accepted',
    'provider_success',
    'success',
    'provider_policy_blocked',
    'asset_required',
    'provider_error',
    'drive_sync_failed'
  )),
  image_kind text,
  real_person_count integer,
  is_group_photo boolean,
  is_lifestyle_photo boolean,
  image_width integer,
  image_height integer,
  analysis_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
~~~

`asset_required` remains reserved for a future advanced release and is never assigned to ordinary temporary/multi-person tasks.

Backfill historical versions by owner plus normalized base project name. Preserve existing V-N suffix numbers; use the earliest row in each group as version_root_id.

Enable RLS. Users may SELECT/INSERT only their own confirmation rows for owned project versions. Policy events are owner-readable and service-role writable.

- [ ] **Step 3: Apply and verify**

Expected:
- no project has null version_root_id;
- current tasks continue to read;
- no existing project status changes;
- new tables start empty.

- [ ] **Step 4: Run Supabase security advisors**

Expected: no missing RLS policy or exposed service-only write path for the new tables.

- [ ] **Step 5: Commit**

Commit message: `feat: add multi-person reference audit schema`.

### Task 3: Make Callback and Google Drive the Completion Backbone

**Files:**
- Create: `supabase/functions/_shared/seedance-callback-auth.mjs`
- Create: `supabase/functions/tests/seedance-callback-auth.test.mjs`
- Create: `supabase/functions/seedance-callback/index.ts`
- Modify: `supabase/functions/_shared/seedance-task-sync.mjs`
- Modify: `supabase/functions/_shared/seedance-drive.mjs`
- Modify: `supabase/functions/seedance-worker/index.ts`
- Modify: `supabase/functions/seedance-status/index.ts`

**Interfaces:**
- Produces `callbackSignature(taskId, secret)` and `safetyIdentifier(userId, secret)`.
- Callback consumes Ark body plus signed `task_id`.
- Worker consumes pending outputs and stale callback tasks.
- Status returns database state only.

- [ ] **Step 1: Write failing signature and idempotency tests**

~~~js
assert.equal(
  await callbackSignature('task-1', 'secret'),
  await callbackSignature('task-1', 'secret')
);
assert.notEqual(
  await callbackSignature('task-1', 'secret'),
  await callbackSignature('task-2', 'secret')
);
assert.equal(await verifyCallbackSignature('task-2', sigForTask1, 'secret'), false);
~~~

Add state fixtures proving duplicate `succeeded` callbacks create one output because task_id is unique.

- [ ] **Step 2: Implement Web Crypto HMAC helpers**

Require separate `SEEDANCE_CALLBACK_SECRET` and `SEEDANCE_SAFETY_IDENTIFIER_SECRET`. Never derive either from Supabase service-role credentials.

- [ ] **Step 3: Implement callback ingestion**

The function uses `verify_jwt=false` only because Ark has no Supabase user token. Before any mutation it validates the HMAC query signature. It stores queued/running/succeeded/failed responses idempotently, saves provider video URL history, queues Drive work, and returns 2xx quickly. It never uploads the video within the callback request.

- [ ] **Step 4: Move Drive work to the Worker**

The Worker atomically claims pending outputs, downloads the temporary provider URL, uploads to Google Drive, then sets:
- `uploading_drive` while active;
- `completed` and event `success` when Drive fields exist;
- `drive_sync_failed` when retry policy is exhausted.

- [ ] **Step 5: Restrict Ark polling**

Poll only tasks whose callback state is stale beyond the configured watchdog interval. Browser status refresh must not call Ark.

- [ ] **Step 6: Make status database-first**

Return provider task ID, public task status, progress, storage status, Drive IDs/URLs, and public message. Never return provider video URL, raw provider response, request ID, or model diagnostics to the browser.

- [ ] **Step 7: Run tests and commit**

Expected: signature tests, duplicate callback tests, state tests, and existing Drive tests pass.

Commit message: `feat: make Seedance callback and Drive sync asynchronous`.

### Task 4: Add Project-Version Rights Confirmation and Multi-Person Analysis

**Files:**
- Create: `supabase/functions/seedance-material-rights/index.ts`
- Modify: `supabase/functions/seedance-vision-analyze/index.ts`
- Modify: `seedance/project-version-policy.mjs`
- Modify: `seedance/app.js`

**Interfaces:**
- GET confirmation: `project_version_id -> {confirmed, confirmed_at, terms_version}`.
- POST confirmation: exact project root/version/user binding.
- Analysis produces non-biometric classification metadata only.

- [ ] **Step 1: Write version-copy tests**

V-2/V-3 copies:
- original material references;
- prompt history;
- parameter history.

It clears:

~~~js
draft.materialRightsConfirmation = null;
draft.materialRightsConfirmedAt = null;
~~~

Expected: same-version edits/retries retain confirmation; a cloned version does not.

- [ ] **Step 2: Implement material-rights function**

Use this exact statement and `terms_version='2026-07-31-v1'`:

~~~text
我确认已获得该图片/视频素材的合法使用权，并承担由此产生的责任。
~~~

Validate JWT, user ownership, project_id equals the version's version_root_id, and project_version_id equals the current project row. Upsert only the current user's record.

This statement is a user declaration. Do not represent it as consent or identity verification from every person shown.

- [ ] **Step 3: Extend analysis output**

Persist:
- `contains_real_person`;
- `real_person_count`;
- `is_group_photo`;
- `is_lifestyle_photo`;
- `image_kind`;
- `confidence`;
- width and height from the original asset.

Do not store face embeddings, landmarks, identity names, or biometric templates. If analysis is unavailable, keep the asset and mark analysis_status=unknown.

- [ ] **Step 4: Select the task type without blocking**

When `real_person_count >= 2` or `is_group_photo=true`:
- submit_mode=`temporary_reference_person`;
- task_type=`multi_person_reference_video`.

When one real person is detected:
- submit_mode=`temporary_reference_person`;
- task_type=`temporary_person_reference_video`.

Analysis selects diagnostics/task type only; it never sends the task to Asset.

- [ ] **Step 5: Add the one-time lightweight confirmation**

On the first temporary person submit for a project_version_id, use the existing simple confirm dialog. After confirmation POST succeeds, continue. Cache only the positive confirmation for that project_version_id.

- [ ] **Step 6: Deploy and commit**

Deploy `seedance-material-rights` with `verify_jwt=true`.

Commit message: `feat: confirm rights for multi-person project versions`.

### Task 5: Submit Multi-Person References Once and Record Diagnostics

**Files:**
- Modify: `supabase/functions/seedance-submit/index.ts`
- Modify: `supabase/functions/seedance-worker/index.ts`

**Interfaces:**
- Submit consumes explicit submit_mode/task_type/image_role and a confirmed project version.
- Produces one local task, at most one Ark task, one analytics event, and one provider task ID if accepted.

- [ ] **Step 1: Add submit-policy tests**

Assert:
- temporary modes require version confirmation;
- `ENABLE_TEMP_PERSON_REFERENCE=false` returns feature-disabled without creating a task;
- multi-person analysis does not produce asset_required;
- Ark create attempts equal one;
- request payload includes callback_url and safety_identifier;
- image role is unchanged.

- [ ] **Step 2: Update submit**

For temporary person modes:
1. validate the version confirmation;
2. create local task UUID before Ark submission;
3. persist metadata with provider, exact model, submit_mode, task_type, image_role, retry_count=0;
4. insert one event with outcome=submitted and image diagnostics;
5. add signed callback_url and anonymous safety_identifier;
6. queue exactly one Ark create request.

Do not add `video_provider_assets`, Asset lookups, or automatic `asset://` conversion.

- [ ] **Step 3: Update Worker create outcomes**

On create success:
- persist provider_task_id;
- outcome=provider_accepted.

On PrivacyInformation:
- status=provider_policy_blocked;
- outcome=provider_policy_blocked;
- metadata error_type, provider request ID, submit mode, task type, image role, retry_count=0;
- no new Ark create attempt;
- sibling segments continue.

On another non-retryable response:
- status=provider_error;
- outcome=provider_error.

- [ ] **Step 4: Enable controlled experiment flag**

Deploy with `ENABLE_TEMP_PERSON_REFERENCE=false`, run no-cost validation, then set it to `true` only after callback, status, and confirmation checks pass.

- [ ] **Step 5: Commit**

Commit message: `feat: submit multi-person references without Asset routing`.

### Task 6: Update Frontend Status Without Asset Guidance

**Files:**
- Modify: `seedance/app.js`

**Interfaces:**
- Consumes public status/Drive fields and confirmation API.
- Produces no provider diagnostics or provider URL in browser state.

- [ ] **Step 1: Add source-level rendering assertions**

Assert `provider_policy_blocked` displays:

~~~text
当前视频模型对该真人参考图片进行了安全限制。
素材和项目已保存，你可以更换参考图片后重新生成。
~~~

Assert rendered HTML contains none of:
- Ark;
- PrivacyInformation;
- request_id;
- asset://;
- “真人认证”;
- provider temporary video URL.

- [ ] **Step 2: Implement segment-local blocked state**

A blocked segment remains editable and retryable by the user after changing the reference image. Other segments and project navigation remain usable. Do not mark the whole project permanently failed because one segment is blocked.

- [ ] **Step 3: Keep output Drive-only**

Only `google_drive_file_id`, `google_drive_url`, and the authenticated Drive proxy may create a playable video element. During sync display “视频正在同步云端”.

- [ ] **Step 4: Verify version confirmation behavior**

Test:
- V-1 first person submit: one confirmation;
- V-1 prompt/parameter edit or failed retry: no repeat;
- V-2 clone: materials/prompt/parameters copied, confirmation requested again;
- V-2 later retry: no repeat.

- [ ] **Step 5: Commit**

Commit message: `fix: keep multi-person policy blocks editable`.

### Task 7: Production Deployment, Rollback, and Acceptance

**Files:**
- No new files; deploy Tasks 1-6.

**Interfaces:**
- Produces the enabled production release with recorded rollback anchors.

- [ ] **Step 1: Record rollback anchors**

Record main SHA, deployed versions/builds for submit/worker/status/vision-analyze, frontend build, worker cron schedule, and current experiment-flag value.

- [ ] **Step 2: Deploy in this order**

1. Additive migration.
2. Pure helper tests and CI.
3. callback and material-rights functions.
4. worker, task-sync, Drive helper, and database-first status.
5. vision analysis.
6. submit with flag false.
7. frontend.
8. no-cost smoke tests.
9. set `ENABLE_TEMP_PERSON_REFERENCE=true`.

- [ ] **Step 3: No-cost validation**

Verify:
- invalid callback signatures mutate nothing;
- duplicate callback fixtures remain idempotent;
- another user cannot confirm a project version;
- same version confirmation lookup succeeds;
- task router never selects Asset;
- status responses never expose provider URL/diagnostics;
- Drive queue claim is atomic.

- [ ] **Step 4: Controlled live acceptance**

Using lawfully owned test materials and minimum duration:

1. Text-only task completes through callback and Drive.
2. Non-person reference keeps its explicit role.
3. Two-person or group event photo creates `multi_person_reference_video`.
4. The group-photo version requests one rights declaration.
5. Exactly one Ark create attempt occurs.
6. If accepted: provider task ID -> callback -> Drive file -> completed.
7. If PrivacyInformation: provider_policy_blocked, retry_count=0, no Asset outcome, no second provider task, sibling segments continue.
8. Same-version retry does not re-confirm.
9. V-2 copies references/prompt/parameters but requires confirmation again.
10. Refresh and another browser session recover the video only from Google Drive.

- [ ] **Step 5: Verify investigation statistics**

Group by outcome, task_type, image_kind, real_person_count, is_group_photo, is_lifestyle_photo, image_role, model, and date. Every temporary task has one event. No image payload, face identity, or biometric template appears in the event table.

- [ ] **Step 6: Roll back safely if needed**

Fast rollback:
1. set `ENABLE_TEMP_PERSON_REFERENCE=false`;
2. restore prior submit/worker/status versions;
3. restore prior frontend SHA;
4. leave additive schema and audit rows intact;
5. do not delete Drive files or outputs.

Callback rollback removes callback_url from new submissions by restoring submit, while the old Worker resumes bounded stale polling. The callback remains deployed but rejects invalid/unknown tasks without mutation.

- [ ] **Step 7: Final report**

Report GitHub commits, migration version, deployed Edge Function versions, live local/provider task IDs, callback result, final outcome, Drive file ID, and refresh recovery result.

- [ ] **Step 8: Final commit**

Commit message: `feat: enable multi-person reference video workflow`.
