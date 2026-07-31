import { createClient } from "npm:@supabase/supabase-js@2";
import { syncTaskFromArk } from "../_shared/seedance-task-sync.mjs";
import { syncOutputToGoogleDrive, providerVideoUrlFromPayload, googleDriveConfigStatus } from "../_shared/seedance-drive.mjs";
import { mapWithConcurrency } from "../_shared/seedance-worker-batch.mjs";
import {
  STALE_UNBOUND_AFTER_MS,
  arkSubmitAttemptCount,
  hasQueuedArkPayload,
  shouldRetryArkSubmit,
  staleUnboundFailurePayload,
} from "../_shared/seedance-submit-policy.mjs";
import { createArkTask, ARK_CREATE_URL } from "../_shared/seedance-ark-submit.mjs";
import { redactArkPayload } from "../_shared/seedance-request-shape.mjs";
import { callbackSignature, safetyIdentifier } from "../_shared/seedance-callback-auth.mjs";

const BUILD = "20260731-drive-recovery-backoff-v21";
const ACTIVE_STATUSES = ["queued", "running", "processing", "submitting", "submitted"];
const MAX_BATCH = 25;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ build: BUILD, ...body }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function readJsonSafe(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function queryArk(providerTaskId: string, arkKey: string, timeoutMs = 35000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("ark-status-timeout"), timeoutMs);
  try {
    const response = await fetch(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/" +
        encodeURIComponent(providerTaskId),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + arkKey,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      },
    );
    const payload = await readJsonSafe(response);

    if ([401, 403, 429].includes(response.status) || response.status >= 500) {
      throw new Error(
        "Ark status request is retryable: HTTP " + response.status + " " +
          JSON.stringify(payload).slice(0, 800),
      );
    }

    return {
      ...payload,
      ark_http_status: response.status,
      ark_http_ok: response.ok,
    };
  } finally {
    clearTimeout(timer);
  }
}

function databaseAdapter(admin: any) {
  return {
    async persistResult(task: any, result: any, arkPayload: any, nowIso: string) {
      const { data, error } = await admin.rpc("sync_seedance_task_result", {
        p_task_id: task.id,
        p_provider_response: arkPayload,
        p_normalized_status: result.status,
        p_progress: result.progress,
        p_error_message: result.errorMessage || null,
        p_video_url: result.videoUrl || null,
        p_now: nowIso,
      });
      if (error) throw new Error("atomic task sync failed: " + error.message);
      return data;
    },
    async updateTask(id: string, patch: Record<string, unknown>) {
      const { error } = await admin.from("video_tasks").update(patch).eq("id", id);
      if (error) throw new Error("video_tasks update failed: " + error.message);
    },
    async updateSegment(id: string, ownerId: string, patch: Record<string, unknown>) {
      const { error } = await admin.from("video_segments").update(patch)
        .eq("id", id).eq("owner_id", ownerId);
      if (error) throw new Error("video_segments update failed: " + error.message);
    },
    async findOutputByTaskId(taskId: string) {
      const { data, error } = await admin.from("video_outputs").select("*")
        .eq("task_id", taskId).order("created_at", { ascending: false }).limit(1);
      if (error) throw new Error("video_outputs lookup failed: " + error.message);
      return data?.[0] || null;
    },
    async insertOutput(row: Record<string, unknown>) {
      const { data, error } = await admin.from("video_outputs").insert(row)
        .select("*").single();
      if (error) throw new Error("video_outputs insert failed: " + error.message);
      return data;
    },
    async updateOutput(id: string, patch: Record<string, unknown>) {
      const { data, error } = await admin.from("video_outputs").update(patch)
        .eq("id", id).select("*").single();
      if (error) throw new Error("video_outputs update failed: " + error.message);
      return data;
    },
  };
}

async function auditOperation(
  admin: any,
  task: any,
  action: string,
  detail: Record<string, unknown>,
) {
  const { error } = await admin.from("video_operation_logs").insert({
    owner_id: task.owner_id,
    action,
    target_type: "video_task",
    target_id: task.id,
    detail,
  });
  if (error) {
    console.error(JSON.stringify({
      event: "seedance_audit_log_failed",
      task_id: task.id,
      action,
      detail: error.message,
    }));
  }
}

