import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authorizeDisableUser,
  normalizeEnName,
} from "../_shared/admin-user-policy.mjs";

const BUILD = "20260728-admin-disable-user-v1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ build: BUILD, ...body }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return respond({ error: "未登录或登录已过期" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 服务端配置缺失");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) return respond({ error: "未登录或登录已过期" }, 401);

    const body = await req.json().catch(() => ({}));
    const enName = normalizeEnName(body?.en_name);

    const [{ data: actor, error: actorError }, { data: target, error: targetError }] = await Promise.all([
      admin.from("users").select("id,email,role,disabled").eq("id", authData.user.id).maybeSingle(),
      admin.from("users").select("id,email,name,role,disabled").eq("email", `${enName}@webank.com`).maybeSingle(),
    ]);
    if (actorError) throw actorError;
    if (targetError) throw targetError;

    authorizeDisableUser({
      actorId: actor?.id,
      actorRole: actor?.role,
      actorDisabled: Boolean(actor?.disabled),
      targetId: target?.id,
    });

    const { data: previousOrg, error: previousOrgError } = await admin
      .from("org_members")
      .select("en_name,display_name,perms,disabled")
      .eq("en_name", enName)
      .maybeSingle();
    if (previousOrgError) throw previousOrgError;

    const previousDisabled = Boolean(target.disabled);
    const displayName = String(previousOrg?.display_name || target.name || enName)
      .replace(/（已停用）$/u, "");

    const { data: updatedUser, error: userUpdateError } = await admin
      .from("users")
      .update({ disabled: true })
      .eq("id", target.id)
      .select("id,disabled")
      .single();
    if (userUpdateError || !updatedUser?.disabled) {
      throw userUpdateError || new Error("成员状态未更新");
    }

    const { error: orgUpdateError } = await admin
      .from("org_members")
      .upsert({
        en_name: enName,
        display_name: displayName,
        perms: [],
        disabled: true,
      }, { onConflict: "en_name" });

    if (orgUpdateError) {
      await admin.from("users").update({ disabled: previousDisabled }).eq("id", target.id);
      throw orgUpdateError;
    }

    const { error: banError } = await admin.auth.admin.updateUserById(target.id, {
      ban_duration: "876000h",
    });

    if (banError) {
      await admin.from("users").update({ disabled: previousDisabled }).eq("id", target.id);
      if (previousOrg) {
        await admin.from("org_members").upsert(previousOrg, { onConflict: "en_name" });
      } else {
        await admin.from("org_members").delete().eq("en_name", enName);
      }
      throw banError;
    }

    console.info(JSON.stringify({
      event: "admin_user_disabled",
      actor_id: actor.id,
      target_id: target.id,
      target_en_name: enName,
    }));

    return respond({
      ok: true,
      en_name: enName,
      disabled: true,
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error(JSON.stringify({
      event: "admin_user_disable_failed",
      status,
      error: String(error?.message || error),
    }));
    return respond({ error: String(error?.message || "注销失败") }, status);
  }
});
