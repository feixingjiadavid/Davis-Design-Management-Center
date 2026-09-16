import { createClient } from "npm:@supabase/supabase-js@2";

const BUILD = "20260916-supabase-primary-v1";
const BUCKET = "seedance-outputs";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DRIVE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ build: BUILD, ...body }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function metaOf(row: any) {
  return row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function realDriveId(row: any) {
  const meta = metaOf(row);
  const value = String(
    row?.google_drive_file_id || meta.google_drive_file_id || meta.googleDriveFileId || "",
  ).trim();
  return value && !value.startsWith("supabase:") ? value : "";
}

function providerUrl(row: any) {
  const meta = metaOf(row);
  return String(meta.provider_video_url || "").trim();
}

function primaryPath(row: any) {
  const meta = metaOf(row);
  return String(
    (row?.bucket_id === BUCKET ? row?.storage_path : "") || meta.supabase_path || "",
  ).trim();
}

function primaryReady(row: any) {
  const meta = metaOf(row);
  return row?.bucket_id === BUCKET && Boolean(primaryPath(row)) &&
    String(meta.primary_storage_status || "").toLowerCase() === "completed";
}

function primaryExpired(row: any, nowMs = Date.now()) {
  const expires = Date.parse(String(metaOf(row).primary_storage_expires_at || ""));
  return Number.isFinite(expires) && expires <= nowMs;
}

function encodeObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function streamProviderToSupabase(
  supabaseUrl: string,
  serviceKey: string,
  videoUrl: string,
  path: string,
) {
  const source = await fetch(videoUrl, { method: "GET", redirect: "follow" });
  if (!source.ok || !source.body) {
    const detail = await source.text().catch(() => "");
    throw new Error(`PROVIDER_VIDEO_DOWNLOAD_FAILED: HTTP ${source.status} ${detail.slice(0, 500)}`);
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": source.headers.get("content-type") || "video/mp4",
    "x-upsert": "true",
    "cache-control": "604800",
  };
  const length = source.headers.get("content-length");
  if (length) headers["Content-Length"] = length;

  const target = `${supabaseUrl}/storage/v1/object/${BUCKET}/${encodeObjectPath(path)}`;
  const response = await fetch(target, { method: "POST", headers, body: source.body });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`SUPABASE_PRIMARY_UPLOAD_FAILED: HTTP ${response.status} ${detail.slice(0, 800)}`);
  }
}

async function resolveRefreshToken(admin: any) {
  const { data, error } = await admin.rpc("get_seedance_google_refresh_token");
  if (!error && String(data || "").trim()) return String(data).trim();
  return String(Deno.env.get("GOOGLE_REFRESH_TOKEN") || "").trim();
}

