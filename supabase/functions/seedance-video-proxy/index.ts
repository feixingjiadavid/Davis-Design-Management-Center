import { createClient } from "npm:@supabase/supabase-js@2";

const BUILD = "20260916-supabase-primary-proxy-v28";
const PRIMARY_BUCKET = "seedance-outputs";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type, Content-Disposition, X-Seedance-Source",
};

type AnyMap = Record<string, any>;

function json(body: AnyMap, status = 200) {
  return new Response(JSON.stringify({ build: BUILD, ...body }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function readJsonSafe(response: Response): Promise<any> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { text }; }
}

function metadata(row: any) {
  return row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function googleDriveFileIdFromOutput(row: any): string {
  const meta = metadata(row);
  const value = String(
    row?.google_drive_file_id ||
    meta.google_drive_file_id || meta.googleDriveFileId || meta.drive_file_id || meta.driveFileId || ""
  ).trim();
  return value.startsWith("supabase:") ? "" : value;
}

function supabasePrimaryPath(row: any) {
  const meta = metadata(row);
  return String(
    (row?.bucket_id === PRIMARY_BUCKET ? row?.storage_path : "") || meta.supabase_path || ""
  ).trim();
}

function primaryIsReady(row: any) {
  const meta = metadata(row);
  const path = supabasePrimaryPath(row);
  const status = String(meta.primary_storage_status || "").toLowerCase();
  return Boolean(path) && (row?.bucket_id === PRIMARY_BUCKET || meta.supabase_bucket === PRIMARY_BUCKET) && status === "completed";
}

function primaryIsExpired(row: any) {
  const expiresAt = Date.parse(String(metadata(row).primary_storage_expires_at || ""));
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function copyStreamHeaders(response: Response, source: string, filename: string) {
  const outHeaders: Record<string, string> = {
    ...CORS,
    "Content-Type": response.headers.get("content-type") || "video/mp4",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": response.headers.get("accept-ranges") || "bytes",
    "X-Seedance-Source": source,
  };
  const contentLength = response.headers.get("content-length");
  const contentRange = response.headers.get("content-range");
  if (contentLength) outHeaders["Content-Length"] = contentLength;
  if (contentRange) outHeaders["Content-Range"] = contentRange;
  return outHeaders;
}

async function streamSupabasePrimary(
  supabaseUrl: string,
  serviceKey: string,
  row: any,
  req: Request,
): Promise<Response> {
  const path = supabasePrimaryPath(row);
  if (!path) return json({ error: "SUPABASE_PRIMARY_PATH_MISSING" }, 404);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };
  const range = req.headers.get("Range");
  if (range) headers.Range = range;
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/authenticated/${PRIMARY_BUCKET}/${encoded}`,
    { method: "GET", headers },
  );
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    return json({ error: "SUPABASE_PRIMARY_FETCH_FAILED", status: response.status, detail: detail.slice(0, 800) }, response.status || 502);
  }
  return new Response(response.body, {
    status: response.status,
    headers: copyStreamHeaders(response, "supabase", `seedance-${row.id}.mp4`),
  });
}

async function resolveGoogleRefreshToken(admin: any): Promise<string> {
  const { data, error } = await admin.rpc("get_seedance_google_refresh_token");
  if (!error && String(data || "").trim()) return String(data).trim();
  return String(Deno.env.get("GOOGLE_REFRESH_TOKEN") || "").trim();
}

async function getGoogleAccessToken(admin: any): Promise<string> {
  const clientId = (Deno.env.get("GOOGLE_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("GOOGLE_CLIENT_SECRET") || "").trim();
  const refreshToken = await resolveGoogleRefreshToken(admin);
  if (!clientId || !clientSecret || !refreshToken) throw new Error("GOOGLE_SECRETS_MISSING");

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await readJsonSafe(response);
  if (!response.ok || !data?.access_token) {
    throw new Error(`GOOGLE_ACCESS_TOKEN_FAILED: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  return String(data.access_token);
}

async function streamGoogleDriveFile(admin: any, fileId: string, req: Request): Promise<Response> {
  const accessToken = await getGoogleAccessToken(admin);
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  const range = req.headers.get("Range");
  if (range) headers.Range = range;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    method: "GET",
    headers,
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    return json({ error: "GOOGLE_DRIVE_FETCH_FAILED", status: response.status, detail: detail.slice(0, 800) }, response.status || 502);
  }
  return new Response(response.body, {
    status: response.status,
    headers: copyStreamHeaders(response, "google-drive", `seedance-${fileId}.mp4`),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "SUPABASE_ENV_MISSING" }, 500);

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "NO_AUTH_TOKEN" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return json({ error: "INVALID_AUTH_TOKEN", detail: userError?.message || null }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const url = new URL(req.url);
  const outputId = (url.searchParams.get("output_id") || url.searchParams.get("outputId") || "").trim();
  const providerTaskId = (url.searchParams.get("provider_task_id") || url.searchParams.get("providerTaskId") || "").trim();
  const taskId = (url.searchParams.get("task_id") || url.searchParams.get("taskId") || "").trim();

  let outputRow: any = null;
  if (outputId) {
    const { data, error } = await userClient.from("video_outputs").select("*").eq("id", outputId).maybeSingle();
    if (error) return json({ error: "OUTPUT_LOOKUP_FAILED", detail: error.message }, 500);
    outputRow = data;
  }
  if (!outputRow && taskId) {
    const { data } = await userClient.from("video_outputs").select("*").eq("task_id", taskId).order("created_at", { ascending: false }).limit(1);
    outputRow = data?.[0] || null;
  }
  if (!outputRow && providerTaskId) {
    const { data } = await userClient.from("video_outputs").select("*")
      .or(`storage_path.eq.ark://${providerTaskId}.mp4,metadata->>provider_task_id.eq.${providerTaskId}`)
      .order("created_at", { ascending: false }).limit(1);
    outputRow = data?.[0] || null;
  }
  if (!outputRow) return json({ error: "OUTPUT_NOT_FOUND_OR_NOT_OWNED" }, 404);

  if (primaryIsReady(outputRow) && !primaryIsExpired(outputRow)) {
    return await streamSupabasePrimary(supabaseUrl, serviceKey, outputRow, req);
  }

  const driveFileId = googleDriveFileIdFromOutput(outputRow);
  if (driveFileId) return await streamGoogleDriveFile(admin, driveFileId, req);

  return json({
    error: primaryIsExpired(outputRow) ? "DRIVE_BACKUP_REQUIRED_AFTER_RETENTION" : "OUTPUT_NOT_READY",
    output_id: outputRow.id,
    storage_status: outputRow.storage_status || outputRow.status || "pending",
    message: primaryIsExpired(outputRow)
      ? "Supabase 7 天主存储期已结束，但 Google Drive 备份尚未可用。"
      : "视频正在写入 Supabase 主存储，请稍后重试。",
  }, 409);
});
