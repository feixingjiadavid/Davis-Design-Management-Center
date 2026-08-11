# Davis Video Studio R54 Deliverables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing “成片单元 / deliverable” layer between business projects and concrete Seedance generation tasks, with bulk draft creation and mandatory human cost confirmation before any new paid generation.

**Architecture:** Keep the verified R50/R53 generation runtime intact. Add an additive Supabase schema (`video_deliverables` plus nullable task linkage/review fields), then load a new post-runtime module from `seedance/ui-patches.js`. The new module reads Supabase + IndexedDB directly, enhances the existing project tree in place, manages deliverables/bulk draft creation/review state, and installs a capture-phase paid-generation guard without rewriting `app-v46.js`.

**Tech Stack:** Static HTML/ES modules, Supabase JS v2, PostgreSQL/RLS, IndexedDB (`seedance/db.js`), Node built-in test runner for pure R54 helpers.

## Global Constraints

- Keep `video_project_groups` as the top-level business project and `video_projects` as concrete independent generation tasks.
- Add `video_deliverables` as the middle “成片单元 / 交付模块” layer.
- Historical tasks with no deliverable must remain usable under “未归类”.
- Do not restore Jianying/Davis Clip Bridge.
- Do not build a timeline editor.
- Never auto-trigger paid Seedance generation or paid regeneration.
- Every operation that can create new Ark usage must require explicit user confirmation with an estimated RMB amount before the original generation handler is allowed to run.
- `needs_retry` is only a review state; it must not create a task or call Ark by itself.
- Preserve owner/RLS/read-only/super-admin behavior.
- Preserve official model names and existing cost accounting semantics: estimates are estimates; actual cost continues to prefer Ark usage.
- Avoid modifying `seedance/app-v46.js` and `seedance/ffmpeg-class-worker.js` unless a verified blocker makes it unavoidable.

---

### Task 1: Add deliverable schema and RLS

**Files:**
- Create: `supabase/migrations/20260811171000_video_deliverables_r54.sql`

**Interfaces:**
- Produces table `public.video_deliverables`.
- Adds columns to `public.video_projects`: `deliverable_id`, `subject_key`, `attempt_no`, `retry_of_project_id`, `review_status`.
- RLS mirrors the existing owner + super-admin read pattern used by `video_project_groups`/`video_projects`.

- [ ] **Step 1: Write schema verification SQL before migration**

Run a query that proves `video_deliverables` and the five R54 columns do not yet exist.

- [ ] **Step 2: Apply additive migration**

Create the table, indexes, FKs, check constraints, RLS policies, updated-at trigger, and nullable compatibility columns. Do not rewrite historical rows.

- [ ] **Step 3: Verify schema and RLS**

Query `information_schema.columns`, `pg_constraint`, and `pg_policies`; verify old `video_projects` rows remain valid with `deliverable_id IS NULL`.

- [ ] **Step 4: Commit migration file to the feature branch**

Commit message: `feat: add video deliverable data model`

---

### Task 2: Add pure R54 helper module with tests

**Files:**
- Create: `seedance/r54-deliverables-core.mjs`
- Create: `seedance/r54-deliverables-core.test.mjs`

**Interfaces:**
- Produces `normalizeReviewStatus(value)`.
- Produces `groupTasksByDeliverable(tasks, deliverables)`.
- Produces `validateBatchRows(rows)`.
- Produces `nextAttemptNo(tasks, subjectKey, deliverableId)`.
- Produces `parseEstimatedRmb(text)` and `buildPaidConfirmation(items, currentProjectSpend)`.

- [ ] **Step 1: Write failing tests**

Cover: historical unclassified tasks, 45-row valid batch, missing names/files, duplicate subject keys, retry attempt numbering, and RMB parsing/totaling.

- [ ] **Step 2: Run `node --test seedance/r54-deliverables-core.test.mjs` and verify RED**

Expected: module/functions missing.

- [ ] **Step 3: Implement minimal pure helpers**

No DOM and no Supabase dependencies in this file.

- [ ] **Step 4: Run test and verify GREEN**

Expected: all R54 core tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add deliverable planning helpers`

---

### Task 3: Add deliverable UI/runtime extension

**Files:**
- Create: `seedance/r54-deliverables.js`
- Modify: `seedance/ui-patches.js`

**Interfaces:**
- Imports `supabase` from `../supabase-config.js`.
- Imports `listDrafts/saveDraft` from `./db.js`.
- Imports pure helpers from `./r54-deliverables-core.mjs`.
- Exports `initDeliverablesR54()`.

- [ ] **Step 1: Add a minimal initialization test harness for DOM-independent pieces**

Use the core tests to lock tree grouping and batch-validation behavior before wiring DOM.

- [ ] **Step 2: Implement session/data loader**

Load current auth session, readable `video_deliverables`, current `video_projects` linkage metadata, and IndexedDB drafts. Build mappings by parent group, deliverable, local draft id, and remote project id.

- [ ] **Step 3: Enhance the existing project tree without recreating child buttons**

Use a `MutationObserver` on `#project-list`. Move existing `.project-child` buttons into deliverable wrappers so app.js click handlers survive. Render `未归类` for historical/unlinked tasks. Preserve independent selection vs expand/collapse behavior.

