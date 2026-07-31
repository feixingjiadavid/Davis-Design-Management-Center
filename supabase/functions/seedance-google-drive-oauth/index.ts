import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

function html(title: string, message: string, ok = false, status = 200) {
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui;padding:48px;line-height:1.7;color:#111827"><h1>${title}</h1><p>${message}</p><p style="color:${ok ? "#059669" : "#dc2626"}">${ok ? "授权信息已安全写入 Davis Video。" : "未写入任何授权信息。"}</p></body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function requiredEnv(name: string) {
  const value = (Deno.env.get(name) || "").trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

async function readJson(response: Response) {
  const text = await response.text().catch(() => "");
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "GET") return html("请求无效", "仅支持浏览器授权。", false, 405);

    const requestUrl = new URL(req.url);
    const action = requestUrl.searchParams.get("action") || "callback";
    const flowToken = (action === "start"
      ? requestUrl.searchParams.get("flow")
      : requestUrl.searchParams.get("state")) || "";
    if (!flowToken) return html("授权链接无效", "缺少一次性授权凭证。", false, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = requiredEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
    const redirectUri = `${supabaseUrl}/functions/v1/seedance-google-drive-oauth`;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: flow, error: flowError } = await admin
      .from("video_google_oauth_flows")
      .select("flow_token,expires_at,used_at")
      .eq("flow_token", flowToken)
      .maybeSingle();
    if (flowError || !flow || flow.used_at || Date.parse(flow.expires_at) <= Date.now()) {
      return html("授权链接已失效", "请重新生成一次授权链接。", false, 410);
    }

    if (action === "start") {
      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: DRIVE_SCOPE,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state: flowToken,
      }).toString();
      return Response.redirect(authUrl.toString(), 302);
    }

    const googleError = requestUrl.searchParams.get("error");
    if (googleError) return html("Google Drive 授权未完成", `Google 返回：${googleError}`, false, 400);
    const code = requestUrl.searchParams.get("code") || "";
    if (!code) return html("Google Drive 授权失败", "Google 未返回授权码。", false, 400);

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const tokens = await readJson(tokenResponse);
    if (!tokenResponse.ok || !tokens.refresh_token) {
      console.error(JSON.stringify({
        event: "seedance_google_oauth_exchange_failed",
        status: tokenResponse.status,
        error: tokens.error || "refresh_token_missing",
      }));
      return html("Google Drive 授权失败", "未获得长期授权，请重新授权并确认 Google 显示的全部权限。", false, 502);
    }

    // Verify the newly issued refresh token before persisting it. No token value is logged.
    const verifyResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: String(tokens.refresh_token),
        grant_type: "refresh_token",
      }),
    });
    const verified = await readJson(verifyResponse);
    if (!verifyResponse.ok || !verified.access_token) {
      console.error(JSON.stringify({
        event: "seedance_google_oauth_refresh_verification_failed",
        status: verifyResponse.status,
        error: verified.error || "access_token_missing",
      }));
      return html("Google Drive 授权失败", "长期授权验证失败，旧授权未被替换。", false, 502);
    }

    const { error: saveError } = await admin.rpc("set_seedance_google_refresh_token", {
      p_refresh_token: String(tokens.refresh_token),
    });
    if (saveError) throw new Error(`GOOGLE_REFRESH_TOKEN_SAVE_FAILED: ${saveError.message}`);

    const { error: usedError } = await admin
      .from("video_google_oauth_flows")
      .update({ used_at: new Date().toISOString() })
      .eq("flow_token", flowToken)
      .is("used_at", null);
    if (usedError) throw new Error(`GOOGLE_OAUTH_FLOW_CLOSE_FAILED: ${usedError.message}`);

    console.log(JSON.stringify({ event: "seedance_google_oauth_completed", refresh_verified: true }));
    return html("Google Drive 授权成功", "长期 refresh token 已验证。现在可以关闭此页面。", true, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "seedance_google_oauth_failed", message }));
    return html("Google Drive 授权失败", "后端处理失败，请返回 Davis Video 后重试。", false, 500);
  }
});
