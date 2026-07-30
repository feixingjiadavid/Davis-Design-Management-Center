# Seedance Person Asset Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route authorized real-person references through Volcengine Asset IDs and represent missing authorization as a recoverable state.

**Architecture:** A pure request-routing module resolves ordinary URLs versus active `asset://` references. `seedance-submit` stores provider-asset metadata, while `seedance-worker` converts Ark privacy rejection into `asset_auth_required` without a second URL retry. The frontend maps that state to a stable user message.

**Tech Stack:** Supabase Postgres/RLS, Supabase Edge Functions (Deno/TypeScript), JavaScript frontend, Node test runner.

## Global Constraints

- Do not modify generation prompts.
- Keep `doubao-seedance-2-0-mini-260615`.
- Do not add Jimeng API.
- Preserve ordinary non-person image URL flow.
- Never log provider keys or raw signed URLs.

---

### Task 1: Provider asset routing policy

**Files:**
- Create: `supabase/functions/_shared/seedance-person-assets.mjs`
- Modify: `supabase/functions/_shared/seedance-request-shape.mjs`
- Test: `tests/seedance-person-assets.test.mjs`

**Interfaces:**
- Produces: `resolveReferenceInput({ signedUrl, providerAsset })`
- Returns: `{ url, role, submissionMethod, authorizationStatus }`

- [ ] Write a failing test asserting an active provider asset returns `asset://asset-123`, `reference_image`, and `ark_asset_id`.
- [ ] Write a failing test asserting a missing provider asset preserves the signed URL.
- [ ] Run `node --test tests/seedance-person-assets.test.mjs`; expect both new assertions to fail because the module does not exist.
- [ ] Implement input validation: accept only `authorization_status === "active"` and `asset_id` matching `/^asset-[a-zA-Z0-9_-]+$/`; otherwise return the ordinary signed URL.
- [ ] Run the test file; expect PASS.
- [ ] Commit with `feat: route authorized person references through Ark assets`.

### Task 2: Persist provider asset mappings securely

**Files:**
- Create: `supabase/migrations/20260730_create_video_provider_assets.sql`
- Test: SQL verification query embedded in migration comments and executed online.

**Interfaces:**
- Produces table `public.video_provider_assets` keyed by `(owner_id, video_asset_id, provider)`.

- [ ] Execute a failing catalog query proving `video_provider_assets` does not exist.
- [ ] Create the table, status check constraint, unique key, timestamps, and owner/video asset foreign keys.
- [ ] Enable RLS.
- [ ] Add owner SELECT policy using `(select auth.uid()) = owner_id`; do not grant client INSERT/UPDATE/DELETE.
- [ ] Query `pg_class`, `pg_policies`, and constraints; expect table, RLS, owner SELECT policy, and unique key.
- [ ] Commit with `feat: store Ark person asset mappings`.

### Task 3: Submit authorized references

**Files:**
- Modify: `supabase/functions/seedance-submit/index.ts`
- Modify: `supabase/functions/_shared/seedance-request-shape.mjs`
- Test: `tests/seedance-request-shape.test.mjs`

**Interfaces:**
- Consumes `resolveReferenceInput`.
- Produces request metadata fields `provider_asset_id`, `provider_asset_group_id`, and `image_submission_method`.

- [ ] Add a failing request-shape test where a reference with an active mapping produces `asset://...` and never includes the Supabase URL.
- [ ] Run the test and verify RED.
- [ ] Load provider mappings for all referenced `video_assets` with owner scoping.
- [ ] Build content from the resolved input and redact `asset://` to a non-sensitive stable identifier in logs.
- [ ] Run request-shape tests and verify GREEN.
- [ ] Deploy `seedance-submit` and verify its build marker.
- [ ] Commit with `feat: submit authorized person assets to Seedance`.

### Task 4: Recoverable real-person authorization state

**Files:**
- Modify: `supabase/functions/seedance-worker/index.ts`
- Modify: `supabase/functions/_shared/seedance-ark-errors.mjs`
- Modify: `supabase/functions/_shared/seedance-request-shape.mjs`
- Test: `tests/seedance-ark-errors.test.mjs`

**Interfaces:**
- Produces normalized status `asset_auth_required` with public message and provider diagnostics.

- [ ] Add a failing test asserting `InputImageSensitiveContentDetected.PrivacyInformation` normalizes to `asset_auth_required`, `retryable:false`, and the approved Chinese message.
- [ ] Add a failing test asserting no compatibility payload is produced for the privacy error.
- [ ] Run tests and verify RED.
- [ ] Remove the `first_frame -> reference_image` privacy retry.
- [ ] Update task and segment status to `asset_auth_required`, progress 0; retain provider code, request id, and reference number only.
- [ ] Run tests and verify GREEN.
- [ ] Deploy `seedance-worker`, trigger one bounded worker run, and verify the build marker.
- [ ] Commit with `fix: require authorized Ark assets for real-person references`.

### Task 5: Frontend status mapping

**Files:**
- Modify: `seedance/app.js`
- Test: `tests/seedance-runtime-patch.test.mjs`

**Interfaces:**
- Consumes task final status `asset_auth_required`.
- Produces text `检测到真人参考素材，需要完成真人素材认证后才能生成。`

- [ ] Add a failing runtime test asserting the status and exact copy exist and raw `Ark create rejected` is not rendered for this state.
- [ ] Run the test and verify RED.
- [ ] Map the status independently from `provider_failed`; keep retry/edit actions available.
- [ ] Run runtime tests and verify GREEN.
- [ ] Update the production build marker and commit with `fix: show recoverable person authorization state`.

### Task 6: Assets API capability probe and online verification

**Files:**
- Create: `supabase/functions/_shared/seedance-assets-capability.mjs`
- Modify: `supabase/functions/seedance-worker/index.ts`
- Test: `tests/seedance-assets-capability.test.mjs`

**Interfaces:**
- Produces redacted capability result `{ seedanceMini, assetsApi, realPersonAssetGroup, code, requestId }`.

- [ ] Add failing tests for authorized, forbidden, and missing-credential capability responses.
- [ ] Run tests and verify RED.
- [ ] Implement a worker-secret-protected probe using configured Ark/Volcengine credentials; never include secret values or full provider response.
- [ ] Run tests and verify GREEN.
- [ ] Invoke the online probe and record the exact missing capability.
- [ ] Re-submit the earlier failed portrait task only if an active Asset ID is available; otherwise verify it stops at `asset_auth_required` without an Ark raw error.
- [ ] Verify an ordinary non-person task still reaches Ark and that completed output continues to Google Drive.
- [ ] Commit with `test: verify Seedance person asset capability`.
