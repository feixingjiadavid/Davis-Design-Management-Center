import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyCallbackSignature } from "../_shared/seedance-callback-auth.mjs";
import { normalizeArkResult } from "../_shared/seedance-status-core.mjs";

const BUILD = "20260731-seedance-callback-v2";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ build: BUILD, ...body }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const url = new URL(req.url);
  const taskId = String(url.searchParams.get("task_id") || "").trim();
  const signature = String(url.searchParams.get("signature") || "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const secret = Deno.env.get("SEEDANCE_CALLBACK_SECRET") || serviceRoleKey;
  if (!taskId || !signature || !secret ||
      !await verifyCallbackSignature(taskId, signature, secret)) {
    return json({ error: "INVALID_CALLBACK_SIGNATURE" }, 401);
  }

  if (!supabaseUrl || !serviceRoleKey) return json({ error: "SERVER_ENV_MISSING" }, 500);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: task, error: taskError } = await admin.from("video_tasks")
    .select("*").eq("id", taskId).maybeSingle();
  if (taskError) return json({ error: "TASK_LOOKUP_FAILED" }, 500);
  if (!task) return json({ error: "TASK_NOT_FOUND" }, 404);

  const providerTaskId = String(
    (payload as any).id || (payload as any).task_id ||
    task.provider_task_id || ""
  ).trim();
  if (task.provider_task_id && providerTaskId &&
      String(task.provider_task_id) !== providerTaskId) {
    return json({ error: "PROVIDER_TASK_MISMATCH" }, 409);
  }

  const nowIso = new Date().toISOString();
  const result = normalizeArkResult(payload, task.progress);
  const metadata = {
    ...(task.metadata || {}),
    callback_received_at: nowIso,
    callback_raw_status: String((payload as any).status || ""),
    provider_request_id:
      (payload as any).request_id || (payload as any).requestId ||
      task.metadata?.provider_request_id || null,
  };

  if (result.status === "succeeded" && result.videoUrl) {
    const { data: existingOutput } = await admin.from("video_outputs")
      .select("*").eq("task_id", task.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const outputPatch = {
      bucket_id: existingOutput?.bucket_id || "ark-url",
      storage_path: existingOutput?.storage_path ||
        ("ark://" + (providerTaskId || task.id) + ".mp4"),
      status: "pending",
      storage_status: "pending",
      storage_updated_at: nowIso,
      metadata: {
        ...(existingOutput?.metadata || {}),
        ark_response: payload,
        provider_task_id: providerTaskId || task.provider_task_id,
        provider_video_url: result.videoUrl,
        provider_video_url_refreshed_at: nowIso,
        storage_backend: "google_drive_pending",
      },
    };
    let outputError = null;
    if (existingOutput) {
      ({ error: outputError } = await admin.from("video_outputs")
        .update(outputPatch).eq("id", existingOutput.id));
    } else {
      ({ error: outputError } = await admin.from("video_outputs").insert({
        owner_id: task.owner_id,
        task_id: task.id,
        project_id: task.project_id,
        segment_id: task.segment_id,
        ...outputPatch,
      }));
    }
    if (outputError) return json({ error: "OUTPUT_QUEUE_FAILED" }, 500);

    await admin.from("video_tasks").update({
      provider_task_id: providerTaskId || task.provider_task_id,
      status: "processing",
      progress: 99,
      error_message: null,
      provider_response: payload,
      metadata,
      updated_at: nowIso,
    }).eq("id", task.id);
    if (task.segment_id) {
      await admin.from("video_segments").update({
        status: "processing", updated_at: nowIso,
      }).eq("id", task.segment_id).eq("owner_id", task.owner_id);
    }
    await admin.from("video_provider_policy_events").update({
      outcome: "provider_success",
      provider_request_id: metadata.provider_request_id,
      updated_at: nowIso,
    }).eq("task_id", task.id);
    return json({ ok: true, queued_drive_sync: true });
  }

  if (result.status === "failed") {
    await admin.from("video_tasks").update({
      status: "failed",
      progress: 0,
      error_message: "视频模型未能完成本次生成，请稍后重试。",
      provider_response: payload,
      metadata,
      completed_at: nowIso,
      updated_at: nowIso,
    }).eq("id", task.id);
    if (task.segment_id) {
      await admin.from("video_segments").update({
        status: "failed", updated_at: nowIso,
      }).eq("id", task.segment_id).eq("owner_id", task.owner_id);
    }
    await admin.from("video_provider_policy_events").update({
      outcome: "provider_error",
      provider_request_id: metadata.provider_request_id,
      provider_error_code: String((payload as any)?.error?.code || (payload as any)?.code || "provider_error"),
      updated_at: nowIso,
    }).eq("task_id", task.id);
    return json({ ok: true, failed: true });
  }

  await admin.from("video_tasks").update({
    provider_task_id: providerTaskId || task.provider_task_id,
    status: result.status === "running" ? "running" : "queued",
    progress: result.progress,
    provider_response: payload,
    metadata,
    updated_at: nowIso,
  }).eq("id", task.id);

  return json({ ok: true, status: result.status });
});
