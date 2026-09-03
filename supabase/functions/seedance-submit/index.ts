import { createClient } from "npm:@supabase/supabase-js@2";
import { existingSubmissionResult } from "../_shared/seedance-submit-policy.mjs";
import { buildSeedanceRequestShape, redactArkPayload } from "../_shared/seedance-request-shape.mjs";
import { normalizePromptReferences } from "../_shared/seedance-prompt-references.mjs";
import { buildGenerationRoute } from "../_shared/seedance-generation-router.mjs";
import { buildServerStrictFrameLockPrompt } from "../_shared/seedance-frame-lock.mjs";
import { buildWan3Payload, WAN3_MODEL, wan3BaseUrl } from "../_shared/wan3-provider.mjs";

const BUILD = "20260903-wan3-video-v56";
const FRAME_LOCK_POLICY = "strict_first_last_server_v3_identity_lock";
const FPS = 24;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL_CATALOG = {
  wan30: {
    label: "Wan 3.0",
    env: "",
    fallback: WAN3_MODEL,
    family: "wan3",
    minDuration: 2,
    maxDuration: 30,
    resolutions: ["480p", "720p", "1080p"],
    supportsAudio: true,
    supportsVideoReference: true,
    pricing: { "480p": 0.3, "720p": 0.6, "1080p": 1.2 },
  },
  v25: {
    label: "Davis Video 2.5",
    env: "ARK_SEEDANCE_MODEL_25",
    fallback: "doubao-seedance-2-5-260628",
    family: "2.5",
    minDuration: 4,
    maxDuration: 30,
    resolutions: ["480p", "720p", "1080p"],
    supportsAudio: true,
    supportsVideoReference: true,
    pricing: {
      "480p": { noVideo: 70, withVideo: 42 },
      "720p": { noVideo: 70, withVideo: 42 },
      "1080p": { noVideo: 70, withVideo: 42 },
    },
  },
  v20: {
    label: "Davis Video 2.0",
    env: "ARK_SEEDANCE_MODEL_20",
    fallback: "doubao-seedance-2-0-260128",
    family: "2.0",
    minDuration: 4,
    maxDuration: 15,
    resolutions: ["480p", "720p", "1080p", "4k"],
    supportsAudio: true,
    supportsVideoReference: true,
    pricing: {
      "480p": { noVideo: 46, withVideo: 28 },
      "720p": { noVideo: 46, withVideo: 28 },
      "1080p": { noVideo: 46, withVideo: 28 },
      "4k": { noVideo: 46, withVideo: 28 },
    },
  },
  fast: {
    label: "Davis Video 2.0 Fast",
    env: "ARK_SEEDANCE_MODEL_FAST",
    fallback: "doubao-seedance-2-0-fast-260128",
    family: "2.0",
    minDuration: 4,
    maxDuration: 15,
    resolutions: ["480p", "720p"],
    supportsAudio: true,
    supportsVideoReference: true,
    pricing: {
      "480p": { noVideo: 37, withVideo: 22 },
      "720p": { noVideo: 37, withVideo: 22 },
    },
  },
  mini: {
    label: "Davis Video 2.0 Mini",
    env: "ARK_SEEDANCE_MODEL_MINI",
    fallback: "doubao-seedance-2-0-mini-260615",
    family: "2.0",
    minDuration: 4,
    maxDuration: 15,
    resolutions: ["480p", "720p"],
    supportsAudio: false,
    supportsVideoReference: true,
    pricing: {
      "480p": { noVideo: 23, withVideo: 14 },
      "720p": { noVideo: 23, withVideo: 14 },
    },
  },
  v15: {
    label: "Davis Video 1.5 Pro",
    env: "ARK_SEEDANCE_MODEL_15",
    fallback: "doubao-seedance-1-5-pro-251215",
    family: "1.5",
    minDuration: 1,
    maxDuration: 12,
    resolutions: ["480p", "720p", "1080p"],
    supportsAudio: true,
    supportsVideoReference: false,
    pricing: {
      "480p": { silent: 8, audio: 16 },
      "720p": { silent: 8, audio: 16 },
      "1080p": { silent: 8, audio: 16 },
    },
  },
} as const;

