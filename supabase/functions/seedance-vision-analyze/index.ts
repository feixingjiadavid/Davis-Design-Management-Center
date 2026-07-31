import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/seedance-vision-analyze/index.ts

const BUILD = "20260731-seedance-vision-analyze-v12";

const QWEN_ENDPOINT =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(
    JSON.stringify({
      build: BUILD,
      ...body,
    }),
    {
      status,
      headers: {
        ...CORS,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}

function cleanModelText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          return String((item as Record<string, unknown>).text || "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

function parseVisionJson(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    const result = JSON.parse(cleaned);

    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      return result as Record<string, unknown>;
    }
  } catch {
    // 如果模型没有返回合法 JSON，下面保留原始描述。
  }

  return {
    raw_description: text,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: CORS,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        ok: false,
        error: "只支持 POST 请求",
      },
      405,
    );
  }

  try {
    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          ok: false,
          error: "请求 Body 不是合法 JSON",
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!supabaseUrl || !serviceRoleKey || !jwt) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const user = authData?.user;
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    /*
      支持两种输入：

      1. 公网图片：
         image_url:
         "https://example.com/test.jpg"

      2. Base64 Data URL：
         image_url:
         "data:image/jpeg;base64,/9j/4AAQ..."

      千问接口可以直接读取，不再让 Supabase 先下载图片。
    */
    const imageUrl = String(
      body.image_url ||
      body.image_base64 ||
      "",
    ).trim();

    if (!imageUrl) {
      return json(
        {
          ok: false,
          error: "缺少 image_url",
        },
        400,
      );
    }

    if (
      !imageUrl.startsWith("https://") &&
      !imageUrl.startsWith("http://") &&
      !imageUrl.startsWith("data:image/")
    ) {
      return json(
        {
          ok: false,
          error:
            "image_url 必须是 http/https 公网地址，或 data:image/...;base64 格式",
        },
        400,
      );
    }

    /*
      同时兼容你之前可能创建过的几个 Secret 名称。
      只要其中一个有正确的阿里百炼 API Key 即可。
    */
    const apiKey =
      Deno.env.get("QWEN_VISION_API_KEY") ||
      Deno.env.get("DASHSCOPE_API_KEY") ||
      Deno.env.get("QWEN_API_KEY");

    if (!apiKey) {
      return json(
        {
          ok: false,
          error:
            "尚未配置 QWEN_VISION_API_KEY、DASHSCOPE_API_KEY 或 QWEN_API_KEY",
        },
        500,
      );
    }

    const userPrompt = String(
      body.prompt ||
      "分析这张图片，用于 Seedance 视频生成提示词优化。",
    ).trim();

    const analysisInstruction = `
你是专业的 AI 视频导演和视觉理解助手。

你需要仔细理解用户提供的图片，为后续 Seedance 视频提示词优化提供准确的视觉上下文。

必须分析：

1. 图片中的主要主体
2. 人物、IP角色或物体的外观特征
3. 场景和背景环境
4. 画面风格和材质
5. 主要颜色和光影
6. 构图、景别和镜头角度
7. 图片中的文字、数字、Logo或重要标识
8. 首帧视频生成时必须保持不变的内容
9. 可以自然产生的动作和镜头变化
10. 视频生成时必须避免的错误

特别要求：

- 不要把卡通角色识别成真人或真实动物。
- 不要擅自改变角色身份、五官、服装、颜色、材质或比例。
- 地图类图片要识别地点、起点、终点、路线和地理位置关系。
- 有文字或数字时，要明确列出并要求保持正确。
- 分析必须基于实际图片，不能凭空新增内容。
- 只返回合法 JSON，不要输出 Markdown，不要解释。

严格返回以下 JSON 结构：

{
  "subject": "",
  "subject_details": "",
  "scene": "",
  "style": "",
  "materials": "",
  "composition": "",
  "camera": "",
  "lighting": "",
  "colors": [],
  "visible_text": [],
  "important_elements": [],
  "possible_motion": [],
  "keep_rules": [],
  "avoid_rules": [],
  "seedance_visual_summary": "",
  "contains_real_person": false,
  "real_person_count": 0,
  "multi_person_detected": false,
  "is_group_photo": false,
  "is_lifestyle_photo": false,
  "image_kind": "group_photo|event_photo|travel_photo|selfie|life_photo|non_person|unknown",
  "confidence": 0.0
}
`.trim();

    const qwenResponse = await fetch(QWEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:
          Deno.env.get("QWEN_VISION_MODEL") ||
          "qwen-vl-plus",

        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
              {
                type: "text",
                text:
                  `${analysisInstruction}\n\n用户补充要求：${userPrompt}`,
              },
            ],
          },
        ],

        temperature: 0.1,
        max_tokens: 1800,
        stream: false,
      }),
    });

    const rawText = await qwenResponse.text();

    let payload: Record<string, unknown> = {};

    try {
      payload = rawText
        ? JSON.parse(rawText)
        : {};
    } catch {
      payload = {
        raw_response: rawText,
      };
    }

    if (!qwenResponse.ok) {
      const errorObject =
        payload.error &&
        typeof payload.error === "object"
          ? payload.error as Record<string, unknown>
          : {};

      const message =
        String(
          errorObject.message ||
          payload.message ||
          rawText ||
          `HTTP ${qwenResponse.status}`,
        );

      return json(
        {
          ok: false,
          error: `千问视觉接口请求失败：${message}`,
          qwen_status: qwenResponse.status,
          raw: payload,
        },
        502,
      );
    }

    const choices = Array.isArray(payload.choices)
      ? payload.choices
      : [];

    const firstChoice =
      choices[0] &&
      typeof choices[0] === "object"
        ? choices[0] as Record<string, unknown>
        : {};

    const message =
      firstChoice.message &&
      typeof firstChoice.message === "object"
        ? firstChoice.message as Record<string, unknown>
        : {};

    const modelText = cleanModelText(message.content);

    if (!modelText) {
      return json(
        {
          ok: false,
          error: "千问视觉模型没有返回有效内容",
          raw: payload,
        },
        502,
      );
    }

    const visionContext = parseVisionJson(modelText);
    const personCount = Math.max(0, Math.floor(Number(visionContext.real_person_count || 0)));
    const diagnostics = {
      contains_real_person: visionContext.contains_real_person === true || personCount > 0,
      real_person_count: personCount,
      multi_person_detected: visionContext.multi_person_detected === true ||
        visionContext.is_group_photo === true || personCount >= 2,
      is_group_photo: visionContext.is_group_photo === true || personCount >= 2,
      is_lifestyle_photo: visionContext.is_lifestyle_photo === true,
      image_kind: String(visionContext.image_kind || "unknown"),
      confidence: Math.max(0, Math.min(1, Number(visionContext.confidence || 0))),
      image_width: Math.max(0, Math.floor(Number(body.image_width || 0))) || null,
      image_height: Math.max(0, Math.floor(Number(body.image_height || 0))) || null,
      analysis_status: "completed",
      analyzed_at: new Date().toISOString(),
    };

    const assetId = String(body.asset_id || "").trim();
    if (assetId) {
      const { error: persistError } = await admin.from("video_assets").update({
        analysis_metadata: diagnostics,
      }).eq("id", assetId).eq("owner_id", user.id);
      if (persistError) {
        console.error(JSON.stringify({
          event: "seedance_vision_analysis_persist_failed",
          asset_id: assetId,
          owner_id: user.id,
          error: persistError.message,
        }));
      }
    }

    return json({
      ok: true,
      model:
        String(
          payload.model ||
          Deno.env.get("QWEN_VISION_MODEL") ||
          "qwen-vl-plus",
        ),
      vision_context: { ...visionContext, ...diagnostics },
      diagnostics,
      raw_description: modelText,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return json(
      {
        ok: false,
        error: message,
      },
      500,
    );
  }
});