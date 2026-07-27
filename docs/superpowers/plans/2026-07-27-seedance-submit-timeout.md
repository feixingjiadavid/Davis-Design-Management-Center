# Seedance Submit Timeout Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every Seedance submission reaches either a provider-bound task or a persisted failure.

**Architecture:** A tested pure policy module defines the single-attempt submit timeout and stale-unbound cutoff. `seedance-submit` uses the timeout policy, while `seedance-worker` converts stale unbound tasks to failures through the existing atomic sync RPC.

**Tech Stack:** Supabase Edge Functions, Postgres RPC, Node test runner.

## Global Constraints

- Do not modify frontend files.
- Do not add or redesign database tables.
- Require and deduplicate `client_submit_nonce` before Ark submission.\n- Make one Ark create request with a 45-second timeout.
- Fail active tasks without a provider ID after ten minutes.

---

### Task 1: Timeout policy

**Files:**
- Create: `supabase/functions/_shared/seedance-submit-policy.mjs`
- Test: `supabase/functions/_shared/seedance-submit-policy.test.mjs`

**Interfaces:**
- Produces `ARK_CREATE_TIMEOUT_MS`, `STALE_UNBOUND_AFTER_MS`, `isStaleUnboundTask(task, nowMs)`, and `staleUnboundFailurePayload()`.

- [ ] Write tests asserting a 45-second timeout, a ten-minute cutoff, and exclusion of provider-bound or terminal tasks.
- [ ] Run the focused test and confirm it fails because the module is missing.
- [ ] Implement the minimal pure policy module.
- [ ] Run the focused and full shared-module tests.

### Task 2: Edge Function integration

**Files:**
- Create: `supabase/functions/seedance-submit/index.ts`
- Modify: `supabase/functions/seedance-worker/index.ts`

**Interfaces:**
- `seedance-submit` consumes `ARK_CREATE_TIMEOUT_MS`, persists `client_submit_nonce`, and returns existing tasks on replay.
- `seedance-worker` scans stale unbound tasks and calls `syncTaskFromArk` with the failure payload before normal Ark polling.

- [ ] Add a partial unique index for `(owner_id, request_payload->>'client_submit_nonce')`.\n- [ ] Return the existing task on sequential or concurrent nonce replay.\n- [ ] Replace the retry loop with one bounded request.
- [ ] Add the stale-unbound Worker scan with the existing concurrency and atomic adapter.
- [ ] Run syntax and unit tests.

### Task 3: Online rollout

**Files:**
- Deploy: `seedance-submit`
- Deploy: `seedance-worker`

- [ ] Deploy both functions with their existing custom authentication settings.
- [ ] Invoke the Worker and verify the three legacy unbound tasks become failed with an error message.
- [ ] Verify Cron, Edge logs, the original provider task, and output idempotency.
- [ ] Commit and push backend changes to GitHub main.
