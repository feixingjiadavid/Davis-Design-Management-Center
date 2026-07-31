> **已暂停：** 本计划已被 `docs/superpowers/plans/2026-07-31-multi-person-reference-video.md` 取代，不得用于生产实施。

# Temporary Person Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-version-level material-rights confirmation, explicit temporary person reference routing, policy-block diagnostics, callback-first Ark completion, and Google Drive-only final playback without forcing ordinary person photos into Assets.

**Architecture:** Keep temporary_reference_person and real_person_asset_video as separate server-validated modes. Add additive Postgres schema, pure shared routing/policy modules, an authenticated material-rights function, and an authenticated-by-signature Ark callback; make the worker the Drive uploader and low-frequency callback watchdog. The browser prompts once per project version and renders only public status messages.

**Tech Stack:** Static ES modules, Supabase Auth/Postgres/RLS/Edge Functions, Node built-in test runner for pure .mjs modules, Ark contents generation API, Google Drive OAuth API, GitHub Actions.

## Global Constraints

- Do not modify generation prompt text to bypass policy.
- Do not modify, re-encode, crop, compress, watermark, or Base64-resubmit user images.
- Do not change a submitted image between first_frame and reference_image as a retry.
- A temporary_reference_person task makes at most one Ark create request.
- contains_real_person=true never blocks the temporary mode before Ark submission.
- PrivacyInformation maps to provider_policy_blocked, not provider_capability_gap.
- Temporary material-rights confirmation is not official real-person Asset authorization.
- real_person_asset_video only accepts an already-authorized asset:// reference.
- Frontend final video playback reads Google Drive fields only.
- Seedance provider video URLs remain backend history/intermediate data.
- All schema changes are additive and production rollback must not delete audit records.

---

## File Map

**Create**

- `supabase/migrations/20260731090000_seedance_temporary_person_reference.sql`: additive schema, indexes, RLS, constraints, and historical version backfill.
- `supabase/functions/_shared/seedance-generation-router.mjs`: explicit task-mode-to-content mapping.
- `supabase/functions/_shared/seedance-person-policy.mjs`: PrivacyInformation classification, public status, metadata, and outcome transitions.
- `supabase/functions/_shared/seedance-callback-auth.mjs`: HMAC safety identifier and callback signature helpers.
- `supabase/functions/seedance-material-rights/index.ts`: authenticated GET/POST confirmation API.
- `supabase/functions/seedance-callback/index.ts`: provider callback ingestion with custom signature validation.
- `supabase/functions/tests/seedance-generation-router.test.mjs`
- `supabase/functions/tests/seedance-person-policy.test.mjs`
- `supabase/functions/tests/seedance-callback-auth.test.mjs`
- `.github/workflows/seedance-edge-tests.yml`: runs pure Edge helper tests on every relevant push.

**Modify**

- `supabase/functions/seedance-vision-analyze/index.ts`: return structured person/reference analysis only; do not change generation prompts.
- `supabase/functions/seedance-submit/index.ts`: validate rights confirmation, persist explicit mode, add callback_url and safety_identifier.
- `supabase/functions/_shared/seedance-request-shape.mjs`: delegate image role selection to the explicit router; remove single-image role guessing.
- `supabase/functions/_shared/seedance-ark-errors.mjs`: map PrivacyInformation to provider_policy_blocked diagnostics.
- `supabase/functions/seedance-worker/index.ts`: update outcomes, process pending Drive uploads, and poll only stale callback tasks.
- `supabase/functions/_shared/seedance-task-sync.mjs`: persist provider URL history and outcome transitions without exposing provider URL to the browser.
- `supabase/functions/_shared/seedance-drive.mjs`: update policy-event outcome on Drive success/failure.
- `supabase/functions/seedance-status/index.ts`: read database state instead of querying Ark on each browser refresh.
- `seedance/project-version-policy.mjs`: preserve material/prompt/parameter history but clear rights-confirmation state on V-N clone.
- `seedance/app.js`: one-time version confirmation, explicit submit mode/image role, public status copy, Drive-only output rendering.

