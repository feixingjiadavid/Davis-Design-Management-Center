export const ARK_CREATE_TIMEOUT_MS = 120_000;
export const STALE_UNBOUND_AFTER_MS = 2 * 60_000;
export const MAX_ARK_SUBMIT_ATTEMPTS = 4;

const ACTIVE_STATUSES = new Set([
  'submitting',
  'submitted',
  'queued',
  'processing',
  'running',
]);

export function isStaleUnboundTask(task, nowMs = Date.now()) {
  const status = String(task?.status || '').toLowerCase();
  const providerTaskId = String(task?.provider_task_id || '').trim();
  const updatedAtMs = Date.parse(String(task?.updated_at || ''));
  return ACTIVE_STATUSES.has(status) &&
    !providerTaskId &&
    Number.isFinite(updatedAtMs) &&
    nowMs - updatedAtMs > STALE_UNBOUND_AFTER_MS;
}

export function hasQueuedArkPayload(task) {
  const payload = task?.request_payload?.ark_payload;
  return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload));
}

export function arkSubmitAttemptCount(task) {
  const n = Number(task?.provider_response?.ark_submit_attempts || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function shouldRetryArkSubmit(task, retryable) {
  return Boolean(retryable) && arkSubmitAttemptCount(task) < MAX_ARK_SUBMIT_ATTEMPTS;
}

export function staleUnboundFailurePayload() {
  return {
    status: 'failed',
    error: {
      code: 'ProviderTaskBindingTimeout',
      message: 'Ark task creation timeout: provider_task_id was not persisted within 10 minutes',
    },
  };
}

export function existingSubmissionResult(task) {
  const providerTaskId = String(task?.provider_task_id || '').trim();
  const base = {
    task_id: task?.id || null,
    provider_task_id: providerTaskId || null,
    project_id: task?.project_id || null,
    segment_id: task?.segment_id || null,
    status: task?.status || 'queued',
    progress: Number(task?.progress || 0),
    retryable: false,
    idempotent_replay: true,
  };
  if (providerTaskId) return { ...base, success: true };
  return {
    ...base,
    success: true,
    submission_pending: true,
  };
}