- [ ] **Step 4: Add deliverable create/delete controls**

Create soft-deletable deliverables under a selected parent group. Owner-only mutation; foreign/read-only groups remain viewable.

- [ ] **Step 5: Add task context badge**

When a task is selected, display current deliverable, `subject_key`, attempt number, and review status without replacing the existing generation workspace.

- [ ] **Step 6: Wire module from `ui-patches.js`**

Import and call `initDeliverablesR54()` after the existing UI patch initialization. Keep existing branding/quick-editor behavior intact.

- [ ] **Step 7: Commit**

Commit message: `feat: add deliverable project hierarchy UI`

---

### Task 4: Add bulk draft creation for large deliverables

**Files:**
- Modify: `seedance/r54-deliverables.js`
- Test: `seedance/r54-deliverables-core.test.mjs`

**Interfaces:**
- Accept CSV in v1; XLSX is accepted only when a browser parser is already available, otherwise the UI clearly asks users to save/export as CSV rather than silently failing.
- Creates local draft objects in the existing IndexedDB format.
- Does not create `video_tasks` and does not call Ark.

- [ ] **Step 1: Add failing batch tests**

Use the anniversary acceptance case: 25 five-year employees + 20 ten-year employees = 45 valid draft rows; malformed rows are reported individually.

- [ ] **Step 2: Implement import preview**

Columns: task name, `subject_key`, mode, prompt/action text, model, duration, resolution, ratio, old-photo filename, current-photo filename. Preview shows row-level validation before any draft is saved.

- [ ] **Step 3: Implement draft creation**

Create 45+ local drafts with `deliverableId`, `subjectKey`, `attemptNo=1`, review status `draft`, inherited parent-group metadata, and mode-compatible empty workspace shape. No Ark call.

- [ ] **Step 4: Persist linkage after cloud project id appears**

A lightweight synchronizer watches drafts that later gain `remoteProjectId` and updates the corresponding `video_projects.deliverable_id/subject_key/attempt_no/review_status`.

- [ ] **Step 5: Verify no paid task creation**

Before and after bulk draft import, query `video_tasks` count for the test user/project and verify it is unchanged until the user separately clicks generate.

- [ ] **Step 6: Commit**

Commit message: `feat: add bulk generation draft import`

---

### Task 5: Add manual review/retry chain and paid-generation guard

**Files:**
- Modify: `seedance/r54-deliverables.js`
- Test: `seedance/r54-deliverables-core.test.mjs`

**Interfaces:**
- Review states: `draft`, `pending_review`, `accepted`, `backup`, `rejected`, `needs_retry`.
- Retry creates a new local draft; it never overwrites the source task.
- New draft carries same `subject_key`, `attempt_no + 1`, `retry_of_project_id` when a remote source id exists.

- [ ] **Step 1: Add failing tests for attempt/retry behavior and paid-confirm totals**

Verify five selected retry candidates create five new planned attempts and that `needs_retry` alone produces zero paid submissions.

- [ ] **Step 2: Implement review controls**

Owner can mark accepted/backup/rejected/needs_retry. Update local draft immediately and cloud row when a remote id exists.

- [ ] **Step 3: Implement explicit retry action**

Only a user click on “重新生成” creates a new draft copy. The new draft opens as editable and is not submitted automatically.

- [ ] **Step 4: Install capture-phase paid-generation guard**

Guard `#generate-all` and `#generate-segment`. On first click, stop the original handler, read the current visible RMB estimate, show a modal with the incremental estimate and explicit cost-bearing confirmation button, then replay the click once with a one-shot bypass token only after confirmation.

If the visible estimate cannot be parsed reliably, block submission and show “费用暂不可计算”; never fall through to the original paid handler.

- [ ] **Step 5: Verify no automatic regeneration**

Changing review state to `needs_retry`, AI suggestions, refresh, and page reload must not synthesize a click or create a new Ark task.

- [ ] **Step 6: Commit**

Commit message: `feat: require manual approval for paid video generation`

---

### Task 6: Regression verification and release preparation

**Files:**
- No new production files unless a verified regression requires a focused fix.

**Interfaces:**
- Verifies R50/R53 behaviors plus R54 additions.

- [ ] **Step 1: Run all R54 Node tests**

Run: `node --test seedance/r54-deliverables-core.test.mjs`

- [ ] **Step 2: Static syntax checks**

Run `node --check` on `seedance/r54-deliverables-core.mjs`, `seedance/r54-deliverables.js`, and `seedance/ui-patches.js` using local copies of the committed files.

- [ ] **Step 3: Database verification**

Verify schema, RLS policies, zero destructive migration, and sample owner/read-only queries.

- [ ] **Step 4: Anniversary acceptance walkthrough**

Create one anniversary parent project + one warm-up deliverable + 45 draft tasks; verify no Ark task is created by import; verify explicit generation shows a total RMB estimate before submission; mark five `needs_retry`; verify no new tasks are generated until a separate retry/confirm action.

- [ ] **Step 5: Regression checklist**

Verify existing first/last-frame, Storyboard, text-only, project collapse/selection, delete semantics, cost details, Google Drive output, and FFmpeg worker paths are untouched by R54.

- [ ] **Step 6: Review feature branch diff and prepare PR/merge decision**

Do not merge to `main` until verification evidence is clean.
