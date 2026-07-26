# Seedance Status Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the Ark/Seedance task lifecycle from submission through terminal database state and video output persistence.

**Architecture:** A dependency-free shared module normalizes Ark responses. Both the authenticated status endpoint and a service-role-only cron worker use it, while existing tables remain unchanged.

**Tech Stack:** Supabase Edge Functions, Supabase Postgres/pg_cron/pg_net/Vault, Node test runner.

## Global Constraints

- Do not modify frontend UI files.
- Preserve the existing database structure.
- Map queued, processing, running, succeeded, completed, failed, rejected, cancelled, and content_policy.
- Persist failure details and successful video outputs.

---

### Task 1: Status response contract

**Files:**
- Create: supabase/functions/_shared/seedance-status-core.mjs
- Test: supabase/functions/_shared/seedance-status-core.test.mjs

**Interfaces:**
- Produces: normalizeArkResult(payload, oldProgress), returning normalized status, progress, error message, and video URL.

- [ ] Write table-driven failing tests for all required statuses and moderation text.
- [ ] Run node --test supabase/functions/_shared/seedance-status-core.test.mjs and confirm missing-module failure.
- [ ] Implement the minimal pure module.
- [ ] Re-run the test and confirm PASS.

### Task 2: Persistence and output contract

**Files:**
- Create: supabase/functions/_shared/seedance-task-sync.mjs
- Test: supabase/functions/_shared/seedance-task-sync.test.mjs

**Interfaces:**
- Consumes: normalized Ark result and an injected database adapter.
- Produces: syncTaskFromArk(task, arkPayload, adapter).

- [ ] Write failing tests that assert failed tasks store error_message and successful tasks create one output containing the provider URL.
- [ ] Run the focused test and confirm RED.
- [ ] Implement minimal task/segment/output persistence.
- [ ] Re-run and confirm PASS.

### Task 3: Edge endpoints and scheduler

**Files:**
- Create/Modify: supabase/functions/seedance-status/index.ts
- Create: supabase/functions/seedance-worker/index.ts
- Modify: supabase/config.toml
- Create: supabase/migrations/20260727000000_seedance_worker_cron.sql

**Interfaces:**
- Status endpoint polls one owned task.
- Worker scans active tasks, accepts service-role authorization only, and limits each batch.

- [ ] Wire both endpoints to the tested shared modules.
- [ ] Add service-role-only worker authorization and bounded concurrency.
- [ ] Add idempotent cron migration using Vault + pg_net.
- [ ] Run syntax and unit tests.

### Task 4: Online deploy and verification

- [ ] Deploy seedance-status and seedance-worker.
- [ ] Trigger one worker batch.
- [ ] Query the specified provider task and assert it is not queued.
- [ ] Run regression tests and commit all backend source/migration changes to GitHub main.