async function googleAccessToken(admin: any) {
  const clientId = String(Deno.env.get("GOOGLE_CLIENT_ID") || "").trim();
  const clientSecret = String(Deno.env.get("GOOGLE_CLIENT_SECRET") || "").trim();
  const refreshToken = await resolveRefreshToken(admin);
  if (!clientId || !clientSecret || !refreshToken) throw new Error("GOOGLE_OAUTH_SECRETS_MISSING");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(DRIVE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text().catch(() => "");
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
  if (!response.ok || !payload.access_token) {
    throw new Error(`GOOGLE_ACCESS_TOKEN_FAILED: HTTP ${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return String(payload.access_token);
}

async function backupSupabaseObjectToDrive(
  admin: any,
  supabaseUrl: string,
  serviceKey: string,
  row: any,
) {
  const folderId = String(
    Deno.env.get("GOOGLE_DRIVE_FOLDER_ID") || Deno.env.get("GDRIVE_FOLDER_ID") || Deno.env.get("GOOGLE_FOLDER_ID") || "",
  ).trim();
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID_MISSING");
  const accessToken = await googleAccessToken(admin);
  const name = `${String(row?.task_id || row?.id || "seedance-video").replace(/[^a-zA-Z0-9._-]+/g, "-")}.mp4`;
  const initResponse = await fetch(
    `${DRIVE_UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,thumbnailLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        name,
        mimeType: "video/mp4",
        parents: [folderId],
        appProperties: {
          davis_video_output_id: String(row.id),
          seedance_task_id: String(row.task_id || ""),
        },
      }),
    },
  );
  if (!initResponse.ok) {
    const detail = await initResponse.text().catch(() => "");
    throw new Error(`GOOGLE_DRIVE_UPLOAD_INIT_FAILED: HTTP ${initResponse.status} ${detail.slice(0, 800)}`);
  }
  const uploadUrl = initResponse.headers.get("location");
  if (!uploadUrl) throw new Error("GOOGLE_DRIVE_RESUMABLE_LOCATION_MISSING");

  const path = primaryPath(row);
  if (!path) throw new Error("SUPABASE_PRIMARY_PATH_MISSING");
  const source = await fetch(
    `${supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/${encodeObjectPath(path)}`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  );
  if (!source.ok || !source.body) {
    const detail = await source.text().catch(() => "");
    throw new Error(`SUPABASE_PRIMARY_DOWNLOAD_FAILED: HTTP ${source.status} ${detail.slice(0, 500)}`);
  }
  const uploadHeaders: Record<string, string> = {
    "Content-Type": source.headers.get("content-type") || "video/mp4",
  };
  const length = source.headers.get("content-length");
  if (length) uploadHeaders["Content-Length"] = length;
  const uploaded = await fetch(uploadUrl, { method: "PUT", headers: uploadHeaders, body: source.body });
  const text = await uploaded.text().catch(() => "");
  let file: any = {};
  try { file = text ? JSON.parse(text) : {}; } catch { file = { message: text }; }
  if (!uploaded.ok || !file.id) {
    throw new Error(`GOOGLE_DRIVE_UPLOAD_FAILED: HTTP ${uploaded.status} ${JSON.stringify(file).slice(0, 800)}`);
  }
  return file;
}