type ModelAlias = keyof typeof MODEL_CATALOG;

const RESOLUTION_PIXELS: Record<string, number> = {
  "480p": 864 * 496,
  "720p": 1280 * 720,
  "1080p": 1920 * 1080,
  "4k": 3840 * 2160,
};

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ build: BUILD, ...body }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeModelAlias(value: unknown): ModelAlias {
  const raw = safeString(value, "mini").trim().toLowerCase();
  if (["wan30", "wan3", "wan3.0", "wan3.0-video", "wan-3.0"].includes(raw)) return "wan30";
  if (["v25", "25", "2.5", "seedance2.5", "seedance-2.5", "doubao-seedance-2-5", "doubao-seedance-2-5-260628"].includes(raw)) return "v25";
  if (["v20", "20", "2.0", "standard", "seedance2", "seedance-2.0"].includes(raw)) return "v20";
  if (["v15", "15", "1.5", "pro15", "1.5-pro", "seedance-1.5"].includes(raw)) return "v15";
  if (raw === "fast") return "fast";
  return "mini";
}

function modelId(alias: ModelAlias): string {
  const config = MODEL_CATALOG[alias];
  if (alias === "wan30") return WAN3_MODEL;
  return Deno.env.get(config.env) || config.fallback;
}

function normalizeRatio(value: unknown, alias: ModelAlias): string {
  const ratio = safeString(value, "adaptive");
  const allowed = alias === "wan30"
    ? new Set(["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4"])
    : new Set(["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]);
  if (ratio === "3:1") return "21:9";
  return allowed.has(ratio) ? ratio : "adaptive";
}

function normalizeResolution(value: unknown, alias: ModelAlias): string {
  const config = MODEL_CATALOG[alias];
  const requested = safeString(value, "720p").toLowerCase();
  return (config.resolutions as readonly string[]).includes(requested) ? requested : "720p";
}

function normalizeDuration(value: unknown, alias: ModelAlias): number {
  const config = MODEL_CATALOG[alias];
  const n = Number(value);
  if (alias === "wan30" && n === -1) return -1;
  if (!Number.isFinite(n)) return Math.max(config.minDuration, 4);
  return Math.max(config.minDuration, Math.min(config.maxDuration, Math.round(n)));
}

function referenceVideoSeconds(requestBody: Record<string, any>, items: Array<any>): number {
  const directions = Array.isArray(requestBody.reference_directions) ? requestBody.reference_directions : [];
  let total = 0;
  for (const item of items) {
    if (!String(item?.mime_type || "").startsWith("video/")) continue;
    const direct = Number(item?.duration_seconds || item?.duration || 0);
    if (direct > 0) { total += direct; continue; }
    const match = directions.find((x: any) => safeString(x?.asset_id) === safeString(item?.asset_id));
    const d = Number(match?.duration_seconds || match?.duration || 0);
    if (d > 0) total += d;
  }
  return total;
}

function estimateCostCny(args: {
  alias: ModelAlias;
  resolution: string;
  duration: number;
  generateAudio: boolean;
  hasVideoInput: boolean;
  videoInputSeconds: number;
  inputMode: string;
}) {
  const { alias, resolution, duration, generateAudio, hasVideoInput, videoInputSeconds, inputMode } = args;
  const config: any = MODEL_CATALOG[alias];
  if (alias === "wan30") {
    const pricedDuration = duration === -1 ? 5 : duration;
    const billedSeconds = pricedDuration + (hasVideoInput ? Math.max(0, videoInputSeconds) : 0);
    const ratePerSecond = Number(config.pricing[resolution] || config.pricing["720p"]);
    return {
      currency: "CNY",
      estimated_tokens: 0,
      rate_per_second_cny: ratePerSecond,
      estimated_cost_cny: Number((billedSeconds * ratePerSecond).toFixed(4)),
      billing_input_mode: hasVideoInput ? "input_and_output_seconds" : "output_seconds",
      input_mode: inputMode,
      video_input_seconds: Number(videoInputSeconds.toFixed(3)),
      smart_duration: duration === -1,
      pricing_note: "预估值；Wan 3.0 按输入视频与输出视频总秒数计费，最终以阿里云百炼账单为准。",
    };
  }
  const pixels = RESOLUTION_PIXELS[resolution] || RESOLUTION_PIXELS["720p"];
  const secondsForTokens = config.family === "2.0" ? duration + (hasVideoInput ? Math.max(0, videoInputSeconds) : 0) : duration;
  const estimatedTokens = Math.ceil((pixels * FPS * secondsForTokens) / 1024);
  let ratePerMillion = 0;
  if (alias === "v15") {
    ratePerMillion = generateAudio ? config.pricing[resolution].audio : config.pricing[resolution].silent;
  } else {
    ratePerMillion = hasVideoInput ? config.pricing[resolution].withVideo : config.pricing[resolution].noVideo;
  }
  const estimatedCost = estimatedTokens * ratePerMillion / 1_000_000;
  return {
    currency: "CNY",
    estimated_tokens: estimatedTokens,
    rate_per_million_tokens_cny: ratePerMillion,
    estimated_cost_cny: Number(estimatedCost.toFixed(4)),
    billing_input_mode: hasVideoInput ? "with_video_input" : "without_video_input",
    input_mode: inputMode,
    video_input_seconds: Number(videoInputSeconds.toFixed(3)),
    pricing_note: "预估值；最终以 Ark 返回 usage 与火山方舟实际账单为准。",
  };
}

async function findExistingSubmission(admin: any, ownerId: string, segmentId: string, clientSubmitNonce: string) {
  const { data, error } = await admin.from("video_tasks").select("*")
    .eq("owner_id", ownerId)
    .eq("segment_id", segmentId)
    .contains("request_payload", { client_submit_nonce: clientSubmitNonce })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("幂等任务查询失败：" + error.message);
  return data?.[0] || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const arkApiKey = Deno.env.get("ARK_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) return respond({ error: "Supabase server secrets are missing" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return respond({ error: "Unauthorized: missing user token" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  const user = authData?.user;
  if (authError || !user) return respond({ error: "Unauthorized: invalid user token" }, 401);

  let requestBody: Record<string, any>;
  try { requestBody = await req.json(); } catch { return respond({ error: "Invalid JSON body" }, 400); }

  const clientSubmitNonce = safeString(requestBody.client_submit_nonce).trim();
  if (!clientSubmitNonce) return respond({ error: "client_submit_nonce is required", retryable: false }, 400);
  const segmentId = safeString(requestBody.segment_id);
  if (!segmentId) return respond({ error: "segment_id is required" }, 400);

  const { data: segment, error: segmentError } = await admin.from("video_segments").select("*")
    .eq("id", segmentId).eq("owner_id", user.id).single();
  if (segmentError || !segment) return respond({ error: "Segment not found or not owned by current user", detail: segmentError?.message || null }, 404);

  try {
    const existingSubmission = await findExistingSubmission(admin, user.id, segment.id, clientSubmitNonce);
    if (existingSubmission) return respond(existingSubmissionResult(existingSubmission));
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : String(error), retryable: false }, 500);
  }

  const requestedMode = safeString(requestBody.mode || segment.mode || "").toLowerCase();
  const isTextOnly = requestedMode === "text_only" || (!segment.from_asset_id && !segment.to_asset_id);
  if (!isTextOnly && (!segment.from_asset_id || !segment.to_asset_id)) return respond({ error: "Segment 缺少首帧或尾帧素材" }, 400);

  const originalPromptText = safeString(segment.prompt).trim();
  if (!originalPromptText) return respond({ error: "Segment prompt 不能为空" }, 400);

  let promptText = isTextOnly
    ? safeString(requestBody.effective_prompt || originalPromptText).trim()
    : buildServerStrictFrameLockPrompt({ userPrompt: originalPromptText, segmentPosition: Number(segment.position || requestBody.segment_position || 0), projectMode: requestedMode || "first_last" });
  if (!promptText) return respond({ error: "effective_prompt 不能为空" }, 400);

  let firstSignedUrl = "";
  let lastSignedUrl = "";
  const referenceSignedItems: Array<any> = [];
  let firstAsset: any = null;
  let lastAsset: any = null;

  if (isTextOnly) {
    const ids = Array.isArray(requestBody.reference_asset_ids)
      ? requestBody.reference_asset_ids.map((item: unknown) => safeString(item)).filter(Boolean)
      : [];
    const fallbackId = safeString(requestBody.reference_asset_id || segment.reference_asset_id || "");
    if (!ids.length && fallbackId) ids.push(fallbackId);
    const directions = Array.isArray(requestBody.reference_directions) ? requestBody.reference_directions : [];

    for (const referenceAssetId of ids.slice(0, 8)) {
      const { data: referenceAsset, error: referenceAssetError } = await admin.from("video_assets").select("*")
        .eq("id", referenceAssetId).eq("owner_id", user.id).single();
      if (referenceAssetError || !referenceAsset) return respond({ error: "无法读取参考素材", detail: referenceAssetError?.message || null }, 400);
      const mimeType = String(referenceAsset.mime_type || "");
      if (!mimeType.startsWith("video/") && !mimeType.startsWith("audio/") && !mimeType.startsWith("image/")) return respond({ error: "参考素材类型不支持" }, 400);
      const signed = await admin.storage.from(referenceAsset.bucket_id || "seedance-inputs").createSignedUrl(referenceAsset.object_path, 3600);
      if (signed.error) return respond({ error: "生成参考素材签名地址失败", detail: signed.error.message }, 500);
      const directionItem = directions.find((item: any) => safeString(item?.asset_id) === referenceAssetId);
      referenceSignedItems.push({
        asset_id: referenceAsset.id,
        url: signed.data.signedUrl,
        mime_type: mimeType,
        direction: safeString(directionItem?.direction || "overall"),
        name: safeString(referenceAsset.original_name || referenceAssetId),
        token: safeString(directionItem?.token),
        duration_seconds: Number(directionItem?.duration_seconds || directionItem?.duration || referenceAsset?.analysis_metadata?.duration_seconds || 0) || 0,
        analysis: (referenceAsset.analysis_metadata && typeof referenceAsset.analysis_metadata === "object") ? referenceAsset.analysis_metadata : {},
        width: Number(referenceAsset.width || 0) || null,
        height: Number(referenceAsset.height || 0) || null,
      });
    }
  } else {
    const { data: assets, error: assetsError } = await admin.from("video_assets").select("*")
      .in("id", [segment.from_asset_id, segment.to_asset_id]).eq("owner_id", user.id);
    if (assetsError || !assets || assets.length < 2) return respond({ error: "无法读取首尾帧素材", detail: assetsError?.message || null }, 400);
    firstAsset = assets.find((asset: any) => asset.id === segment.from_asset_id);
    lastAsset = assets.find((asset: any) => asset.id === segment.to_asset_id);
    if (!firstAsset || !lastAsset) return respond({ error: "首尾帧素材不完整" }, 400);

    const assetRatioError = [firstAsset, lastAsset].map((asset: any) => {
      const w = Number(asset.width || 0); const h = Number(asset.height || 0);
      if (!w || !h) return null;
      const r = w / h;
      return (r < 0.40 || r > 2.50) ? `${asset.original_name || asset.id} 比例 ${r.toFixed(2)} 超出 Seedance 0.40-2.50 范围，请使用新版前端重新上传补边后的图片。` : null;
    }).find(Boolean);
    if (assetRatioError) return respond({ error: assetRatioError, retryable: false }, 200);

    const firstSigned = await admin.storage.from(firstAsset.bucket_id || "seedance-inputs").createSignedUrl(firstAsset.object_path, 3600);
    const lastSigned = await admin.storage.from(lastAsset.bucket_id || "seedance-inputs").createSignedUrl(lastAsset.object_path, 3600);
    if (firstSigned.error || lastSigned.error) return respond({ error: "生成素材签名地址失败", detail: firstSigned.error?.message || lastSigned.error?.message || null }, 500);
    firstSignedUrl = firstSigned.data.signedUrl;
    lastSignedUrl = lastSigned.data.signedUrl;
  }

  const modelAlias = normalizeModelAlias(requestBody.model_alias || segment.model_alias || "mini");
  const config: any = MODEL_CATALOG[modelAlias];
  const model = modelId(modelAlias);
  const provider = modelAlias === "wan30" ? "dashscope" : "ark";
  if (provider === "ark" && !arkApiKey) return respond({ error: "ARK_API_KEY 未配置" }, 500);
  const dashscopeApiKey = safeString(Deno.env.get("DASHSCOPE_API_KEY") || Deno.env.get("QWEN_API_KEY")).trim();
  const dashscopeWorkspaceId = safeString(Deno.env.get("DASHSCOPE_WORKSPACE_ID")).trim();
  if (provider === "dashscope" && !dashscopeApiKey) {
    return respond({ error: "WAN3_SERVER_CONFIGURATION_MISSING", message: "Wan 3.0 服务尚未完成安全配置。", retryable: false }, 503);
  }
  const ratio = normalizeRatio(requestBody.ratio || segment.ratio || "adaptive", modelAlias);
  const duration = normalizeDuration(requestBody.duration || segment.duration || 4, modelAlias);
  const resolution = normalizeResolution(requestBody.resolution || segment.resolution || "720p", modelAlias);
  const requestedAudio = Boolean(requestBody.generate_audio);
  const generateAudio = config.supportsAudio ? requestedAudio : false;
  const hasVideoInput = referenceSignedItems.some((item: any) => String(item.mime_type || "").startsWith("video/"));
  const hasAudioInput = referenceSignedItems.some((item: any) => String(item.mime_type || "").startsWith("audio/"));
  const hasImageInput = !isTextOnly || referenceSignedItems.some((item: any) => String(item.mime_type || "").startsWith("image/"));
  const videoInputSeconds = referenceVideoSeconds(requestBody, referenceSignedItems);
  const inputMode = [hasVideoInput ? "video" : "", hasImageInput ? "image" : "", hasAudioInput ? "audio" : ""].filter(Boolean).join("+") || "text";

  if (modelAlias === "wan30" && duration !== -1 && hasVideoInput && duration + videoInputSeconds > 30) {
    return respond({
      error: "WAN3_DURATION_LIMIT_EXCEEDED",
      message: `Wan 3.0 要求参考视频与生成视频总时长不超过 30 秒；当前参考视频约 ${videoInputSeconds.toFixed(1)} 秒，请缩短生成时长。`,
      retryable: false,
    }, 400);
  }

  if (modelAlias === "v15" && hasVideoInput) return respond({ error: "Davis Video 1.5 Pro 不支持参考视频输入；请改用 Davis Video 2.0 / Fast / Mini，或移除参考视频。", retryable: false }, 200);
  if (modelAlias === "v15" && hasAudioInput) return respond({ error: "Davis Video 1.5 Pro 当前接入用于纯文字/图片/首尾帧生成，不接收参考音频；声音开关控制生成视频是否带声音。参考音频请改用 Davis Video 2.0。", retryable: false }, 200);
  if (modelAlias === "v15" && isTextOnly && referenceSignedItems.length > 1) return respond({ error: "Davis Video 1.5 Pro 当前最多使用 1 张图片作为起始参考；多参考素材请改用 Davis Video 2.0。", retryable: false }, 200);

  const promptReferenceNormalization = isTextOnly
    ? normalizePromptReferences(promptText, referenceSignedItems)
    : { prompt: promptText, reference_count: 2, image_count: 2, available_tokens: [], removed_tokens: [], deduplicated_tokens: [] };
  promptText = promptReferenceNormalization.prompt;

  const firstImageReference = referenceSignedItems.find((item: any) => String(item.mime_type || "").startsWith("image/")) || null;
  const analysis = (firstImageReference?.analysis || {}) as Record<string, unknown>;
  const realPersonCount = Math.max(0, Math.floor(Number(analysis.real_person_count ?? requestBody.real_person_count ?? 0)));
  const containsRealPerson = analysis.contains_real_person === true || requestBody.contains_real_person === true || realPersonCount > 0;
  const multiPersonDetected = analysis.multi_person_detected === true || analysis.is_group_photo === true || requestBody.multi_person_detected === true || realPersonCount >= 2;

  const requestedSubmitMode = safeString(requestBody.submit_mode).trim();
  const temporaryPersonMode = requestedSubmitMode === "temporary_reference_person" || (containsRealPerson && Boolean(firstImageReference));
  const submitMode = temporaryPersonMode ? "temporary_reference_person" : (!referenceSignedItems.length && isTextOnly ? "text_to_video" : (!isTextOnly ? "first_last_frame_video" : "reference_image_video"));

  if (temporaryPersonMode && safeString(Deno.env.get("ENABLE_TEMP_PERSON_REFERENCE"), "true").toLowerCase() === "false") return respond({ error: "TEMP_PERSON_REFERENCE_DISABLED", message: "当前真人参考生成功能暂时不可用，素材和项目已保存。", retryable: false }, 409);

  if (temporaryPersonMode) {
    const { data: projectVersion, error: projectError } = await admin.from("video_projects").select("id, version_root_id").eq("id", segment.project_id).eq("owner_id", user.id).maybeSingle();
    if (projectError || !projectVersion) return respond({ error: "PROJECT_VERSION_NOT_FOUND" }, 404);
    const { data: confirmation, error: confirmationError } = await admin.from("video_material_rights_confirmations").select("id").eq("project_version_id", projectVersion.id).eq("project_id", projectVersion.version_root_id || projectVersion.id).eq("user_id", user.id).eq("terms_version", "2026-07-31-v1").eq("confirmation_type", "temporary_reference_person_material_rights").maybeSingle();
    if (confirmationError) return respond({ error: "RIGHTS_CONFIRMATION_LOOKUP_FAILED", detail: confirmationError.message }, 500);
    if (!confirmation) return respond({ error: "MATERIAL_RIGHTS_CONFIRMATION_REQUIRED", project_id: projectVersion.version_root_id || projectVersion.id, project_version_id: projectVersion.id, terms_version: "2026-07-31-v1", statement: "我确认已获得该图片/视频素材的合法使用权，并承担由此产生的责任。", retryable: false }, 409);
  }

  const explicitImageRole = safeString(requestBody.image_role).trim();
  const requestedTaskType = safeString(requestBody.task_type).trim();
  let requestShape: any;
  if (!isTextOnly) {
    requestShape = buildSeedanceRequestShape({ isTextOnly: false, promptText, firstFrameUrl: firstSignedUrl, lastFrameUrl: lastSignedUrl });
  } else if (referenceSignedItems.length === 1 && firstImageReference) {
    const preferredImageRole = modelAlias === "v15" ? "first_frame" : (explicitImageRole || "reference_image");
    const preferredTaskType = modelAlias === "v15" ? "image_first_frame" : (requestedTaskType || undefined);
    const route = buildGenerationRoute({ submitMode, taskType: preferredTaskType, imageRole: preferredImageRole, prompt: promptText, imageUrl: firstImageReference.url, imageCount: 1, containsRealPerson, realPersonCount, multiPersonDetected, isGroupPhoto: analysis.is_group_photo === true });
    requestShape = { ...route, imageSubmissionMethod: "supabase_signed_url_original", imageRoles: route.content.slice(1).map((item: any) => item.role), compatibilityRetryAvailable: false };
  } else if (!referenceSignedItems.length) {
    const route = buildGenerationRoute({ submitMode: "text_to_video", taskType: "text_to_video", prompt: promptText });
    requestShape = { ...route, imageSubmissionMethod: "none", imageRoles: [], compatibilityRetryAvailable: false };
  } else {
    requestShape = buildSeedanceRequestShape({ isTextOnly: true, promptText, referenceItems: referenceSignedItems });
  }
  const content = requestShape.content;

  if (!isTextOnly) {
    const roles = requestShape.imageRoles || [];
    if (requestShape.taskType !== "first_last_i2v" || roles.length !== 2 || roles[0] !== "first_frame" || roles[1] !== "last_frame") return respond({ error: "STRICT_FRAME_LOCK_ROUTE_INVALID", retryable: false }, 500);
  }

  const endpoint = provider === "dashscope"
    ? `${wan3BaseUrl(dashscopeWorkspaceId)}/services/aigc/video-generation/video-synthesis`
    : "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
  const costEstimate = estimateCostCny({ alias: modelAlias, resolution, duration, generateAudio, hasVideoInput, videoInputSeconds, inputMode });
  const diagnostics = {
    image_count: content.filter((item: any) => item.type === "image_url").length,
    contains_real_person: containsRealPerson,
    multi_person_detected: multiPersonDetected,
    submit_mode: submitMode,
    task_type: requestShape.taskType,
    image_role: requestShape.imageRoles?.[0] || null,
    provider_request_id: null,
    provider_error_code: null,
    model,
    model_alias: modelAlias,
    model_label: config.label,
    provider,
    input_mode: inputMode,
    endpoint,
    real_person_count: realPersonCount,
    is_group_photo: analysis.is_group_photo === true || multiPersonDetected,
    is_lifestyle_photo: analysis.is_lifestyle_photo === true,
    image_kind: safeString(analysis.image_kind || "unknown"),
    image_width: firstImageReference?.width || firstAsset?.width || null,
    image_height: firstImageReference?.height || firstAsset?.height || null,
    last_image_width: lastAsset?.width || null,
    last_image_height: lastAsset?.height || null,
    analysis_confidence: Number(analysis.confidence || 0) || null,
    frame_lock_policy: isTextOnly ? null : FRAME_LOCK_POLICY,
    frame_lock_server_authoritative: !isTextOnly,
    storyboard_parent_mode: isTextOnly ? null : requestedMode,
    segment_position: Number(segment.position || 0),
    pricing: costEstimate,
  };

  const arkPayload: Record<string, any> = { model, content, resolution, ratio, duration, watermark: true, return_last_frame: !isTextOnly };
  if (config.supportsAudio) arkPayload.generate_audio = generateAudio;
  const wanPayload = provider === "dashscope" ? buildWan3Payload({
    prompt: promptText,
    content,
    resolution,
    ratio,
    duration,
    generateAudio,
    promptExtend: false,
    watermark: true,
  }) : null;

  const requestPayloadForRecord = {
    client_submit_nonce: clientSubmitNonce,
    note: "seedance_task_shape_v52_model_catalog_cost",
    endpoint,
    provider,
    model,
    model_alias: modelAlias,
    model_label: config.label,
    ratio,
    duration,
    resolution,
    original_prompt: originalPromptText,
    effective_prompt: promptText,
    prompt_reference_normalization: promptReferenceNormalization,
    api_shape: provider === "dashscope" ? "dashscope.wan3.video-synthesis" : "ark.content_generation.tasks.create",
    task_type: requestShape.taskType,
    image_submission_method: requestShape.imageSubmissionMethod,
    image_transform: isTextOnly ? "client_safe_reference_media" : "client_safe_contain_pad_no_crop",
    compatibility_retry_available: requestShape.compatibilityRetryAvailable,
    compatibility_retry_limit: requestShape.compatibilityRetryAvailable ? 1 : 0,
    image_roles: requestShape.imageRoles,
    reference_roles: referenceSignedItems.map((item: any) => item.mime_type.startsWith("audio/") ? "reference_audio" : item.mime_type.startsWith("image/") ? "reference_image" : "reference_video"),
    reference_directions: referenceSignedItems.map((item: any) => ({ name: item.name, mime_type: item.mime_type, direction: item.direction, duration_seconds: item.duration_seconds || 0 })),
    generation_mode: requestShape.taskType,
    submit_mode: submitMode,
    image_role: requestShape.imageRoles?.[0] || null,
    diagnostics,
    generate_audio: generateAudio,
    prompt_mode: isTextOnly ? safeString(requestBody.prompt_mode || "text_reference_video_v15") : FRAME_LOCK_POLICY,
    pricing_estimate: costEstimate,
    ...(provider === "dashscope"
      ? { wan_payload: wanPayload }
      : { ark_payload_redacted: redactArkPayload(arkPayload), ark_payload: arkPayload }),
  };

  const { data: localTask, error: taskInsertError } = await admin.from("video_tasks").insert({ owner_id: user.id, project_id: segment.project_id, segment_id: segment.id, provider_task_id: null, status: "queued", progress: 10, model_alias: modelAlias, request_payload: requestPayloadForRecord, provider_response: { provider, submit_attempts: 0, ark_submit_attempts: 0, submission_phase: "queued_for_worker" }, metadata: diagnostics }).select().single();
  if (taskInsertError || !localTask) {
    if (taskInsertError?.code === "23505") {
      try { const racedSubmission = await findExistingSubmission(admin, user.id, segment.id, clientSubmitNonce); if (racedSubmission) return respond(existingSubmissionResult(racedSubmission)); }
      catch (error) { return respond({ error: error instanceof Error ? error.message : String(error), retryable: false }, 500); }
    }
    return respond({ error: "创建 video_tasks 失败", detail: taskInsertError?.message || null }, 500);
  }

  if (provider === "ark") {
    const { error: policyEventError } = await admin.from("video_provider_policy_events").insert({ task_id: localTask.id, owner_id: user.id, provider: "ark", model, endpoint, submit_mode: submitMode, task_type: requestShape.taskType, image_role: requestShape.imageRoles?.[0] || null, image_count: diagnostics.image_count, contains_real_person: containsRealPerson, multi_person_detected: multiPersonDetected, real_person_count: realPersonCount, is_group_photo: diagnostics.is_group_photo, is_lifestyle_photo: diagnostics.is_lifestyle_photo, image_kind: diagnostics.image_kind, image_width: diagnostics.image_width, image_height: diagnostics.image_height, analysis_confidence: diagnostics.analysis_confidence, retry_count: 0, outcome: "submitted" });
    if (policyEventError) console.error(JSON.stringify({ event: "seedance_policy_event_insert_failed", task_id: localTask.id, error: policyEventError.message }));
  }

  const { error: auditError } = await admin.from("video_operation_logs").insert({ owner_id: user.id, action: "seedance_submit_queued", target_type: "video_task", target_id: localTask.id, detail: { provider, model, model_alias: modelAlias, model_label: config.label, endpoint, resolution, duration, generate_audio: generateAudio, pricing_estimate: costEstimate, task_type: requestShape.taskType, image_submission_method: requestShape.imageSubmissionMethod, image_transform: requestPayloadForRecord.image_transform, frame_lock_policy: diagnostics.frame_lock_policy, storyboard_parent_mode: diagnostics.storyboard_parent_mode, segment_position: diagnostics.segment_position, request_payload: provider === "dashscope" ? wanPayload : requestPayloadForRecord.ark_payload_redacted, compatibility_retry_limit: requestPayloadForRecord.compatibility_retry_limit, prompt_reference_normalization: promptReferenceNormalization, final_status: "pending" } });
  if (auditError) console.error(JSON.stringify({ event: "seedance_audit_log_failed", task_id: localTask.id, detail: auditError.message }));

  const nowIso = new Date().toISOString();
  await admin.from("video_segments").update({ status: "queued", model_alias: modelAlias, duration, resolution, generate_audio: generateAudio, updated_at: nowIso }).eq("id", segment.id).eq("owner_id", user.id);
  await admin.from("video_projects").update({ status: "generating", updated_at: nowIso }).eq("id", segment.project_id).eq("owner_id", user.id);

  console.info(JSON.stringify({ event: "video_submit_queued", provider, task_id: localTask.id, model, model_alias: modelAlias, resolution, duration, generate_audio: generateAudio, estimated_cost_cny: costEstimate.estimated_cost_cny, task_type: requestPayloadForRecord.task_type, generation_mode: requestPayloadForRecord.generation_mode, image_submission_method: requestPayloadForRecord.image_submission_method, frame_lock_policy: diagnostics.frame_lock_policy, segment_position: diagnostics.segment_position, asset_count: content.filter((item: any) => item.type !== "text").length }));

  return respond({ success: true, submission_pending: true, status: "queued", progress: 10, task_id: localTask.id, provider_task_id: null, project_id: segment.project_id, segment_id: segment.id, model_alias: modelAlias, model, resolution, duration, generate_audio: generateAudio, pricing_estimate: costEstimate, frame_lock_policy: diagnostics.frame_lock_policy });
});
