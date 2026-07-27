# Seedance Submit Timeout Recovery Design

## Goal

Prevent Ark task creation timeouts from leaving `video_tasks` permanently active without a `provider_task_id`.

## Root Cause

`seedance-submit` can wait about 189 seconds across four 42-second attempts and backoff. Supabase Edge Functions have a 150-second request idle timeout, so the request can terminate before the failure update runs. Retrying the Ark task-creation POST also risks duplicate provider tasks because no idempotency contract is available.

## Design

- Require `client_submit_nonce`, store it in `request_payload`, and enforce uniqueness per owner with a partial unique index.\n- Replayed or concurrent requests return the existing local/provider task and never repeat the Ark create POST.\n- Make exactly one Ark create request with a 45-second timeout.
- Preserve the existing submit success and failure database writes.
- Add a pure helper that identifies active tasks without a provider ID after ten minutes and produces a terminal failure payload.
- Have `seedance-worker` scan those stale unbound tasks before polling bound Ark tasks and persist failure through the existing atomic RPC.
- Repair the three existing stale unbound rows through the same atomic RPC path.

## Constraints

- Do not modify frontend files.
- Do not add or redesign database tables.
- Do not retry the non-idempotent Ark create POST, including across repeated Edge Function calls.
- Keep terminal task and segment updates atomic.

## Verification

- Unit tests cover the 45-second single-attempt policy and ten-minute stale cutoff.
- Existing 19 status-chain tests remain green.
- Online Worker and Cron return HTTP 200.
- No active `video_tasks` remain without a `provider_task_id` after cleanup.