async function markTaskSucceeded(admin: any, row: any, nowIso: string) {
  if (row.task_id) {
    await admin.from("video_tasks").update({
      status: "succeeded",
      progress: 100,
      error_message: null,
      completed_at: nowIso,
      updated_at: nowIso,
    }).eq("id", row.task_id);
  }
  if (row.segment_id) {
    await admin.from("video_segments").update({ status: "succeeded", updated_at: nowIso })
      .eq("id", row.segment_id).eq("owner_id", row.owner_id);
  }
  if (row.task_id) {
    await admin.from("video_provider_policy_events").update({
      outcome: "success",
      updated_at: nowIso,
    }).eq("task_id", row.task_id);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceKey) return json({ error: "SERVER_ENV_MISSING" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const candidate = req.headers.get("x-seedance-worker-secret") || "";
  const { data: allowed, error: authError } = await admin.rpc("validate_seedance_worker_secret", { candidate });
  if (authError || allowed !== true) return json({ error: "UNAUTHORIZED_WORKER" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const limit = Math.max(1, Math.min(25, Number(body.limit || 10) || 10));
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const { data: rows, error: scanError } = await admin.from("video_outputs").select("*")
    .order("created_at", { ascending: false }).limit(150);
  if (scanError) return json({ error: "OUTPUT_SCAN_FAILED", detail: scanError.message }, 500);

  const primaryCandidates = (rows || []).filter((row: any) => {
    if (!providerUrl(row)) return false;
    if (primaryReady(row)) return false;
    const status = String(row.storage_status || row.status || "").toLowerCase();
    return row.bucket_id === "ark-url" || ["primary_pending", "drive_failed", "failed"].includes(status);
  }).slice(0, limit);

  const primaryResults: any[] = [];
  for (const row of primaryCandidates) {
    const path = `outputs/${row.owner_id}/${row.id}.mp4`;
    try {
      await streamProviderToSupabase(supabaseUrl, serviceKey, providerUrl(row), path);
      const expiresAt = new Date(Date.now() + RETENTION_MS).toISOString();
      const metadata = {
        ...metaOf(row),
        storage_backend: "supabase_primary",
        supabase_bucket: BUCKET,
        supabase_path: path,
        primary_storage_status: "completed",
        primary_storage_saved_at: nowIso,
        primary_storage_expires_at: expiresAt,
        google_drive_backup_status: realDriveId(row) ? "completed" : "pending",
      };
      const { data: updated, error: updateError } = await admin.from("video_outputs").update({
        bucket_id: BUCKET,
        storage_path: path,
        metadata,
        status: "completed",
        storage_status: "completed",
        storage_error: null,
        storage_updated_at: nowIso,
        storage_next_retry_at: null,
        google_drive_file_id: realDriveId(row) || `supabase:${row.id}`,
      }).eq("id", row.id).select("*").single();
      if (updateError) throw new Error(`PRIMARY_PERSIST_FAILED: ${updateError.message}`);
      await markTaskSucceeded(admin, row, nowIso);
      primaryResults.push({ output_id: row.id, status: "completed", path, expires_at: expiresAt });
      Object.assign(row, updated || {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin.from("video_outputs").update({
        status: "primary_failed",
        storage_status: "primary_pending",
        storage_error: message,
        storage_updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      primaryResults.push({ output_id: row.id, status: "primary_pending", error: message });
    }
  }

  const refreshed = await admin.from("video_outputs").select("*")
    .eq("bucket_id", BUCKET).order("created_at", { ascending: false }).limit(150);
  const currentRows = refreshed.data || [];
  const driveCandidates = currentRows.filter((row: any) => {
    if (!primaryReady(row) || realDriveId(row)) return false;
    const meta = metaOf(row);
    const retryAt = Date.parse(String(meta.google_drive_next_retry_at || ""));
    return !Number.isFinite(retryAt) || retryAt <= nowMs;
  }).slice(0, Math.min(limit, 3));

  const driveResults: any[] = [];
  for (const row of driveCandidates) {
    try {
      const file = await backupSupabaseObjectToDrive(admin, supabaseUrl, serviceKey, row);
      const driveUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
      const thumbnailUrl = file.thumbnailLink || `https://drive.google.com/thumbnail?id=${file.id}&sz=w640`;
      const metadata = {
        ...metaOf(row),
        google_drive_backup_status: "completed",
        google_drive_file_id: file.id,
        google_drive_url: driveUrl,
        google_drive_thumbnail_url: thumbnailUrl,
        google_drive_synced_at: nowIso,
        google_drive_next_retry_at: null,
        google_drive_last_error: null,
      };
      await admin.from("video_outputs").update({
        metadata,
        google_drive_file_id: file.id,
        google_drive_url: driveUrl,
        google_drive_thumbnail_url: thumbnailUrl,
        google_drive_synced_at: nowIso,
      }).eq("id", row.id);
      driveResults.push({ output_id: row.id, status: "completed", drive_file_id: file.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const longRetry = /invalid_grant|expired or revoked/i.test(message);
      const retryAt = new Date(Date.now() + (longRetry ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000)).toISOString();
      await admin.from("video_outputs").update({
        metadata: {
          ...metaOf(row),
          google_drive_backup_status: "failed",
          google_drive_last_error: message,
          google_drive_last_attempt_at: nowIso,
          google_drive_next_retry_at: retryAt,
        },
      }).eq("id", row.id);
      driveResults.push({ output_id: row.id, status: "failed", error: message, retry_at: retryAt });
    }
  }

  const cleanupCandidates = currentRows.filter((row: any) =>
    primaryReady(row) && primaryExpired(row, nowMs) && Boolean(realDriveId(row))
  ).slice(0, limit);
  const cleanupResults: any[] = [];
  for (const row of cleanupCandidates) {
    try {
      const path = primaryPath(row);
      if (path) {
        const { error } = await admin.storage.from(BUCKET).remove([path]);
        if (error) throw new Error(error.message);
      }
      const driveId = realDriveId(row);
      await admin.from("video_outputs").update({
        bucket_id: "google-drive",
        storage_path: `drive://${driveId}`,
        metadata: {
          ...metaOf(row),
          storage_backend: "google_drive",
          primary_storage_status: "expired",
          primary_storage_deleted_at: new Date().toISOString(),
        },
        status: "completed",
        storage_status: "completed",
        storage_error: null,
        storage_updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      cleanupResults.push({ output_id: row.id, status: "deleted_from_supabase" });
    } catch (error) {
      cleanupResults.push({ output_id: row.id, status: "cleanup_failed", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return json({
    ok: true,
    primary_processed: primaryResults,
    drive_backup_processed: driveResults,
    cleanup_processed: cleanupResults,
  });
});