### Task 1: Add Version, Confirmation, Task Metadata, and Policy Event Schema

**Files:**
- Create: `supabase/migrations/20260731090000_seedance_temporary_person_reference.sql`

**Interfaces:**
- Produces: `video_projects.version_root_id`, `version_number`, `version_source_project_id`; `video_assets.analysis_metadata`; `video_tasks.metadata`; `video_material_rights_confirmations`; `video_provider_policy_events`.
- Consumes: existing Auth user IDs and video project/task/asset IDs.

- [ ] **Step 1: Run pre-migration assertions**

Run through Supabase execute_sql:

~~~sql
select
  to_regclass('public.video_material_rights_confirmations') is null as confirmation_table_missing,
  to_regclass('public.video_provider_policy_events') is null as event_table_missing,
  not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='video_tasks' and column_name='metadata'
  ) as task_metadata_missing;
~~~

Expected: all three values are true.

- [ ] **Step 2: Write the additive migration**

The migration must include these concrete definitions:

~~~sql
alter table public.video_projects
  add column if not exists version_root_id uuid references public.video_projects(id),
  add column if not exists version_number integer not null default 1 check (version_number >= 1),
  add column if not exists version_source_project_id uuid references public.video_projects(id);

alter table public.video_assets
  add column if not exists analysis_metadata jsonb not null default '{}'::jsonb;

alter table public.video_tasks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.video_material_rights_confirmations (
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

create table if not exists public.video_provider_policy_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.video_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'ark'),
  model text not null,
  submit_mode text not null,
  image_role text,
  error_type text,
  request_id text,
  retry_count integer not null default 0 check (retry_count >= 0),
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

Backfill version chains by owner and normalized base name. Existing names ending in ` V-N` retain N; the earliest row in each owner/base-name group becomes version_root_id. Names without a suffix use version 1.

Add indexes on confirmation lookup `(project_version_id, user_id, terms_version, confirmation_type)`, event analytics `(created_at, outcome, submit_mode)`, and event owner lookup `(owner_id, created_at desc)`.

Enable RLS. Confirmation SELECT/INSERT policies require `auth.uid() = user_id` and ownership of project_version_id. Policy-event SELECT allows the owner; writes occur only through service-role Edge Functions.

- [ ] **Step 3: Apply the migration with the Supabase migration tool**

Migration name: `seedance_temporary_person_reference`.

Expected: migration version appears after `20260729080526`.

- [ ] **Step 4: Run post-migration verification**

~~~sql
select
  (select count(*) from public.video_projects where version_root_id is null) as projects_without_root,
  (select count(*) from public.video_material_rights_confirmations) as confirmations,
  (select count(*) from public.video_provider_policy_events) as policy_events;
~~~

Expected: `projects_without_root = 0`; the two new tables may be empty.

- [ ] **Step 5: Commit**

Commit message: `feat: add temporary person reference audit schema`.

### Task 2: Add Explicit Generation Routing and Policy Unit Tests

**Files:**
- Create: `supabase/functions/_shared/seedance-generation-router.mjs`
- Create: `supabase/functions/_shared/seedance-person-policy.mjs`
- Create: `supabase/functions/tests/seedance-generation-router.test.mjs`
- Create: `supabase/functions/tests/seedance-person-policy.test.mjs`
- Modify: `supabase/functions/_shared/seedance-request-shape.mjs`
- Modify: `supabase/functions/_shared/seedance-ark-errors.mjs`
- Create: `.github/workflows/seedance-edge-tests.yml`

**Interfaces:**
- Produces: `buildGenerationContent(input)`, `classifyArkCreateError(payload, status)`, `nextPolicyOutcome(event, signal)`.
- Consumes: explicit `submitMode`, `imageRole`, prompt, signed URLs, asset URI.

- [ ] **Step 1: Write failing routing tests**

