import { createClient } from "npm:@supabase/supabase-js@2";

const BUILD = "20260731-database-first-status-v47";
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

async function bodyOf(req: Request) {
  if (req.method !== "POST") return {};
  try { return await req.json(); } catch { return {}; }
}

function publicStatus(task: any, output: any) {
  const taskStatus = String(task?.status || "queued").toLowerCase();
  const storageStatus = String(output?.storage_status || "").toLowerCase();
  if (storageStatus === "completed" && output?.google_drive_file_id) return "completed";
  if (taskStatus === "provider_policy_blocked") return "provider_policy_blocked";
  if (taskStatus === "drive_sync_failed" ||
      (storageStatus === "failed" && output?.metadata?.storage_terminal === true)) {
    return "drive_sync_failed";
  }
  if (["processing", "uploading_drive"].includes(taskStatus) ||
      ["pending", "uploading"].includes(storageStatus)) {
    return "uploading_drive";
  }
  if (["failed", "provider_error", "provider_failed"].includes(taskStatus)) {
    return "provider_error";
  }
  if (!task?.provider_task_id) return "pending";
  return "generating";
}

function publicMessage(status: string) {
  if (status === "provider_policy_blocked") {
    return "当前视频模型对该真人参考图片进行了安全限制。素材和项目已保存，你可以更换参考图片后重新生成。";
  }
  if (status === "uploading_drive") return "视频正在同步云端";
  if (status === "drive_sync_failed") return "视频已生成，但同步云端失败。系统已保留记录，可稍后恢复。";
  if (status === "provider_error") return "视频模型未能完成本次生成，请稍后重试。";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "SERVER_ENV_MISSING" }, 500);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "NO_AUTH_TOKEN" }, 401);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return json({ error: "INVALID_AUTH_TOKEN" }, 401);

  const url = new URL(req.url);
  const body = await bodyOf(req);
  const providerTaskId = String(
    url.searchParams.get("provider_task_id") || body.provider_task_id || ""
  ).trim();
  const localTaskId = String(
    url.searchParams.get("task_id") || url.searchParams.get("id") ||
    body.task_id || body.id || ""
  ).trim();
  if (!providerTaskId && !localTaskId) return json({ error: "MISSING_TASK_ID" }, 400);

  let query = admin.from("video_tasks").select("*").eq("owner_id", user.id).limit(1);
  query = providerTaskId
    ? query.eq("provider_task_id", providerTaskId)
    : query.eq("id", localTaskId);
  const { data: tasks, error: taskError } = await query;
  if (taskError) return json({ error: "TASK_LOOKUP_FAILED" }, 500);
  const task = tasks?.[0];
  if (!task) return json({ error: "TASK_NOT_FOUND_OR_NOT_OWNED" }, 404);

  const { data: outputs, error: outputError } = await admin.from("video_outputs")
    .select("id,status,storage_status,storage_error,google_drive_file_id,google_drive_url,google_drive_thumbnail_url,google_drive_synced_at,metadata,created_at")
    .eq("owner_id", user.id).eq("task_id", task.id)
    .order("created_at", { ascending: false }).limit(1);
  if (outputError) return json({ error: "OUTPUT_LOOKUP_FAILED" }, 500);
  const output = outputs?.[0] || null;
  const statusValue = publicStatus(task, output);

  return json({
    ok: true,
    task_id: task.id,
    provider_task_id: task.provider_task_id || null,
    status: statusValue,
    progress: statusValue === "completed" ? 100 : Number(task.progress || 0),
    error_message: publicMessage(statusValue),
    submission_pending: !task.provider_task_id && statusValue === "pending",
    video_url_ready: statusValue === "completed",
    output_id: output?.id || null,
    storage_status: output?.storage_status ||
      (statusValue === "uploading_drive" ? "pending" : null),
    google_drive_file_id: output?.google_drive_file_id || null,
    google_drive_url: output?.google_drive_url || null,
    google_drive_thumbnail_url: output?.google_drive_thumbnail_url || null,
    google_drive_synced_at: output?.google_drive_synced_at || null,
  });
});
