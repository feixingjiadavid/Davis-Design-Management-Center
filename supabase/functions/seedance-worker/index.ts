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
import { createArkTask } from "../_shared/seedance-ark-submit.mjs";

const BUILD = "20260728-worker-async-ark-drive-v7";
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

async function queryArk(providerTaskId: string, arkKey: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("ark-status-timeout"), 35000);
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
    async syncOutputToDrive(outputId: string, context: Record<string, unknown>) {
      return await syncOutputToGoogleDrive(admin, outputId, context);
    },
  };
}

async function processQueuedArkSubmission(admin: any, task: any, arkKey: string) {
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

  try {
    const created = await createArkTask(arkKey, arkPayload);
    const providerResponse = {
      ...(created.data || {}),
      ark_submit_attempts: attempt,
      submission_phase: "provider_task_bound",
      ark_http_status: created.httpStatus,
      ark_submit_elapsed_ms: created.elapsedMs,
    };
    const updatedAt = new Date().toISOString();
    const { error: taskError } = await admin.from("video_tasks").update({
      provider_task_id: created.providerTaskId,
      status: "queued",
      progress: 20,
      error_message: null,
      provider_response: providerResponse,
      updated_at: updatedAt,
    }).eq("id", task.id).is("provider_task_id", null);
    if (taskError) throw new Error("ARK_PROVIDER_BIND_FAILED: " + taskError.message);

    if (task.segment_id) {
      await admin.from("video_segments").update({ status: "queued", updated_at: updatedAt })
        .eq("id", task.segment_id).eq("owner_id", task.owner_id);
    }
    return {
      task_id: task.id,
      provider_task_id: created.providerTaskId,
      status: "queued",
      progress: 20,
      ark_submit_attempts: attempt,
      elapsed_ms: created.elapsedMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry = shouldRetryArkSubmit(
      { ...task, provider_response: { ...(task.provider_response || {}), ark_submit_attempts: attempt } },
      error?.retryable !== false,
    );
    const nextStatus = retry ? "queued" : "failed";
    const updatedAt = new Date().toISOString();
    await admin.from("video_tasks").update({
      status: nextStatus,
      progress: retry ? 10 : 0,
      error_message: retry ? null : message,
      provider_response: {
        ...(task.provider_response || {}),
        ark_submit_attempts: attempt,
        submission_phase: retry ? "retry_queued" : "failed",
        ark_submit_last_error: message,
        ark_http_status: Number(error?.httpStatus || 0),
        ark_submit_last_at: updatedAt,
      },
      updated_at: updatedAt,
    }).eq("id", task.id).is("provider_task_id", null);
    if (task.segment_id) {
      await admin.from("video_segments").update({ status: nextStatus, updated_at: updatedAt })
        .eq("id", task.segment_id).eq("owner_id", task.owner_id);
    }
    return {
      task_id: task.id,
      provider_task_id: null,
      status: nextStatus,
      retryable: retry,
      ark_submit_attempts: attempt,
      error_message: message,
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
        return await processQueuedArkSubmission(admin, task, arkKey);
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
    const status = String(row.storage_status || "pending").toLowerCase();
    if (status === "pending") return true;
    if (status === "failed") {
      const retryAt = Date.parse(row.storage_next_retry_at || "");
      return !Number.isFinite(retryAt) || retryAt <= nowMs;
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
      if (providerTaskId) arkPayload = await queryArk(providerTaskId, arkKey);
      const videoUrl = providerVideoUrlFromPayload(arkPayload) || String(output.metadata?.provider_video_url || "");
      const drive = await syncOutputToGoogleDrive(admin, output.id, {
        force: true,
        providerTaskId,
        videoUrl,
        arkPayload,
      });
      return { output_id: output.id, task_id: output.task_id, provider_task_id: providerTaskId, ...drive };
    } catch (error) {
      return {
        output_id: output.id,
        task_id: output.task_id,
        storage_status: "failed",
        storage_error: error instanceof Error ? error.message : String(error),
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
    drive_scanned: driveCandidates.length,
    drive_completed: driveResults.filter((item: any) => item.storage_status === "completed").length,
    google_drive_config: googleDriveConfigStatus(),
    drive_results: driveResults,
    results: allResults,
  });
});
