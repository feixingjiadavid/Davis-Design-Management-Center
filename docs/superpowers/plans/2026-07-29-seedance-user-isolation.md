# Seedance User Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Davis Video records private per user while allowing davidxxu and judyzzhang to read, but never modify, every user's records.

**Architecture:** Supabase RLS is the authoritative boundary: owner-only writes and owner-or-admin reads across all six video tables. A small browser/Node-compatible access-control module centralizes the two administrator identities and read/write decisions; `seedance/app.js` uses it to load all cloud records for administrators and make foreign projects read-only.

**Tech Stack:** Supabase Postgres RLS, Supabase Auth JWT, browser ES modules, JavaScript, Node.js built-in test runner.

## Global Constraints

- Ordinary users can only view and operate on records whose `owner_id` equals `auth.uid()`.
- `davidxxu@webank.com` and `judyzzhang@webank.com` may read all video records.
- Administrators cannot edit, regenerate, overwrite, upload into, or delete another user's project.
- Administrator identity is derived from the authenticated Supabase user email, never localStorage role data.
- Do not change the Seedance/Ark generation or Google Drive synchronization pipeline.
- Do not redesign the existing UI.

---

### Task 1: Centralize frontend video access decisions

**Files:**
- Create: `seedance/access-control.mjs`
- Create: `seedance/access-control.test.mjs`

**Interfaces:**
- Consumes: Supabase Auth user objects with `id` and `email`.
- Produces:
  - `isVideoSuperAdmin(user): boolean`
  - `isForeignVideoOwner(user, ownerId): boolean`
  - `canMutateVideoOwner(user, ownerId): boolean`
  - `scopeVideoRead(query, user, ownerColumn = 'owner_id'): query`

- [ ] **Step 1: Write failing unit tests**

Use Node's `node:test` and `node:assert/strict`. Cover literal cases:

```js
test('ordinary user read scope adds owner filter', () => {
  const calls = [];
  const query = { eq: (...args) => { calls.push(args); return query; } };
  scopeVideoRead(query, { id: 'user-a', email: 'user@webank.com' });
  assert.deepEqual(calls, [['owner_id', 'user-a']]);
});

test('both administrators receive unfiltered read scope', () => {
  for (const email of ['davidxxu@webank.com', 'judyzzhang@webank.com']) {
    const query = { eq: () => { throw new Error('must not filter'); } };
    assert.equal(scopeVideoRead(query, { id: email, email }), query);
  }
});

test('administrator still cannot mutate a foreign owner', () => {
  assert.equal(canMutateVideoOwner(
    { id: 'admin-id', email: 'davidxxu@webank.com' },
    'other-user-id'
  ), false);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test seedance/access-control.test.mjs`  
Expected: FAIL because `access-control.mjs` does not yet export the required functions.

- [ ] **Step 3: Implement the pure access-control module**

Use an immutable email set, lowercase normalization, fail-closed handling for missing users, conditional owner filtering for reads, and exact owner equality for mutations.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `node --test seedance/access-control.test.mjs`  
Expected: all access-control tests pass with zero failures.

- [ ] **Step 5: Commit**

Commit message: `test: define Seedance record access rules`

### Task 2: Split Supabase video policies into owner writes and admin reads

**Files:**
- Create: `supabase/migrations/202607290001_seedance_user_read_isolation.sql`

**Interfaces:**
- Consumes: `auth.uid()` and `auth.jwt()->>'email'`.
- Produces: separate SELECT, INSERT, UPDATE, and DELETE policies on `video_projects`, `video_assets`, `video_segments`, `video_tasks`, `video_outputs`, and `video_operation_logs`.

- [ ] **Step 1: Capture the pre-migration failing authorization contract**

For an authenticated admin JWT, query a video project owned by another user and confirm the current owner-only SELECT policy returns no row. For an ordinary user JWT, confirm another owner's row is also hidden.

- [ ] **Step 2: Create the explicit migration**

For each of the six tables:

```sql
drop policy if exists <table>_owner_policy on public.<table>;

create policy <table>_select_policy
on public.<table> for select
using (
  owner_id = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'davidxxu@webank.com',
    'judyzzhang@webank.com'
  )
);

create policy <table>_insert_policy
on public.<table> for insert
with check (owner_id = auth.uid());

create policy <table>_update_policy
on public.<table> for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy <table>_delete_policy
on public.<table> for delete
using (owner_id = auth.uid());
```

Repeat the complete statements for all six tables; do not use dynamic SQL in the committed migration.

- [ ] **Step 3: Apply the migration to Supabase project `supffjeeouibhqdfqosk`**

Use the Supabase migration tool so the change is recorded as a database migration.

- [ ] **Step 4: Verify policy definitions**

Query `pg_policies` and assert each table has exactly four policies, the SELECT policy contains the two administrator emails, and no INSERT/UPDATE/DELETE policy contains an administrator exception.

