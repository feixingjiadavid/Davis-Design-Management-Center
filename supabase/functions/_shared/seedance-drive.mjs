import { classifyDriveFailure } from "./seedance-drive-policy.mjs";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const UPLOAD_STALE_MS = 15 * 60 * 1000;

function envFirst(names) {
  for (const name of names) {
    const value = (Deno.env.get(name) || "").trim();
    if (value) return value;
  }
  return "";
}

async function readJsonSafe(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

export function providerVideoUrlFromPayload(payload) {
  if (!payload) return "";
  if (typeof payload === "string") {
    return /^https?:\/\//i.test(payload) && /\.(mp4|mov|webm)(\?|#|$)/i.test(payload) ? payload : "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = providerVideoUrlFromPayload(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload === "object") {
    for (const key of ["video_url", "file_url", "output_url", "download_url"]) {
      const found = providerVideoUrlFromPayload(payload[key]);
      if (found) return found;
    }
    for (const value of Object.values(payload)) {
      const found = providerVideoUrlFromPayload(value);
      if (found) return found;
    }
  }
  return "";
}

export function googleDriveConfigStatus() {
  return {
    client_id: Boolean(envFirst(["GOOGLE_CLIENT_ID"])),
    client_secret: Boolean(envFirst(["GOOGLE_CLIENT_SECRET"])),
    refresh_token: Boolean(envFirst(["GOOGLE_REFRESH_TOKEN"])),
    folder_id: Boolean(envFirst(["GOOGLE_DRIVE_FOLDER_ID", "GDRIVE_FOLDER_ID", "GOOGLE_FOLDER_ID"])),
  };
}

async function resolveGoogleRefreshToken(admin) {
  if (admin?.rpc) {
    const { data, error } = await admin.rpc("get_seedance_google_refresh_token");
    if (!error && String(data || "").trim()) return String(data).trim();
    if (error) {
      console.error(JSON.stringify({
        event: "seedance_google_refresh_token_vault_read_failed",
        message: error.message,
      }));
    }
  }
  return envFirst(["GOOGLE_REFRESH_TOKEN"]);
}

async function getGoogleAccessToken(admin) {
  const clientId = envFirst(["GOOGLE_CLIENT_ID"]);
  const clientSecret = envFirst(["GOOGLE_CLIENT_SECRET"]);
  const refreshToken = await resolveGoogleRefreshToken(admin);
  if (!clientId || !clientSecret || !refreshToken) throw new Error("GOOGLE_OAUTH_SECRETS_MISSING");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await readJsonSafe(response);
  if (!response.ok || !data.access_token) {
    throw new Error("GOOGLE_ACCESS_TOKEN_FAILED: HTTP " + response.status + " " + JSON.stringify(data).slice(0, 500));
  }
  return String(data.access_token);
}

function safeFileName(providerTaskId, outputId) {
  const base = String(providerTaskId || outputId || "seedance-video").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return base.toLowerCase().endsWith(".mp4") ? base : base + ".mp4";
}

async function uploadVideoToGoogleDrive(videoUrl, context) {
  const accessToken = await getGoogleAccessToken(context.admin);
  const folderId = envFirst(["GOOGLE_DRIVE_FOLDER_ID", "GDRIVE_FOLDER_ID", "GOOGLE_FOLDER_ID"]);
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID_MISSING");

  const name = safeFileName(context.providerTaskId, context.outputId);
  const metadata = {
    name,
    mimeType: "video/mp4",
    parents: [folderId],
    appProperties: {
      davis_video_output_id: String(context.outputId || ""),
      seedance_task_id: String(context.providerTaskId || ""),
    },
  };
  const initUrl = DRIVE_UPLOAD_URL +
    "?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink,parents";
  const initResponse = await fetch(initUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(metadata),
  });
  if (!initResponse.ok) {
    const detail = await initResponse.text().catch(() => "");
    throw new Error("GOOGLE_DRIVE_UPLOAD_INIT_FAILED: HTTP " + initResponse.status + " " + detail.slice(0, 800));
  }
  const uploadUrl = initResponse.headers.get("location");
  if (!uploadUrl) throw new Error("GOOGLE_DRIVE_RESUMABLE_LOCATION_MISSING");

  const sourceResponse = await fetch(videoUrl, { method: "GET", redirect: "follow" });
  if (!sourceResponse.ok || !sourceResponse.body) {
    const detail = await sourceResponse.text().catch(() => "");
    throw new Error("SEEDANCE_VIDEO_DOWNLOAD_FAILED: HTTP " + sourceResponse.status + " " + detail.slice(0, 500));
  }

  const uploadHeaders = { "Content-Type": sourceResponse.headers.get("content-type") || "video/mp4" };
  const contentLength = sourceResponse.headers.get("content-length");
  if (contentLength) uploadHeaders["Content-Length"] = contentLength;
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: uploadHeaders,
    body: sourceResponse.body,
  });
  const file = await readJsonSafe(uploadResponse);
  if (!uploadResponse.ok || !file.id) {
    throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED: HTTP " + uploadResponse.status + " " + JSON.stringify(file).slice(0, 800));
  }
  return file;
}

