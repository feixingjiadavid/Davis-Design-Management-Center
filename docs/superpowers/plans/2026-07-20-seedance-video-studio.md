# Seedance Video Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the old assistant page with a secure Seedance video generation workspace backed by the existing design-system Supabase project.

**Architecture:** Keep the existing left navigation and signed-in identity. Store projects, frames, segments, tasks, outputs, and audit logs in Supabase. The browser uses only the publishable client key and user session; authenticated Edge Functions read the Ark credential from server-side environment configuration.

**Tech Stack:** Static HTML, Tailwind CSS, vanilla ES modules, Supabase JS v2, Postgres RLS, private Supabase Storage, Deno Edge Functions.

## Global Constraints

- Keep the left sidebar, return button, user name/avatar, and logout behavior.
- Remove all Coze UI, requests, chat state, and conversation storage.
- Do not place provider credentials or backend privileged keys in browser files or GitHub.
- Require authenticated allowed users for all video data.
- Use private Storage buckets and owner-only policies.
- Do not submit real provider tasks during implementation.

### Task 1: Data and storage
- [ ] Add video project, frame, segment, task, event, operation-log, and quota tables.
- [ ] Add owner-only RLS policies and timestamps.
- [ ] Add private input and output Storage buckets with user-folder policies.
- [ ] Apply and verify the migration.

### Task 2: Edge security helpers
- [ ] Add CORS, user validation, ownership checks, quota checks, image loading, payload creation, and safe response normalization.
- [ ] Read the Ark credential only from Edge Function environment configuration.

### Task 3: Submit and status functions
- [ ] Add an authenticated submission endpoint with duplicate prevention and daily quota enforcement.
- [ ] Add an authenticated status endpoint that updates task state and copies completed video files into private Storage.
- [ ] Deploy both functions with user authentication enabled.

### Task 4: Page replacement
- [ ] Replace `ai-assistant.html` while preserving the left shell.
- [ ] Add `seedance-studio.css` and `seedance-studio.js`.
- [ ] Support projects, private image upload, ordered frames, adjacent segments, prompt/model/duration/ratio controls, cost confirmation, task progress, video preview/download, and operation history.

### Task 5: Verification
- [ ] Confirm no Coze or plaintext provider credential remains in public files.
- [ ] Confirm the browser never calls Ark directly.
- [ ] Confirm all video tables and buckets are protected by RLS.
- [ ] Open a pull request with deployment and secret-configuration instructions.