- [ ] **Step 5: Verify authorization behavior**

With authenticated JWT claims:

- ordinary owner: can read and write own records;
- ordinary non-owner: cannot read or mutate foreign records;
- each administrator: can read a foreign record;
- each administrator: cannot update or delete the foreign record;
- each administrator: can still update their own record.

Use rollback-scoped fixtures or existing non-destructive records; leave no test rows behind.

- [ ] **Step 6: Commit**

Commit message: `feat: enforce owner writes and admin reads for video records`

### Task 3: Load administrator cloud records without granting edit capability

**Files:**
- Modify: `seedance/app.js`
- Modify: `ai-assistant.html`
- Test: `seedance/access-control.test.mjs`

**Interfaces:**
- Consumes: access-control functions from Task 1 and rows containing `owner_id`.
- Produces:
  - administrator cloud project recovery across all owners;
  - `readOnlyForeignProject` state derived from the selected project owner;
  - a single guard used by every video mutation entry point.

- [ ] **Step 1: Add failing access-state tests**

Add cases proving:

- a normal user's own project is mutable;
- an administrator's own project is mutable;
- an administrator's foreign project is read-only;
- missing owner information fails closed for mutation.

Run: `node --test seedance/access-control.test.mjs`  
Expected: the new boundary case fails before the implementation is updated.

- [ ] **Step 2: Import access-control functions**

At the top of `seedance/app.js`, import the four functions from `./access-control.mjs`.

- [ ] **Step 3: Scope cloud read queries**

Replace direct owner filters on read-only queries with `scopeVideoRead(query, state.user)`. Always select and retain `owner_id` for projects, assets, segments, tasks, outputs, and operation logs. In `r11RestoreCloudDrafts`, administrators recover every cloud project while ordinary users remain owner-filtered.

- [ ] **Step 4: Preserve project ownership in local cloud drafts**

Store the cloud project's owner as `remoteOwnerId` on the recovered draft/workspace. When resolving or syncing a project, use its preserved owner for read selection and never rewrite it to the viewing administrator.

- [ ] **Step 5: Add a fail-closed mutation guard**

Create a guard such as:

```js
function assertCurrentVideoProjectWritable(actionLabel) {
  const ownerId = getWorkspace()?.remoteOwnerId || state.draft?.remoteOwnerId || state.user?.id;
  if (canMutateVideoOwner(state.user, ownerId)) return true;
  toast('只读项目', `这是其他用户的项目，不能${actionLabel}。`);
  return false;
}
```

Call it before Ark submission, generation retry, re-edit/version fork, material upload, remote project save/update, output replacement/merge writeback, and project deletion. The guard must run before any Supabase write, Storage upload, Edge Function call, or Ark request.

- [ ] **Step 6: Render foreign projects as read-only using existing controls**

For an administrator viewing another owner's project, disable existing generation/retry/edit/delete/upload controls and show an existing toast if an action is attempted. Do not introduce a new layout. Own projects retain current behavior.

- [ ] **Step 7: Update the cache-busting asset version**

Change the `seedance/app.js` query version in `ai-assistant.html` so production browsers receive the updated module.

- [ ] **Step 8: Run unit and syntax checks**

Run:

- `node --test seedance/access-control.test.mjs`
- `node --check seedance/access-control.mjs`
- `node --check seedance/app.js`

Expected: zero failures and zero syntax errors.

- [ ] **Step 9: Commit**

Commit message: `feat: add read-only admin visibility to Seedance projects`

### Task 4: Online acceptance and regression verification

**Files:**
- Verify: `ai-assistant.html`
- Verify: Supabase video tables and policies

**Interfaces:**
- Consumes: deployed GitHub pages and Supabase policies.
- Produces: evidence for the three permission classes and unchanged generation behavior.

- [ ] **Step 1: Verify deployed assets**

Request production `ai-assistant.html`, `seedance/app.js`, and `seedance/access-control.mjs`. Confirm HTTP 200 and the new cache-busting version.

- [ ] **Step 2: Verify ordinary-user isolation**

Using a non-admin authenticated session, confirm the project list and task/output queries contain only that user's `owner_id`.

- [ ] **Step 3: Verify each administrator**

Using `davidxxu` and `judyzzhang` sessions, confirm all cloud projects are visible. Select a foreign project and confirm tasks/outputs load while generation, retry, edit, upload, merge-write, and delete do not issue network mutations.

- [ ] **Step 4: Verify administrator own-project behavior**

For each administrator, select an owned project and confirm existing generation and management controls remain operational.

- [ ] **Step 5: Verify pipeline regression boundaries**

Confirm no change to Ark submission payloads, polling, Google Drive synchronization, output playback, or V-2/V-3 project forking logic.

- [ ] **Step 6: Inspect Supabase logs**

Confirm foreign-owner write attempts are rejected and no successful cross-owner mutations occurred during testing.