Cover these exact cases with Node `node:test`:

~~~js
assert.deepEqual(
  buildGenerationContent({
    submitMode: 'temporary_reference_person',
    imageRole: 'reference_image',
    prompt: 'p',
    imageUrl: 'https://signed/image.png'
  }).content[1].role,
  'reference_image'
);

assert.throws(() => buildGenerationContent({
  submitMode: 'temporary_reference_person',
  imageRole: '',
  prompt: 'p',
  imageUrl: 'https://signed/image.png'
}), /IMAGE_ROLE_REQUIRED/);

assert.equal(
  buildGenerationContent({
    submitMode: 'real_person_asset_video',
    prompt: 'p',
    assetUri: 'asset://asset-1'
  }).content[1].image_url.url,
  'asset://asset-1'
);
~~~

Also assert text-only has no image, first/last has two fixed roles, and single reference never becomes first_frame unless imageRole explicitly says so.

- [ ] **Step 2: Write failing policy tests**

~~~js
const result = classifyArkCreateError({
  error: {
    code: 'InputImageSensitiveContentDetected.PrivacyInformation',
    message: 'blocked',
    request_id: 'req-1'
  }
}, 400);

assert.equal(result.publicStatus, 'provider_policy_blocked');
assert.equal(result.errorType, 'InputImageSensitiveContentDetected.PrivacyInformation');
assert.equal(result.retryable, false);
assert.equal(result.retryCount, 0);
~~~

Assert no retry instruction and outcome transitions:
`submitted -> provider_accepted -> provider_success -> success`,
`submitted -> provider_policy_blocked`,
`provider_success -> drive_sync_failed`.

- [ ] **Step 3: Run tests and verify failure**

Run in GitHub Actions or an ephemeral GitHub checkout:

~~~text
node --test supabase/functions/tests/seedance-generation-router.test.mjs
node --test supabase/functions/tests/seedance-person-policy.test.mjs
~~~

Expected: FAIL because the new modules do not exist.

- [ ] **Step 4: Implement the pure modules**

`buildGenerationContent` must use a switch over exact submit modes and must never infer a role from reference count. `classifyArkCreateError` must return internal diagnostics separately from public copy.

Public copy:

~~~text
当前视频模型对该真人参考图片进行了安全限制。
素材已保存，你可以：
① 更换参考图片重新生成
② 使用真人素材授权模式获得更稳定效果
~~~

- [ ] **Step 5: Run tests and verify pass**

Expected: all routing and policy tests pass.

- [ ] **Step 6: Add GitHub Actions workflow**

Run Node 22 and `node --test supabase/functions/tests/*.test.mjs` on changes under `supabase/functions/**`.

- [ ] **Step 7: Commit**

Commit message: `feat: add explicit Seedance person reference routing`.

### Task 3: Persist Material Analysis Without Altering Generation Inputs

**Files:**
- Modify: `supabase/functions/seedance-vision-analyze/index.ts`
- Modify: `seedance/app.js`

**Interfaces:**
- Produces analysis metadata:
  `{contains_real_person, real_person_count, is_group_photo, is_lifestyle_photo, image_kind, confidence}`.
- Consumes the existing original image URL only for visual analysis; generation continues to use the original stored asset.

- [ ] **Step 1: Add a response-contract test fixture**

Extend the shared policy test to reject malformed analysis values and normalize unknown values to null, not false.

Expected normalized example:

~~~js
{
  contains_real_person: true,
  real_person_count: 3,
  is_group_photo: true,
  is_lifestyle_photo: true,
  image_kind: 'photo',
  confidence: 0.92
}
~~~

- [ ] **Step 2: Run the test and verify failure**

Expected: FAIL because normalization is absent.

- [ ] **Step 3: Update the vision-analysis output schema**

Add the six fields to the analysis-only JSON contract. This changes the Qwen analysis instruction, not the Seedance generation prompt. Do not alter uploaded image bytes or generation prompt content.