function arkFailureForLog(error: any) {
  return {
    response_code: Number(error?.httpStatus || 0),
    error_code: String(error?.code || error?.providerCode || "ARK_CREATE_FAILED"),
    provider_code: String(error?.providerCode || ""),
    request_id: error?.requestId || null,
    response_body: error?.payload || { message: error instanceof Error ? error.message : String(error) },
  };
}

async function processQueuedArkSubmission(admin: any, task: any, arkKey: string, supabaseUrl: string, serviceKey: string) {
  const arkPayload = task?.request_payload?.ark_payload;
  if (!hasQueuedArkPayload(task)) {
    return { task_id: task.id, status: task.status, skipped: "ARK_PAYLOAD_MISSING" };
  }

  const attempt = arkSubmitAttemptCount(task) + 1;
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin.from("video_tasks").update({
    status: "submitting",
    progress: 12,
    error_message: null,
    provider_response: {
      ...(task.provider_response || {}),
      ark_submit_attempts: attempt,
      submission_phase: "ark_create_task",
      ark_submit_started_at: nowIso,
    },
    updated_at: nowIso,
  }).eq("id", task.id)
    .eq("status", "queued")
    .is("provider_task_id", null)
    .select("*")
    .maybeSingle();

  if (claimError) throw new Error("ARK_SUBMIT_CLAIM_FAILED: " + claimError.message);
  if (!claimed) return { task_id: task.id, status: task.status, skipped: "ALREADY_CLAIMED" };

  const taskType = String(task?.request_payload?.task_type || task?.request_payload?.generation_mode || "");
  const imageSubmissionMethod = String(task?.request_payload?.image_submission_method || "unknown");
  try {
    // Submit the ordinary image once. Retrying under another role is forbidden.
    const providerPayload = { ...arkPayload };
    const callbackSecret = Deno.env.get("SEEDANCE_CALLBACK_SECRET") || serviceKey;
    const safetySecret = Deno.env.get("SEEDANCE_SAFETY_IDENTIFIER_SECRET") || serviceKey;
    if (callbackSecret) {
      const signature = await callbackSignature(task.id, callbackSecret);
      providerPayload.callback_url =
        `${supabaseUrl}/functions/v1/seedance-callback?task_id=${encodeURIComponent(task.id)}&signature=${signature}`;
    }
    if (safetySecret) {
      providerPayload.safety_identifier = await safetyIdentifier(task.owner_id, safetySecret);
    }
    const created = await createArkTask(arkKey, providerPayload, { timeoutMs: 45_000 });

    const providerResponse = {
      ...(created.data || {}),
      ark_submit_attempts: attempt,
      compatibility_retry_attempts: 0,
      compatibility_retry_used: false,
      first_failure: null,
      submission_phase: "provider_task_bound",
      final_status: "generating",
      ark_http_status: created.httpStatus,
      ark_submit_elapsed_ms: created.elapsedMs,
    };
    const updatedAt = new Date().toISOString();
    const providerRequestId = created.data?.request_id || created.data?.requestId || null;
    const { error: taskError } = await admin.from("video_tasks").update({
      provider_task_id: created.providerTaskId,
      status: "queued",
      progress: 20,
      error_message: null,
      provider_response: providerResponse,
      metadata: {
        ...(task.metadata || {}),
        provider_task_id: created.providerTaskId,
        provider_request_id: providerRequestId,
        provider_error_code: null,
        callback_enabled: Boolean(providerPayload.callback_url),
        safety_identifier_enabled: Boolean(providerPayload.safety_identifier),
      },
      updated_at: updatedAt,
    }).eq("id", task.id).is("provider_task_id", null);
    if (taskError) throw new Error("ARK_PROVIDER_BIND_FAILED: " + taskError.message);

    if (task.segment_id) {
      await admin.from("video_segments").update({ status: "queued", updated_at: updatedAt })
        .eq("id", task.segment_id).eq("owner_id", task.owner_id);
    }
    await admin.from("video_provider_policy_events").update({
      outcome: "provider_accepted",
      provider_request_id: providerRequestId,
      updated_at: updatedAt,
    }).eq("task_id", task.id);
    await auditOperation(admin, task, "seedance_ark_submit_succeeded", {
      model: arkPayload.model,
      endpoint: ARK_CREATE_URL,
      task_type: taskType,
      image_submission_method: imageSubmissionMethod,
      request_id: created.data?.request_id || null,
      response_code: created.httpStatus,
      response_body: created.data || {},
      compatibility_retry_used: false,
      final_status: "generating",
    });
    return {
      task_id: task.id,
      provider_task_id: created.providerTaskId,
      status: "queued",
      public_status: "generating",
      progress: 20,
      ark_submit_attempts: attempt,
      compatibility_retry_used: false,
      elapsed_ms: created.elapsedMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const privacyPolicyBlocked =
      error?.code === "PROVIDER_POLICY_BLOCKED" ||
      error?.code === "ARK_REAL_PERSON_AUTH_REQUIRED" ||
      error?.providerCode === "InputImageSensitiveContentDetected.PrivacyInformation";
    const temporaryPersonTask =
      String(task?.request_payload?.submit_mode || task?.metadata?.submit_mode || "") ===
        "temporary_reference_person";
    const retry = privacyPolicyBlocked || temporaryPersonTask ? false : shouldRetryArkSubmit(
      { ...task, provider_response: { ...(task.provider_response || {}), ark_submit_attempts: attempt } },
      error?.retryable !== false,
    );
    const nextStatus = retry ? "queued" : (privacyPolicyBlocked ? "provider_policy_blocked" : "failed");
    const finalStatus = retry ? "pending" : (privacyPolicyBlocked ? "provider_policy_blocked" : "provider_failed");
    const updatedAt = new Date().toISOString();
    const failure = arkFailureForLog(error);
    await admin.from("video_tasks").update({
      status: nextStatus,
      progress: retry ? 10 : 0,
      error_message: retry ? null : message,
      metadata: {
        ...(task.metadata || {}),
        provider_request_id: failure.request_id,
        provider_error_code: failure.provider_code || failure.error_code,
        retry_count: Math.max(0, attempt - 1),
      },
      provider_response: {
        ...(task.provider_response || {}),
        ark_submit_attempts: attempt,
        compatibility_retry_attempts: 0,
        compatibility_retry_used: false,
        first_failure: null,
        submission_phase: retry ? "retry_queued" : "failed",
        final_status: finalStatus,
        ark_submit_last_error: message,
        ark_error_code: failure.error_code,
        ark_provider_code: failure.provider_code,
        ark_request_id: failure.request_id,
        ark_http_status: failure.response_code,
        ark_response_body: failure.response_body,
        ark_submit_last_at: updatedAt,
      },
      updated_at: updatedAt,
    }).eq("id", task.id).is("provider_task_id", null);
    if (task.segment_id) {
      await admin.from("video_segments").update({ status: nextStatus, updated_at: updatedAt })
        .eq("id", task.segment_id).eq("owner_id", task.owner_id);
    }
    await admin.from("video_provider_policy_events").update({
      outcome: privacyPolicyBlocked ? "provider_policy_blocked" : "provider_error",
      provider_request_id: failure.request_id,
      provider_error_code: failure.provider_code || failure.error_code,
      error_type: failure.provider_code || failure.error_code,
      retry_count: Math.max(0, attempt - 1),
      updated_at: updatedAt,
    }).eq("task_id", task.id);
    await auditOperation(admin, task, "seedance_ark_submit_failed", {
      model: arkPayload.model,
      endpoint: ARK_CREATE_URL,
      task_type: taskType,
      image_submission_method: imageSubmissionMethod,
      compatibility_retry_used: false,
      first_failure: null,
      ...failure,
      final_status: finalStatus,
    });
    return {
      task_id: task.id,
      provider_task_id: null,
      status: nextStatus,
      public_status: finalStatus,
      retryable: retry,
      ark_submit_attempts: attempt,
      compatibility_retry_used: false,
      error_message: message,
      error_code: failure.error_code,
      request_id: failure.request_id,
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const arkKey = Deno.env.get("ARK_API_KEY") || "";
  if (!supabaseUrl || !serviceKey || !arkKey) {
    return json({ error: "SERVER_ENV_MISSING" }, 500);
  }

  const runtimeConfig = {
    callback_enabled: true,
    callback_secret_source: Deno.env.get("SEEDANCE_CALLBACK_SECRET") ? "dedicated" : "service_key_fallback",
    safety_identifier_enabled: true,
    safety_identifier_secret_source: Deno.env.get("SEEDANCE_SAFETY_IDENTIFIER_SECRET") ? "dedicated" : "service_key_fallback",
    google_drive: googleDriveConfigStatus(),
  };
  console.log(JSON.stringify({ event: "seedance_worker_runtime_config", ...runtimeConfig }));

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const workerSecret = req.headers.get("x-seedance-worker-secret") || "";
  const { data: authorized, error: authorizationError } = await admin.rpc(
    "validate_seedance_worker_secret",
    { candidate: workerSecret },
  );
  if (authorizationError || authorized !== true) {
    return json({ error: "UNAUTHORIZED_WORKER" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const recoverDriveFailures = Boolean(body.recover_drive_failed);
  const requestedLimit = Number(body.limit || 10);
  const limit = Math.max(1, Math.min(MAX_BATCH, Number.isFinite(requestedLimit) ? requestedLimit : 10));
  const requestedProviderTaskId = String(body.provider_task_id || "").trim();
  const adapter = databaseAdapter(admin);

  let staleTasks: any[] = [];
  if (!requestedProviderTaskId) {
    const staleCutoff = new Date(Date.now() - STALE_UNBOUND_AFTER_MS).toISOString();
    const { data, error } = await admin.from("video_tasks").select("*")
      .in("status", ACTIVE_STATUSES)
      .is("provider_task_id", null)
      .lt("updated_at", staleCutoff)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (error) return json({ error: "STALE_TASK_SCAN_FAILED", detail: error.message }, 500);
    staleTasks = data || [];
  }

  const staleResults = await mapWithConcurrency(staleTasks, 3, async (task: any) => {
    try {
      if (hasQueuedArkPayload(task)) {
        const { error } = await admin.from("video_tasks").update({
          status: "queued",
          progress: 10,
          error_message: null,
          updated_at: new Date().toISOString(),
        }).eq("id", task.id).is("provider_task_id", null);
        if (error) throw new Error(error.message);
        return { task_id: task.id, status: "queued", recovered_stale_submission: true };
      }
      const result = await syncTaskFromArk(task, staleUnboundFailurePayload(), adapter);
      return {
        task_id: task.id,
        provider_task_id: null,
        status: result.status,
        progress: result.progress,
        error_message: result.errorMessage || null,
        recovered_stale_submission: true,
      };
    } catch (error) {
      return {
        task_id: task.id,
        provider_task_id: null,
        status: task.status,
        retryable_error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  let submitResults: any[] = [];
  if (!requestedProviderTaskId) {
    const { data: queuedTasks, error: queuedError } = await admin.from("video_tasks").select("*")
      .eq("status", "queued")
      .is("provider_task_id", null)
      .order("created_at", { ascending: true })
      .limit(Math.min(limit, 3));
    if (queuedError) return json({ error: "QUEUED_SUBMISSION_SCAN_FAILED", detail: queuedError.message }, 500);
    submitResults = await mapWithConcurrency(queuedTasks || [], 1, async (task: any) => {
      try {
        return await processQueuedArkSubmission(admin, task, arkKey, supabaseUrl, serviceKey);
      } catch (error) {
        return {
          task_id: task.id,
          status: task.status,
          retryable_error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  let taskQuery = admin.from("video_tasks").select("*")
    .in("status", ACTIVE_STATUSES)
    .not("provider_task_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (requestedProviderTaskId) {
    taskQuery = taskQuery.eq("provider_task_id", requestedProviderTaskId);
  } else {
    const callbackWatchdogMs = Math.max(
      60_000,
      Number(Deno.env.get("SEEDANCE_CALLBACK_WATCHDOG_MS") || 180_000),
    );
    taskQuery = taskQuery.lt(
      "updated_at",
      new Date(Date.now() - callbackWatchdogMs).toISOString(),
    );
  }

  const { data: tasks, error: taskError } = await taskQuery;
  if (taskError) return json({ error: "TASK_SCAN_FAILED", detail: taskError.message }, 500);

  const results = await mapWithConcurrency(tasks || [], 3, async (task: any) => {
    try {
      const arkPayload = await queryArk(String(task.provider_task_id), arkKey);
      const result = await syncTaskFromArk(task, arkPayload, adapter);
      return {
        task_id: task.id,
        provider_task_id: task.provider_task_id,
        raw_status: result.rawStatus,
        status: result.status,
        progress: result.progress,
        error_message: result.errorMessage || null,
        output_id: result.output?.id || null,
      };
    } catch (error) {
      return {
        task_id: task.id,
        provider_task_id: task.provider_task_id,
        status: task.status,
        retryable_error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const nowMs = Date.now();
  const { data: driveRows, error: driveScanError } = await admin.from("video_outputs").select("*")
    .in("storage_status", ["pending", "failed", "uploading"])
    .order("created_at", { ascending: false })
    .limit(Math.min(limit * 3, 50));
  const driveCandidates = (driveRows || []).filter((row: any) => {
    if (recoverDriveFailures && row.metadata?.provider_recovery_terminal === true) return false;
    const recoveryRetryAt = Date.parse(row.metadata?.provider_recovery_next_retry_at || "");
    if (recoverDriveFailures && Number.isFinite(recoveryRetryAt) && recoveryRetryAt > nowMs) return false;
    const status = String(row.storage_status || "pending").toLowerCase();
    if (status === "pending") return true;
    if (status === "failed") {
      if (row.metadata?.storage_terminal === true || String(row.status || "") === "drive_failed") {
        return recoverDriveFailures;
      }
      const retryAt = Date.parse(row.storage_next_retry_at || "");
      return Number.isFinite(retryAt) && retryAt <= nowMs;
    }
    const updatedAt = Date.parse(row.storage_updated_at || row.created_at || "");
    return status === "uploading" && (!Number.isFinite(updatedAt) || nowMs - updatedAt >= 15 * 60 * 1000);
  }).slice(0, Math.min(limit, 3));

  const driveResults = driveScanError ? [{
    storage_status: "scan_failed",
    storage_error: driveScanError.message,
  }] : await mapWithConcurrency(driveCandidates, 1, async (output: any) => {
    try {
      const { data: task } = await admin.from("video_tasks").select("*").eq("id", output.task_id).maybeSingle();
      const providerTaskId = String(task?.provider_task_id || output.metadata?.provider_task_id || "").trim();
      let arkPayload = task?.provider_response || output.metadata?.ark_response || {};
      let videoUrl = String(output.metadata?.provider_video_url || "") ||
        providerVideoUrlFromPayload(arkPayload);

      // Provider URLs are temporary. Historical Drive recovery must refresh the
      // Ark result before download instead of retrying an expired signed URL.
      if (providerTaskId && (recoverDriveFailures || !videoUrl)) {
        const refreshedArkPayload = await queryArk(providerTaskId, arkKey, 15000);
        const refreshedVideoUrl = providerVideoUrlFromPayload(refreshedArkPayload);
        if (!refreshedVideoUrl) {
          await admin.from("video_outputs").update({
            metadata: {
              ...(output.metadata || {}),
              provider_recovery_terminal: true,
              provider_recovery_error: "PROVIDER_VIDEO_URL_REFRESH_FAILED",
              provider_url_refreshed_at: new Date().toISOString(),
            },
          }).eq("id", output.id);
          throw new Error("PROVIDER_VIDEO_URL_REFRESH_FAILED");
        }
        arkPayload = refreshedArkPayload;
        videoUrl = refreshedVideoUrl;
        const refreshedAt = new Date().toISOString();
        const { error: refreshPersistError } = await admin.from("video_outputs").update({
          metadata: {
            ...(output.metadata || {}),
            provider_video_url: refreshedVideoUrl,
            ark_response: refreshedArkPayload,
            provider_url_refreshed_at: refreshedAt,
          },
          storage_attempts: recoverDriveFailures ? 0 : Number(output.storage_attempts || 0),
          storage_error: null,
          storage_next_retry_at: null,
          storage_updated_at: refreshedAt,
        }).eq("id", output.id);
        if (refreshPersistError) {
          throw new Error("PROVIDER_VIDEO_URL_REFRESH_PERSIST_FAILED: " + refreshPersistError.message);
        }
      }

      const drive = await syncOutputToGoogleDrive(admin, output.id, {
        force: true,
        providerTaskId,
        videoUrl,
        arkPayload,
      });
      const driveNow = new Date().toISOString();
      if (
        recoverDriveFailures &&
        drive.storage_status === "failed" &&
        /Request has expired|PROVIDER_VIDEO_URL_REFRESH_FAILED/i.test(String(drive.storage_error || ""))
      ) {
        const { data: failedOutput } = await admin.from("video_outputs")
          .select("metadata").eq("id", output.id).maybeSingle();
        await admin.from("video_outputs").update({
          metadata: {
            ...(failedOutput?.metadata || output.metadata || {}),
            provider_recovery_terminal: true,
            provider_recovery_error: String(drive.storage_error || "PROVIDER_VIDEO_URL_EXPIRED"),
            provider_url_refreshed_at: driveNow,
          },
        }).eq("id", output.id);
      }
      if (drive.storage_status === "completed") {
        await admin.from("video_tasks").update({
          status: "succeeded",
          progress: 100,
          error_message: null,
          completed_at: driveNow,
          updated_at: driveNow,
        }).eq("id", output.task_id);
        if (output.segment_id) {
          await admin.from("video_segments").update({
            status: "succeeded", updated_at: driveNow,
          }).eq("id", output.segment_id).eq("owner_id", output.owner_id);
        }
        await admin.from("video_provider_policy_events").update({
          outcome: "success", updated_at: driveNow,
        }).eq("task_id", output.task_id);
      } else if (drive.storage_status === "failed" && drive.terminal === true) {
        await admin.from("video_tasks").update({
          status: "drive_sync_failed",
          progress: 99,
          error_message: "视频已生成，但同步云端失败。系统将保留记录以便恢复。",
          updated_at: driveNow,
        }).eq("id", output.task_id);
        if (output.segment_id) {
          await admin.from("video_segments").update({
            status: "drive_sync_failed", updated_at: driveNow,
          }).eq("id", output.segment_id).eq("owner_id", output.owner_id);
        }
        await admin.from("video_provider_policy_events").update({
          outcome: "drive_sync_failed", updated_at: driveNow,
        }).eq("task_id", output.task_id);
      }
      return { output_id: output.id, task_id: output.task_id, provider_task_id: providerTaskId, ...drive };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/ark-status-timeout/i.test(message)) {
        const { data: retryOutput } = await admin.from("video_outputs")
          .select("metadata").eq("id", output.id).maybeSingle();
        await admin.from("video_outputs").update({
          metadata: {
            ...(retryOutput?.metadata || output.metadata || {}),
            provider_recovery_error: message,
            provider_recovery_next_retry_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          },
        }).eq("id", output.id);
      }
      return {
        output_id: output.id,
        task_id: output.task_id,
        storage_status: "failed",
        storage_error: message,
      };
    }
  });

  const allResults = [...staleResults, ...submitResults, ...results];
  return json({
    ok: true,
    scanned: staleTasks.length + submitResults.length + (tasks || []).length,
    updated: allResults.filter(item => !item.retryable_error).length,
    stale_recovered: staleResults.filter(item => !item.retryable_error).length,
    ark_submissions: submitResults,
    drive_recovery_requested: recoverDriveFailures,
    drive_scanned: driveCandidates.length,
    drive_completed: driveResults.filter((item: any) => item.storage_status === "completed").length,
    runtime_config: runtimeConfig,
    google_drive_config: googleDriveConfigStatus(),
    drive_results: driveResults,
    results: allResults,
  });
});
