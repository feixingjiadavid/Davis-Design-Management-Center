import { createClient } from "npm:@supabase/supabase-js@2";

const BUILD = "20260728-drive-only-proxy-v22";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type, Content-Disposition",
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

function googleDriveFileIdFromOutput(row: any): string {
  const meta = row?.metadata || {};
  return String(
    row?.google_drive_file_id ||
    meta.google_drive_file_id || meta.googleDriveFileId || meta.drive_file_id || meta.driveFileId || ""
  ).trim();
}

async function getGoogleAccessToken(): Promise<string> {
  const clientId = (Deno.env.get("GOOGLE_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("GOOGLE_CLIENT_SECRET") || "").trim();
  const refreshToken = (Deno.env.get("GOOGLE_REFRESH_TOKEN") || "").trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("GOOGLE_SECRETS_MISSING");

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("refresh_token", refreshToken);
  params.set("grant_type", "refresh_token");

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

async function streamGoogleDriveFile(fileId: string, req: Request): Promise<Response> {
  const accessToken = await getGoogleAccessToken();
  const headers: Record<string,string> = { Authorization: `Bearer ${accessToken}` };
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

  const outHeaders: Record<string,string> = {
    ...CORS,
    "Content-Type": response.headers.get("content-type") || "video/mp4",
    "Content-Disposition": `inline; filename="seedance-${fileId}.mp4"`,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": response.headers.get("accept-ranges") || "bytes",
  };
  for (const h of ["content-length", "content-range"]) {
    const v = response.headers.get(h);
    if (v) outHeaders[h.replace(/(^|-)./g, s => s.toUpperCase())] = v;
  }
  return new Response(response.body, { status: response.status, headers: outHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "SUPABASE_ENV_MISSING" }, 500);

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "NO_AUTH_TOKEN" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return json({ error: "INVALID_AUTH_TOKEN", detail: userError?.message || null }, 401);

  const url = new URL(req.url);
  const outputId = (url.searchParams.get("output_id") || url.searchParams.get("outputId") || "").trim();
  const providerTaskId = (url.searchParams.get("provider_task_id") || url.searchParams.get("providerTaskId") || "").trim();
  const taskId = (url.searchParams.get("task_id") || url.searchParams.get("taskId") || "").trim();

  let outputRow: any = null;

  if (outputId) {
    const { data, error } = await admin.from("video_outputs").select("*").eq("id", outputId).eq("owner_id", user.id).maybeSingle();
    if (error) return json({ error: "OUTPUT_LOOKUP_FAILED", detail: error.message }, 500);
    outputRow = data;
  }

  if (!outputRow && taskId) {
    const { data } = await admin.from("video_outputs").select("*").eq("owner_id", user.id).eq("task_id", taskId).order("created_at", { ascending: false }).limit(1);
    outputRow = data?.[0] || null;
  }

  if (!outputRow && providerTaskId) {
    const { data } = await admin.from("video_outputs").select("*").eq("owner_id", user.id).eq("storage_path", `ark://${providerTaskId}.mp4`).order("created_at", { ascending: false }).limit(1);
    outputRow = data?.[0] || null;
  }

  // 安全：只有当查到当前用户自己的 output 才使用 file_id；避免随便传 Drive file_id 越权拉文件。
  if (!outputRow) return json({ error: "OUTPUT_NOT_FOUND_OR_NOT_OWNED" }, 404);

  const driveFileId = googleDriveFileIdFromOutput(outputRow);
  const storageStatus = String(outputRow.storage_status || outputRow.status || "").toLowerCase();
  if (driveFileId && storageStatus === "completed") return await streamGoogleDriveFile(driveFileId, req);

  return json({
    error: "OUTPUT_NOT_ARCHIVED_TO_GOOGLE_DRIVE",
    output_id: outputRow.id,
    storage_status: storageStatus || "pending",
    message: "视频尚未完成 Google Drive 归档，禁止回退 Seedance 临时 URL。",
  }, 409);
});
