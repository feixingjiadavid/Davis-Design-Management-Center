import { createClient } from "npm:@supabase/supabase-js@2";
import { syncTaskFromArk } from "../_shared/seedance-task-sync.mjs";
import { mapWithConcurrency } from "../_shared/seedance-worker-batch.mjs";

const BUILD = "20260727-worker-v3-atomic";
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
  };
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

  const adapter = databaseAdapter(admin);
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

  return json({
    ok: true,
    scanned: (tasks || []).length,
    updated: results.filter(item => !item.retryable_error).length,
    results,
  });
});
