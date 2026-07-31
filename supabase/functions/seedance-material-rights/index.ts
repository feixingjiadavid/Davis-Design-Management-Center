import { createClient } from "npm:@supabase/supabase-js@2";

const BUILD = "20260731-project-version-rights-v1";
const TERMS_VERSION = "2026-07-31-v1";
const CONFIRMATION_TYPE = "temporary_reference_person_material_rights";
const STATEMENT = "我确认已获得该图片/视频素材的合法使用权，并承担由此产生的责任。";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "SERVER_ENV_MISSING" }, 500);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "UNAUTHORIZED" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json({ error: "UNAUTHORIZED" }, 401);

  let projectVersionId = "";
  let requestedRootId = "";
  if (req.method === "GET") {
    const url = new URL(req.url);
    projectVersionId = String(url.searchParams.get("project_version_id") || "").trim();
  } else {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
    projectVersionId = String(body.project_version_id || "").trim();
    requestedRootId = String(body.project_id || "").trim();
  }
  if (!projectVersionId) return json({ error: "PROJECT_VERSION_ID_REQUIRED" }, 400);

  const { data: project, error: projectError } = await admin
    .from("video_projects")
    .select("id, owner_id, version_root_id, version_number")
    .eq("id", projectVersionId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (projectError) return json({ error: "PROJECT_LOOKUP_FAILED", detail: projectError.message }, 500);
  if (!project) return json({ error: "PROJECT_VERSION_NOT_FOUND" }, 404);

  const projectRootId = String(project.version_root_id || project.id);
  if (requestedRootId && requestedRootId !== projectRootId) {
    return json({ error: "PROJECT_VERSION_ROOT_MISMATCH" }, 409);
  }

  if (req.method === "POST") {
    const { error: upsertError } = await admin
      .from("video_material_rights_confirmations")
      .upsert({
        project_id: projectRootId,
        project_version_id: project.id,
        user_id: user.id,
        terms_version: TERMS_VERSION,
        confirmation_type: CONFIRMATION_TYPE,
        confirmed_at: new Date().toISOString(),
      }, {
        onConflict: "project_version_id,user_id,terms_version,confirmation_type",
        ignoreDuplicates: false,
      });
    if (upsertError) {
      return json({ error: "CONFIRMATION_SAVE_FAILED", detail: upsertError.message }, 500);
    }
  }

  const { data: confirmation, error: confirmationError } = await admin
    .from("video_material_rights_confirmations")
    .select("confirmed_at, terms_version, confirmation_type")
    .eq("project_version_id", project.id)
    .eq("user_id", user.id)
    .eq("terms_version", TERMS_VERSION)
    .eq("confirmation_type", CONFIRMATION_TYPE)
    .maybeSingle();
  if (confirmationError) {
    return json({ error: "CONFIRMATION_LOOKUP_FAILED", detail: confirmationError.message }, 500);
  }

  return json({
    confirmed: Boolean(confirmation),
    project_id: projectRootId,
    project_version_id: project.id,
    version_number: project.version_number,
    confirmed_at: confirmation?.confirmed_at || null,
    terms_version: TERMS_VERSION,
    confirmation_type: CONFIRMATION_TYPE,
    statement: STATEMENT,
  });
});
