# Davis Video Studio Task-Series IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Davis Video Studio to a default two-level information architecture, `项目 → 生成任务`, while automatically grouping only repeated generations of the same logical task into a system-managed task series.

**Architecture:** Keep `video_project_groups` as the business project and `video_projects` as user-visible generation tasks. Remove user-facing deliverable/manual grouping from the default tree. Introduce a stable task-lineage identity for repeated generations so retries/variations of one logical task can be rendered as an automatic collapsible series without asking users to create folders.

**Tech Stack:** Vanilla JS loader/runtime patching (`seedance/app.js`, `seedance/r54-deliverables.js`), CSS (`seedance/a-ui-layout-fix.css`), Supabase/Postgres, Node regression tests.

## Global Constraints

- Default UI hierarchy is exactly `项目 → 生成任务`.
- Do not show `未归类`.
- Users do not manually create grouping/folders/成片单元.
- A task with one generation is rendered as one normal task card.
- A logical task with multiple generations is automatically rendered as one task series containing its versions.
- The series identity must come from stable lineage metadata/IDs, not name guessing.
- Preserve account isolation, RLS, owner_id semantics, Seedance submission, cost accounting, status buttons, and payment protection.
- Do not modify `seedance/app-v46.js` or `seedance/ffmpeg-class-worker.js` unless a failing regression proves it is necessary.
- Task selection must not rebuild the whole left tree or cause visible flashing.

---

### Task 1: Lock the new tree contract with failing regressions

**Files:**
- Create: `seedance/task-series-ia.test.mjs`
- Modify: `.github/workflows/davis-video-a-version-check.yml`

**Interfaces:**
- Consumes: current R54 project tree markup and task metadata.
- Produces: regression checks for no manual grouping, no `未归类`, direct project task creation, automatic series-only grouping, and no periodic/full-tree redraw on selection.

- [ ] **Step 1:** Add tests that assert the old user-facing `成片单元`, `未归类`, and manual group-creation controls are absent from the default tree.
- [ ] **Step 2:** Add tests that assert project-level `+任务` creates a generation task directly under the project.
- [ ] **Step 3:** Add tests that assert series markup is emitted only when two or more tasks share the same stable lineage key.
- [ ] **Step 4:** Add tests that assert selecting a task/series version updates selection locally without `renderProjects()` full-tree rebuild.
- [ ] **Step 5:** Run the new test and confirm it fails against the current implementation.

### Task 2: Define stable logical-task lineage

**Files:**
- Modify: `seedance/app.js`
- Modify: `seedance/db.js` only if persisted draft helpers need an explicit lineage field.
- Create/Modify: Supabase migration only if the current metadata JSON cannot safely store lineage.

**Interfaces:**
- Produces: `seriesRootId`/equivalent stable lineage identifier available on every generated version.
- Rule: a newly created logical task uses its own local task ID as the lineage root; a subsequent variation/re-generation inherits the same lineage root and gets its own version ID.

- [ ] **Step 1:** Write a failing unit/static regression for lineage inheritance.
- [ ] **Step 2:** Add a normalized helper that returns the stable lineage root from persisted metadata, with self-ID fallback for legacy single tasks.
- [ ] **Step 3:** Ensure new task creation initializes lineage once.
- [ ] **Step 4:** Ensure the existing re-generate/variation flow inherits lineage instead of creating an unrelated top-level task.
- [ ] **Step 5:** Run tests and confirm lineage behavior passes.

### Task 3: Replace the three-level left tree with project → tasks

**Files:**
- Modify: `seedance/r54-deliverables.js`
- Modify: `seedance/a-ui-layout-fix.css`

**Interfaces:**
- Consumes: project drafts plus lineage helper.
- Produces: a two-level project tree, with automatic task-series rows only for repeated generations.

- [ ] **Step 1:** Remove the default `+ 成片单元` control and the manual deliverable/group creation path from the visible project tree.
- [ ] **Step 2:** Remove the `未归类` heading entirely.
- [ ] **Step 3:** Render single-generation logical tasks directly as compact task cards.
- [ ] **Step 4:** For lineage groups with 2+ versions, render one compact series header using the original task name and a version count, with versions nested below.
- [ ] **Step 5:** Keep current status badges on each concrete version and preserve current-task highlighting.
- [ ] **Step 6:** Make project-level `+任务` the primary creation affordance.
- [ ] **Step 7:** Run regressions and verify no old grouping labels remain.

### Task 4: Simplify creation flow

**Files:**
- Modify: `seedance/app.js`
- Modify: `seedance/r54-deliverables.js`

**Interfaces:**
- Produces: `新建视频项目 → 新建第一个生成任务` with no intermediate group/folder prompt.

- [ ] **Step 1:** Remove automatic creation/prompting of a user-visible成片单元 after project creation.
- [ ] **Step 2:** After creating a project, open the existing generation-task modal directly.
- [ ] **Step 3:** Make every subsequent `+任务` create another top-level logical task under that project.
- [ ] **Step 4:** Ensure the task is immediately selectable/uploadable after creation.
- [ ] **Step 5:** Run creation-flow regressions.

### Task 5: Eliminate visible flashing

**Files:**
- Modify: `seedance/app.js`
- Modify: `seedance/r54-deliverables.js`

**Interfaces:**
- Produces: event-driven/local DOM updates for selection and version insertion.

- [ ] **Step 1:** Add a regression ensuring ordinary task selection does not call the full project-tree renderer.
- [ ] **Step 2:** Remove redundant tree invalidation/rebuilds from selection, status updates, and version selection.
- [ ] **Step 3:** Preserve scrollTop and expanded series/project state when a true data mutation requires one rebuild.
- [ ] **Step 4:** Run regressions and syntax checks.

### Task 6: Compatibility migration for existing data

**Files:**
- Modify: `seedance/app.js` and/or `seedance/r54-deliverables.js`

**Interfaces:**
- Consumes: existing deliverableId/unassigned historical tasks.
- Produces: legacy tasks displayed directly under their project without deleting data; old deliverable metadata remains stored but is ignored by the default UI.

- [ ] **Step 1:** Add fixtures covering legacy tasks with and without deliverable IDs.
- [ ] **Step 2:** Flatten legacy deliverable membership in the UI without database deletion.
- [ ] **Step 3:** Treat every legacy task without explicit lineage as its own logical task.
- [ ] **Step 4:** Confirm no historical tasks disappear.

### Task 7: Final verification and release

**Files:**
- Modify: `ai-assistant.html` resource version only if cache busting is required.

**Interfaces:**
- Produces: production release with CI evidence.

- [ ] **Step 1:** Run JS syntax checks.
- [ ] **Step 2:** Run `task-series-ia.test.mjs` plus the existing Davis Video A Version Check suite.
- [ ] **Step 3:** Audit the diff to confirm Seedance generation/payment/account isolation files are not unintentionally changed.
- [ ] **Step 4:** Open PR, wait for green CI, merge, and verify GitHub Pages built the merge commit.