- [ ] **Step 4: Persist analysis to video_assets.analysis_metadata**

After a successful analysis, update only the current user's matching video_assets row. On analysis failure, retain the asset and store `{"analysis_status":"unknown"}`; do not block submission.

- [ ] **Step 5: Run contract tests and deploy seedance-vision-analyze**

Expected: two-image analysis returns two independent records; no skipped image; existing visual-description fields remain present.

- [ ] **Step 6: Commit**

Commit message: `feat: record person reference analysis metadata`.

### Task 4: Add Project-Version Rights Confirmation

**Files:**
- Create: `supabase/functions/seedance-material-rights/index.ts`
- Modify: `seedance/project-version-policy.mjs`
- Modify: `seedance/app.js`

**Interfaces:**
- GET consumes `project_version_id`; returns `{confirmed, terms_version, confirmed_at}`.
- POST consumes `{project_id, project_version_id, terms_version, confirmation_type, confirmed:true}`.
- Produces one confirmation row per project version/user/terms/type.

- [ ] **Step 1: Write version-clone tests**

Add a test asserting V-2 copies frames/reference assets, prompt history, and parameter history, but clears:

~~~js
draft.materialRightsConfirmation = null;
draft.materialRightsConfirmedAt = null;
~~~

- [ ] **Step 2: Run the test and verify failure**

Expected: FAIL because confirmation fields are not cleared explicitly.

- [ ] **Step 3: Implement the authenticated Edge Function**

Validate JWT, project ownership, version_root_id/project_id match, and `confirmed === true`. Use the exact statement and `terms_version = '2026-07-31-v1'`. Upsert on the unique confirmation key and never accept confirmation on behalf of another user.

- [ ] **Step 4: Implement the single lightweight frontend confirmation**

Before the first temporary_reference_person submission for a project version:

1. GET confirmation.
2. If absent, show the existing simple confirm dialog with the exact statement.
3. POST confirmation.
4. Continue submission.
5. Cache the positive result for the current project_version_id only.

No confirmation is required for text-only or non-person tasks. V-2/V-3 always use a new project_version_id and therefore prompt again.

- [ ] **Step 5: Verify version semantics**

Test:
- same version prompt edit: no prompt;
- same version parameter edit: no prompt;
- same version retry: no prompt;
- cloned V-2: prompt once;
- V-2 retry: no second prompt.

- [ ] **Step 6: Deploy and commit**

Deploy `seedance-material-rights` with `verify_jwt=true`.

Commit message: `feat: add project version material rights confirmation`.

### Task 5: Submit Once With Diagnostics, Callback, and Safety Identifier

**Files:**
- Create: `supabase/functions/_shared/seedance-callback-auth.mjs`
- Create: `supabase/functions/tests/seedance-callback-auth.test.mjs`
- Modify: `supabase/functions/seedance-submit/index.ts`
- Modify: `supabase/functions/seedance-worker/index.ts`

**Interfaces:**
- Produces `safetyIdentifier(userId, secret)` and `callbackSignature(taskId, secret)`.
- Submit consumes explicit `submit_mode`, `image_role`, and project version confirmation.
- Worker persists provider task ID, metadata, and policy-event outcome.

- [ ] **Step 1: Write failing HMAC tests**

Assert identifiers are stable for the same user, different across users, contain no user UUID, and callback signatures fail closed for modified task IDs.

- [ ] **Step 2: Run tests and verify failure**

Expected: FAIL because helper is absent.

- [ ] **Step 3: Implement HMAC helpers with Web Crypto**

Use HMAC-SHA-256. Encode output as lowercase hex. Require `SEEDANCE_SAFETY_IDENTIFIER_SECRET` and `SEEDANCE_CALLBACK_SECRET`; never fall back to service-role keys.

- [ ] **Step 4: Update submit validation**

