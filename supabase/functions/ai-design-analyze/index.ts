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


const AI_USER_ID = "90e5b8f9-c8b3-4d7c-9931-444e35b43b5b";
const xml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] || c));
const lines = (value: unknown, max = 38) => {
  const valueText = String(value ?? "").trim();
  const result: string[] = [];
  for (let i = 0; i < valueText.length; i += max) result.push(valueText.slice(i, i + max));
  return result;
};
function frameworkSvg(task: Record<string, any>, analysis: Record<string, any>) {
  const missing = Array.isArray(analysis.missing_fields) && analysis.missing_fields.length ? analysis.missing_fields : ["需求信息已满足方案推进条件"];
  const plan = Array.isArray(analysis.execution_plan) && analysis.execution_plan.length ? analysis.execution_plan : ["梳理需求与素材", "形成视觉方向", "审批后进入正式制作"];
  const list = (items: unknown[], x: number, y: number) => items.flatMap((item, i) => lines(`${i + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`, 42)).slice(0, 8).map((line, i) => `<text x="${x}" y="${y + i * 42}" class="body">${xml(line)}</text>`).join("");
  const deliverables = Array.isArray(analysis.deliverables) ? analysis.deliverables.join(" / ") : "待确认";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1242" height="1660"><style>.tag{font:700 24px Arial;fill:#3377ff}.title{font:800 54px Arial;fill:#15233b}.sub{font:400 24px Arial;fill:#71809a}.head{font:800 30px Arial;fill:#15233b}.body{font:400 25px Arial;fill:#33445f}.label{font:700 24px Arial;fill:#3377ff}</style><rect width="1242" height="1660" fill="#eef5ff"/><rect x="70" y="70" width="1102" height="1520" rx="42" fill="#fff" stroke="#dce7f5" stroke-width="2"/><text x="110" y="145" class="tag">DAVIS AI · FRAMEWORK PROPOSAL</text><text x="110" y="225" class="title">${xml(task.title || "未命名需求")}</text><text x="110" y="275" class="sub">${xml(task.id)} · ${xml(task.project || "未分类")} · AI 可视化框架方案</text><text x="110" y="365" class="label">任务类型</text><text x="300" y="365" class="body">${xml(analysis.task_type || "企业内部文化活动设计")}</text><text x="110" y="435" class="label">设计模式</text><text x="300" y="435" class="body">${xml(analysis.design_mode || "new_visual")}</text><text x="110" y="505" class="label">交付内容</text><text x="300" y="505" class="body">${xml(deliverables)}</text><rect x="100" y="620" width="500" height="580" rx="28" fill="#fff9ec" stroke="#f0d99c"/><text x="125" y="680" class="head">待确认资料</text>${list(missing, 125, 740)}<rect x="640" y="620" width="500" height="580" rx="28" fill="#f2f7ff" stroke="#ccdcf5"/><text x="670" y="680" class="head">执行计划</text>${list(plan, 670, 740)}<text x="110" y="1370" class="head">审批说明</text><text x="110" y="1430" class="body">本页为 AI 设计师提交的框架方案。</text><text x="110" y="1475" class="body">审批通过后才进入正式设计与付费生成。</text><text x="110" y="1550" class="sub">生成账号：davis.design.ai</text></svg>`;
}
async function submitFramework(admin: ReturnType<typeof createClient>, task: Record<string, any>, job: Record<string, any>, analysis: Record<string, any>) {
  const svgBytes = new TextEncoder().encode(frameworkSvg(task, analysis));
  let binary = "";
  svgBytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const frameworkImageUrl = `data:image/svg+xml;base64,${btoa(binary)}`;
  const history = (() => { try { return JSON.parse(task.history_json || "[]"); } catch { return []; } })();
  const version = `v-AI-${history.filter((item: Record<string, unknown>) => item.action === "submit_framework").length + 1}`;
  const submittedAt = new Date().toISOString();
  history.push({ action: "submit_framework", operator: "Davis AI设计师", version, time: submittedAt, created_at: submittedAt, desc: "AI 已提交需求理解、待确认资料与执行计划的可视化框架方案。", img_url: frameworkImageUrl, source_link: "", work_hours: 0, ai_tools: ["Qwen", "Davis AI Framework"] });
  const framework = { image_url: frameworkImageUrl, version, submitted_at: submittedAt };
  const { error: taskUpdateError } = await admin.from("test_tasks").update({ status: "pending_approval", summary_desc: `AI 框架方案已上传，待领导审批 (版本: ${version})`, design_img_url: frameworkImageUrl, history_json: JSON.stringify(history) }).eq("id", task.id);
  if (taskUpdateError) throw taskUpdateError;
  await admin.from("ai_design_jobs").update({ status: "framework_submitted", analysis: { ...analysis, framework }, updated_at: submittedAt, completed_at: submittedAt }).eq("id", job.id);
  return framework;
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
  if (authData.user.id !== AI_USER_ID) return respond({ ok: false, error: "AI account required" }, 403);

  const { task_id } = await req.json();
  const { data: task, error: taskError } = await admin.from("test_tasks").select("*").eq("id", task_id).single();
  if (taskError || !task || String(task.assignee || "").toLowerCase() !== "davis.design.ai") {
    return respond({ ok: false, error: "Task is not assigned to Davis AI designer" }, 400);
  }

  // 外发字段白名单：禁止把附件内容、图片/Base64、源文件地址或参考链接发送给模型。
  const safeTask = {
    id: task.id,
    title: task.title || "",
    full_desc: task.full_desc || "",
    project: task.project || "",
    due_date: task.due_date || "",
    channels: Array.isArray(task.channels) ? task.channels : [],
    file_name: task.file_name || "",
  };

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
          { role: "user", content: `分析以下设计工单：${JSON.stringify(safeTask)}\n返回字段：task_type、design_mode(strict_template/series_extension/new_visual)、deliverables、dimensions、copy_requirements、assets_received、style_requirements、brand_constraints、missing_fields、clarifying_questions、execution_plan、ready_for_generation。` }
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
    await admin.from("test_tasks").update({ status: "processing", summary_desc: ready ? "AI需求分析完成，正在生成框架方案。" : "AI已识别待确认资料，正在生成框架方案。", history_json: JSON.stringify(history) }).eq("id", task.id);
    const framework = await submitFramework(admin, { ...task, history_json: JSON.stringify(history) }, job, analysis);
    return respond({ ok: true, task_id: task.id, job_status: "framework_submitted", analysis, framework });
  } catch (error) {
    await admin.from("ai_design_jobs").update({ status: "failed", error_message: String(error), updated_at: new Date().toISOString() }).eq("id", job.id);
    return respond({ ok: false, error: String(error) }, 500);
  }
});
