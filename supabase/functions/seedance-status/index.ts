import { createClient } from "npm:@supabase/supabase-js@2";
import { syncTaskFromArk } from "../_shared/seedance-task-sync.mjs";

const BUILD = "20260727-status-terminal-mapping-v43";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ build: BUILD, ...body }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function readBody(req: Request) {
  if (req.method !== "POST") return {};
  try {
    return await req.json();
  } catch {
    return {};
  }
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
      throw new Error("Ark status request is retryable: HTTP " + response.status);
    }
    return { ...payload, ark_http_status: response.status, ark_http_ok: response.ok };
  } finally {
    clearTimeout(timer);
  }
}

function databaseAdapter(admin: any, ownerId: string) {
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
      const { error } = await admin.from("video_tasks").update(patch)
        .eq("id", id).eq("owner_id", ownerId);
      if (error) throw new Error("video_tasks update failed: " + error.message);
    },
    async updateSegment(id: string, rowOwnerId: string, patch: Record<string, unknown>) {
      const { error } = await admin.from("video_segments").update(patch)
        .eq("id", id).eq("owner_id", rowOwnerId);
      if (error) throw new Error("video_segments update failed: " + error.message);
    },
    async findOutputByTaskId(taskId: string) {
      const { data, error } = await admin.from("video_outputs").select("*")
        .eq("owner_id", ownerId).eq("task_id", taskId)
        .order("created_at", { ascending: false }).limit(1);
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
        .eq("id", id).eq("owner_id", ownerId).select("*").single();
      if (error) throw new Error("video_outputs update failed: " + error.message);
      return data;
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const arkKey = Deno.env.get("ARK_API_KEY") || "";
  if (!supabaseUrl || !serviceKey || !arkKey) return json({ error: "SERVER_ENV_MISSING" }, 500);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "NO_AUTH_TOKEN" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return json({ error: "INVALID_AUTH_TOKEN" }, 401);

  const url = new URL(req.url);
  const body = await readBody(req);
  let providerTaskId = String(
    url.searchParams.get("provider_task_id") ||
    url.searchParams.get("providerTaskId") ||
    body.provider_task_id ||
    body.providerTaskId ||
    "",
  ).trim();
  let localTaskId = String(
    url.searchParams.get("task_id") ||
    url.searchParams.get("taskId") ||
    url.searchParams.get("id") ||
    body.task_id ||
    body.taskId ||
    body.id ||
    "",
  ).trim();

  if (!providerTaskId && localTaskId.startsWith("cgt-")) {
    providerTaskId = localTaskId;
    localTaskId = "";
  }
  if (!providerTaskId && !localTaskId) return json({ error: "MISSING_TASK_ID" }, 400);

  let taskQuery = admin.from("video_tasks").select("*")
    .eq("owner_id", user.id).limit(1);
  taskQuery = providerTaskId
    ? taskQuery.eq("provider_task_id", providerTaskId)
    : taskQuery.eq("id", localTaskId);

  const { data: taskRows, error: taskError } = await taskQuery;
  if (taskError) return json({ error: "TASK_LOOKUP_FAILED", detail: taskError.message }, 500);
  const task = taskRows?.[0];
  if (!task) return json({ error: "TASK_NOT_FOUND_OR_NOT_OWNED" }, 404);

  providerTaskId = providerTaskId || String(task.provider_task_id || "").trim();
  if (!providerTaskId) return json({ error: "PROVIDER_TASK_ID_MISSING" }, 400);

  try {
    const arkPayload = await queryArk(providerTaskId, arkKey);
    const result = await syncTaskFromArk(
      task,
      arkPayload,
      databaseAdapter(admin, user.id),
    );
    return json({
      ok: true,
      task_id: task.id,
      provider_task_id: providerTaskId,
      raw_status: result.rawStatus,
      status: result.status,
      progress: result.progress,
      error_message: result.errorMessage || null,
      video_url_ready: Boolean(result.videoUrl),
      video_url: result.videoUrl || null,
      output_id: result.output?.id || null,
    });
  } catch (error) {
    return json({
      error: "ARK_STATUS_QUERY_FAILED",
      detail: error instanceof Error ? error.message : String(error),
      provider_task_id: providerTaskId,
      retryable: true,
    }, 502);
  }
});