For temporary_reference_person:
- require `ENABLE_TEMP_PERSON_REFERENCE === 'true'`;
- require an explicit image_role;
- verify version-level confirmation;
- generate the local task UUID before insert;
- add `callback_url` containing task ID and HMAC signature;
- add anonymous `safety_identifier`;
- set metadata with provider, exact model, submit_mode, image_role, retry_count=0;
- insert one policy event with outcome=submitted and analysis fields.

For real_person_asset_video:
- require a verified provider asset mapping;
- use only asset:// and outcome=asset_required when mapping is absent;
- never enter this mode automatically.

- [ ] **Step 5: Update Worker create handling**

On Ark create success:
- bind provider_task_id;
- update event outcome=provider_accepted.

On PrivacyInformation:
- status=provider_policy_blocked;
- progress=0;
- metadata error_type, request_id, retry_count=0;
- event outcome=provider_policy_blocked;
- no retry queue entry.

On other non-retryable provider errors:
- status=failed;
- event outcome=provider_error.

- [ ] **Step 6: Run all pure tests**

Run: `node --test supabase/functions/tests/*.test.mjs`.

Expected: PASS.

- [ ] **Step 7: Deploy submit and worker with flag initially false**

Smoke-test text-only and non-person routing while temporary person mode is disabled.

- [ ] **Step 8: Commit**

Commit message: `feat: submit temporary person references with audit metadata`.

### Task 6: Make Ark Callback Primary and Drive Sync Asynchronous

**Files:**
- Create: `supabase/functions/seedance-callback/index.ts`
- Modify: `supabase/functions/_shared/seedance-task-sync.mjs`
- Modify: `supabase/functions/_shared/seedance-drive.mjs`
- Modify: `supabase/functions/seedance-worker/index.ts`
- Modify: `supabase/functions/seedance-status/index.ts`

**Interfaces:**
- Callback consumes Ark body plus `task_id` and `sig` query parameters.
- Callback produces idempotent DB state and pending output only.
- Worker consumes pending outputs and stale provider tasks.

- [ ] **Step 1: Write callback idempotency tests around pure normalization**

Test duplicate queued/running/succeeded callbacks, terminal-state monotonicity, and a repeated succeeded callback producing one output by task_id.

- [ ] **Step 2: Implement callback ingestion**

Verify signature before reading task data. Match body provider ID to stored/bound ID when present. Persist the complete provider response, provider video URL history, and task status. Respond 200 after database persistence; do not upload to Drive inside the callback request.

- [ ] **Step 3: Add Worker Drive queue processing**

Scan video_outputs with pending/failed-due storage status. Claim atomically, download the provider URL, upload to Drive, and update:
- success -> event outcome=success;
- permanent/retry-exhausted failure -> event outcome=drive_sync_failed.

Keep provider task polling only for tasks with no callback update beyond the configured stale threshold. Do not poll on each browser refresh.

- [ ] **Step 4: Make seedance-status database-first**

Return task, event, and Drive fields from Supabase. It must not call Ark during ordinary GET/POST status refresh. It may request watchdog processing only through the authenticated worker mechanism, never directly with the user's request.

- [ ] **Step 5: Deploy callback**

Deploy `seedance-callback` with `verify_jwt=false` because Ark cannot present a Supabase user JWT. The function must enforce custom HMAC validation before all mutations.

- [ ] **Step 6: Verify callback replay**

Send the same signed succeeded fixture twice. Expected: one output row, one Drive upload claim, stable task state.

- [ ] **Step 7: Commit**

Commit message: `feat: process Seedance callbacks before Drive sync`.

### Task 7: Update Frontend Status and Drive-Only Output

**Files:**
- Modify: `seedance/app.js`

**Interfaces:**
- Consumes public task status, storage status, google_drive_file_id/url, and confirmation API.
- Produces no provider URL in DOM or playback state.

- [ ] **Step 1: Add status mapping tests or source assertions**

Assert:
- provider_policy_blocked renders the approved Chinese copy;
- internal error_type, request_id, Ark, and model are absent from rendered HTML;
- uploading_drive renders “视频正在同步云端”;
- completed requires Google Drive fields.