function existingDriveFileId(output) {
  const meta = output?.metadata || {};
  return String(
    output?.google_drive_file_id ||
    meta.google_drive_file_id || meta.googleDriveFileId ||
    meta.drive_file_id || meta.driveFileId || ""
  ).trim();
}

function providerUrlFromOutput(output) {
  const meta = output?.metadata || {};
  return String(meta.provider_video_url || providerVideoUrlFromPayload(meta.ark_response) || "").trim();
}

export async function syncOutputToGoogleDrive(admin, outputId, options = {}) {
  const { data: current, error: readError } = await admin.from("video_outputs")
    .select("*").eq("id", outputId).maybeSingle();
  if (readError) throw new Error("VIDEO_OUTPUT_LOOKUP_FAILED: " + readError.message);
  if (!current) throw new Error("VIDEO_OUTPUT_NOT_FOUND");

  const existingId = existingDriveFileId(current);
  if (existingId) {
    const driveUrl = current.google_drive_url || "https://drive.google.com/file/d/" + existingId + "/view";
    const thumbnailUrl = current.google_drive_thumbnail_url ||
      "https://drive.google.com/thumbnail?id=" + existingId + "&sz=w640";
    if (current.storage_status !== "completed" || current.status !== "completed") {
      await admin.from("video_outputs").update({
        google_drive_file_id: existingId,
        google_drive_url: driveUrl,
        google_drive_thumbnail_url: thumbnailUrl,
        status: "completed",
        storage_status: "completed",
        storage_error: null,
        storage_updated_at: new Date().toISOString(),
        google_drive_synced_at: current.google_drive_synced_at || new Date().toISOString(),
      }).eq("id", current.id);
    }
    return { storage_status: "completed", google_drive_file_id: existingId, google_drive_url: driveUrl, google_drive_thumbnail_url: thumbnailUrl };
  }

  const now = new Date();
  const currentStatus = String(current.storage_status || "pending").toLowerCase();
  const lastUpdate = Date.parse(current.storage_updated_at || current.created_at || "");
  if (currentStatus === "uploading" && Number.isFinite(lastUpdate) && now.getTime() - lastUpdate < UPLOAD_STALE_MS) {
    return { storage_status: "uploading", google_drive_file_id: null };
  }
  const nextRetry = Date.parse(current.storage_next_retry_at || "");
  if (!options.force && currentStatus === "failed" && Number.isFinite(nextRetry) && nextRetry > now.getTime()) {
    return { storage_status: "failed", retry_at: current.storage_next_retry_at, google_drive_file_id: null };
  }

  const attempts = Number(current.storage_attempts || 0) + 1;
  const { data: claimed, error: claimError } = await admin.from("video_outputs").update({
    status: "uploading_drive",
    storage_status: "uploading",
    storage_error: null,
    storage_attempts: attempts,
    storage_updated_at: now.toISOString(),
    storage_next_retry_at: null,
  }).eq("id", current.id).eq("storage_status", current.storage_status || "pending").select("*").maybeSingle();
  if (claimError) throw new Error("VIDEO_OUTPUT_CLAIM_FAILED: " + claimError.message);
  if (!claimed) return { storage_status: "uploading", google_drive_file_id: null };

  const providerTaskId = String(options.providerTaskId || claimed.metadata?.provider_task_id || "").trim();
  const videoUrl = String(options.videoUrl || providerUrlFromOutput(claimed)).trim();
  try {
    if (!videoUrl) throw new Error("SEEDANCE_VIDEO_URL_MISSING");
    const file = await uploadVideoToGoogleDrive(videoUrl, {
      admin,
      outputId: claimed.id,
      providerTaskId,
    });
    const driveUrl = file.webViewLink || "https://drive.google.com/file/d/" + file.id + "/view";
    const thumbnailUrl = file.thumbnailLink || "https://drive.google.com/thumbnail?id=" + file.id + "&sz=w640";
    const metadata = {
      ...(claimed.metadata || {}),
      storage_backend: "google_drive",
      google_drive_backup_status: "completed",
      google_drive_file_id: file.id,
      google_drive_url: driveUrl,
      google_drive_thumbnail_url: thumbnailUrl,
      google_drive_name: file.name || safeFileName(providerTaskId, claimed.id),
      google_drive_synced_at: now.toISOString(),
    };
    const { error: updateError } = await admin.from("video_outputs").update({
      bucket_id: "google-drive",
      storage_path: "drive://" + file.id,
      metadata,
      google_drive_file_id: file.id,
      google_drive_url: driveUrl,
      google_drive_thumbnail_url: thumbnailUrl,
      status: "completed",
      storage_status: "completed",
      storage_error: null,
      storage_updated_at: now.toISOString(),
      storage_next_retry_at: null,
      google_drive_synced_at: now.toISOString(),
    }).eq("id", claimed.id);
    if (updateError) throw new Error("VIDEO_OUTPUT_DRIVE_PERSIST_FAILED: " + updateError.message);
    const { error: auditError } = await admin.from("video_operation_logs").insert({
      owner_id: claimed.owner_id,
      action: "seedance_drive_sync_completed",
      target_type: "video_output",
      target_id: claimed.id,
      detail: {
        project_id: claimed.project_id,
        segment_id: claimed.segment_id,
        provider_task_id: providerTaskId,
        drive_file_id: file.id,
        drive_url: driveUrl,
        attempts,
        final_status: "completed",
      },
    });
    if (auditError) {
      console.error(JSON.stringify({
        event: "seedance_drive_audit_failed",
        output_id: claimed.id,
        detail: auditError.message,
      }));
    }
    return { storage_status: "completed", public_status: "completed", google_drive_file_id: file.id, google_drive_url: driveUrl, google_drive_thumbnail_url: thumbnailUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = classifyDriveFailure(message, attempts, Date.now());
    const failedMetadata = {
      ...(claimed.metadata || {}),
      storage_backend: "google_drive_failed",
      google_drive_backup_status: "failed",
      google_drive_failure_code: failure.code,
      storage_terminal: failure.terminal,
      google_drive_last_error: message,
      google_drive_last_attempt_at: now.toISOString(),
    };
    await admin.from("video_outputs").update({
      metadata: failedMetadata,
      status: failure.publicStatus,
      storage_status: "failed",
      storage_error: failure.code + ": " + message,
      storage_updated_at: now.toISOString(),
      storage_next_retry_at: failure.nextRetryAt,
    }).eq("id", claimed.id);
    const { error: auditError } = await admin.from("video_operation_logs").insert({
      owner_id: claimed.owner_id,
      action: "seedance_drive_sync_failed",
      target_type: "video_output",
      target_id: claimed.id,
      detail: {
        project_id: claimed.project_id,
        segment_id: claimed.segment_id,
        provider_task_id: providerTaskId,
        drive_status: failure.publicStatus,
        error_code: failure.code,
        error_message: message,
        attempts,
        terminal: failure.terminal,
        next_retry_at: failure.nextRetryAt,
      },
    });
    if (auditError) {
      console.error(JSON.stringify({
        event: "seedance_drive_audit_failed",
        output_id: claimed.id,
        detail: auditError.message,
      }));
    }
    return {
      storage_status: "failed",
      public_status: failure.publicStatus,
      storage_error: failure.code + ": " + message,
      retry_at: failure.nextRetryAt,
      terminal: failure.terminal,
      google_drive_file_id: null,
    };

  }
}
