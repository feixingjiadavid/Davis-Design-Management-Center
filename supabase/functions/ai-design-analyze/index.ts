import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function parseJson(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(clean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const qwenKey = Deno.env.get("DASHSCOPE_API_KEY") || Deno.env.get("QWEN_API_KEY") || Deno.env.get("QWEN_VISION_API_KEY") || "";
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !qwenKey || !jwt) return respond({ ok: false, error: "Service unavailable" }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData } = await admin.auth.getUser(jwt);
  if (!authData.user) return respond({ ok: false, error: "Unauthorized" }, 401);

  const { task_id } = await req.json();
  const { data: task, error: taskError } = await admin.from("test_tasks").select("*").eq("id", task_id).single();
  if (taskError || !task || String(task.assignee || "").toLowerCase() !== "davis.design.ai") {
    return respond({ ok: false, error: "Task is not assigned to Davis AI designer" }, 400);
  }

  const { data: job, error: jobError } = await admin.from("ai_design_jobs")
    .upsert({ task_id: task.id, status: "analyzing", request_snapshot: task, attempt_count: 1, updated_at: new Date().toISOString() }, { onConflict: "task_id" })
    .select().single();
  if (jobError) return respond({ ok: false, error: jobError.message }, 500);

  try {
    const completion = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${qwenKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("QWEN_TEXT_MODEL") || "qwen-plus",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是企业内部文化活动的资深设计需求经理。只能基于工单事实分析，不得虚构。返回JSON。missing_fields必须只列出真正阻塞设计的信息。" },
          { role: "user", content: `分析以下设计工单：${JSON.stringify(task)}\n返回字段：task_type、design_mode(strict_template/series_extension/new_visual)、deliverables、dimensions、copy_requirements、assets_received、style_requirements、brand_constraints、missing_fields、clarifying_questions、execution_plan、ready_for_generation。` }
        ]
      })
    });
    if (!completion.ok) throw new Error(`Qwen ${completion.status}: ${await completion.text()}`);
    const payload = await completion.json();
    const analysis = parseJson(payload.choices?.[0]?.message?.content || "{}");
    const ready = analysis.ready_for_generation === true && (!analysis.missing_fields || analysis.missing_fields.length === 0);
    const nextStatus = ready ? "ready_for_generation" : "needs_input";
    const now = new Date().toISOString();
    const history = (() => { try { return JSON.parse(task.history_json || "[]"); } catch { return []; } })();
    history.push({
      action: ready ? "ai_analysis_ready" : "ai_analysis_needs_input",
      operator: "Davis AI设计师",
      time: now,
      reply: ready ? "AI已完成需求分析，等待人工确认进入设计生成。" : `AI已完成需求检查，等待补充：${(analysis.missing_fields || []).join("、")}`,
      ai_analysis: analysis
    });
    await admin.from("ai_design_jobs").update({ status: nextStatus, analysis, completed_at: now, updated_at: now }).eq("id", job.id);
    await admin.from("test_tasks").update({ status: "processing", summary_desc: ready ? "AI需求分析完成，等待确认生成。" : "AI正在等待需求方补充必要信息。", history_json: JSON.stringify(history) }).eq("id", task.id);
    return respond({ ok: true, task_id: task.id, job_status: nextStatus, analysis });
  } catch (error) {
    await admin.from("ai_design_jobs").update({ status: "failed", error_message: String(error), updated_at: new Date().toISOString() }).eq("id", job.id);
    return respond({ ok: false, error: String(error) }, 500);
  }
});