- [ ] **Step 2: Implement public status mapping**

Use the approved two-option copy. Preserve the project, original assets, prompt, and parameters so “重新编辑” starts from the same version without deleting history.

- [ ] **Step 3: Remove provider URL fallback**

Output rendering and recovery may use only google_drive_file_id/google_drive_url and the existing authenticated Drive proxy. A provider video URL may appear only in backend metadata.

- [ ] **Step 4: Verify user isolation**

Ordinary users see only owned project versions and confirmations. Superadmins retain read-only visibility of others and cannot submit, confirm, edit, or delete on their behalf.

- [ ] **Step 5: Commit**

Commit message: `fix: show safe person policy status and Drive outputs`.

### Task 8: Production Deployment, Rollback, and Acceptance

**Files:**
- No new source files; deploy the commits above.

**Interfaces:**
- Consumes all previous tasks.
- Produces the enabled production workflow.

- [ ] **Step 1: Record rollback anchors**

Record:
- current GitHub main SHA;
- deployed versions of seedance-submit, worker, status, vision-analyze;
- current frontend build string;
- current ENABLE_TEMP_PERSON_REFERENCE value.

- [ ] **Step 2: Deploy in backward-compatible order**

1. Additive database migration.
2. material-rights and callback functions.
3. vision-analyze.
4. worker and status.
5. submit.
6. frontend.
7. set `ENABLE_TEMP_PERSON_REFERENCE=true`.

- [ ] **Step 3: Execute no-cost validation**

Verify auth failures, confirmation ownership, callback invalid signature, duplicate callback idempotency, status mapping, event insert/update, and Drive-only DOM behavior without creating Ark tasks.

- [ ] **Step 4: Execute controlled live acceptance**

Use owned test material and the minimum supported duration:

1. Text-only task -> provider task ID -> callback -> Drive -> completed.
2. Non-person first-frame task -> first_frame exactly once.
3. Non-person reference task -> reference_image exactly once.
4. Temporary ordinary person photo -> one version confirmation -> one Ark submit.
5. If accepted: callback and Drive success.
6. If PrivacyInformation: provider_policy_blocked, retry_count=0, approved user copy, no second provider task.
7. V-2 clone -> materials/prompt/parameters preserved -> confirmation requested again.
8. Same V-2 retry -> no repeated confirmation.
9. Authorized real_person_asset fixture -> asset:// reference_image.
10. Refresh and separate browser session -> recover only Google Drive video.

- [ ] **Step 5: Verify analytics**

Query counts grouped by `outcome, image_kind, real_person_count, is_group_photo, is_lifestyle_photo, image_role, model`. Ensure every temporary submission has exactly one event and no image content/biometric template is stored.

- [ ] **Step 6: Rollback procedure**

Fast rollback:
1. Set `ENABLE_TEMP_PERSON_REFERENCE=false`.
2. Re-deploy the recorded prior submit/worker/status function versions.
3. Restore the prior frontend GitHub SHA/deployment.
4. Leave additive tables/columns and audit rows intact.

Callback rollback:
- remove callback_url from new submissions by restoring prior submit;
- keep callback function deployed but inert; invalid/unknown task callbacks return 2xx without mutation;
- worker resumes bounded stale-task polling.

Drive rollback:
- restore prior Drive helper/worker;
- do not delete Google Drive files or video_outputs rows.

Schema rollback is intentionally non-destructive: do not drop confirmation/event tables during an incident. A later reviewed migration may remove unused schema only after data retention requirements are satisfied.

- [ ] **Step 7: Final verification report**

Report GitHub commit IDs, migration version, deployed Edge Function versions/builds, live task IDs, provider task IDs, policy outcome, Drive file ID, and whether refresh recovered from Drive.

- [ ] **Step 8: Final commit**

Commit message: `feat: enable temporary person reference workflow`.
