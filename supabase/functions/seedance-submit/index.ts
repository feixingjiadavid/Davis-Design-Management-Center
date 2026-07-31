import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ARK_CREATE_TIMEOUT_MS,
  existingSubmissionResult,
} from "../_shared/seedance-submit-policy.mjs";
import {
  buildSeedanceRequestShape,
  redactArkPayload,
} from "../_shared/seedance-request-shape.mjs";
import { normalizePromptReferences } from "../_shared/seedance-prompt-references.mjs";
import { buildGenerationRoute } from "../_shared/seedance-generation-router.mjs";

const BUILD = "20260731-multi-person-routing-v48";

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

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeRatio(value: unknown): string {
  const ratio = safeString(value, "adaptive");
  const allowed = new Set(["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]);
  // Seedance 不接受 3:1；前端会把输入图补边，最终合成仍可做 3:1。
  if (ratio === "3:1") return "21:9";
  return allowed.has(ratio) ? ratio : "adaptive";
}

function normalizeResolution(value: unknown): string {
  const resolution = safeString(value, "720p").toLowerCase();
  if (resolution === "480p") return "480p";
  return "720p";
}

function normalizeDuration(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 4;
  return Math.max(4, Math.min(15, Math.round(n)));
}

function parseArkMessage(payload: any): string {
  if (!payload) return "Ark 返回空错误";
  if (typeof payload === "string") return payload;
  return String(
    payload?.error?.message ||
    payload?.message ||
    payload?.detail ||
    payload?.error ||
    JSON.stringify(payload),
  );
}

function arkSubmitFailureDetails(error: unknown, elapsedMs: number) {
  const message = error instanceof Error ? error.message : String(error);
  const isTimeout = message.includes("ark-submit-timeout") ||
    message.toLowerCase().includes("operation timed out") ||
    message.toLowerCase().includes("timed out");
  return {
    ark_error_code: isTimeout ? "ARK_SUBMIT_TIMEOUT" : "ARK_SUBMIT_NETWORK_ERROR",
    ark_phase: "ark_create_task",
    elapsed_ms: Math.max(0, Math.round(elapsedMs)),
    retryable: true,
  };
}

async function parseJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function fetchArkCreateTask(arkApiKey: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("ark-submit-timeout"), ARK_CREATE_TIMEOUT_MS);
  try {
    return await fetch(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${arkApiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接 Ark API：${message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function findExistingSubmission(
  admin: any,
  ownerId: string,
  segmentId: string,
  clientSubmitNonce: string,
) {
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
  if (!arkApiKey) return respond({ error: "ARK_API_KEY 未配置" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return respond({ error: "Unauthorized: missing user token" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  const user = authData?.user;
  if (authError || !user) return respond({ error: "Unauthorized: invalid user token" }, 401);

  let requestBody: Record<string, unknown>;
  try { requestBody = await req.json(); } catch { return respond({ error: "Invalid JSON body" }, 400); }

  const clientSubmitNonce = safeString(requestBody.client_submit_nonce).trim();
  if (!clientSubmitNonce) return respond({ error: "client_submit_nonce is required", retryable: false }, 400);

  const segmentId = safeString(requestBody.segment_id);
  if (!segmentId) return respond({ error: "segment_id is required" }, 400);

  const { data: segment, error: segmentError } = await admin
    .from("video_segments")
    .select("*")
    .eq("id", segmentId)
    .eq("owner_id", user.id)
    .single();

  if (segmentError || !segment) {
    return respond({ error: "Segment not found or not owned by current user", detail: segmentError?.message || null }, 404);
  }

  try {
    const existingSubmission = await findExistingSubmission(
      admin,
      user.id,
      segment.id,
      clientSubmitNonce,
    );
    if (existingSubmission) return respond(existingSubmissionResult(existingSubmission));
  } catch (error) {
    return respond({
      error: error instanceof Error ? error.message : String(error),
      retryable: false,
    }, 500);
  }

  const isTextOnly = safeString(requestBody.mode || segment.mode || "").toLowerCase() === "text_only" || (!segment.from_asset_id && !segment.to_asset_id);
  if (!isTextOnly && (!segment.from_asset_id || !segment.to_asset_id)) return respond({ error: "Segment 缺少首帧或尾帧素材" }, 400);
  const originalPromptText = safeString(segment.prompt).trim();
  let promptText = safeString(requestBody.effective_prompt || originalPromptText).trim();
  if (!originalPromptText) return respond({ error: "Segment prompt 不能为空" }, 400);
  if (!promptText) return respond({ error: "effective_prompt 不能为空" }, 400);

  let firstSignedUrl = "";
  let lastSignedUrl = "";
  const referenceSignedItems: Array<{ url: string; mime_type: string; direction: string; name: string; token: string; analysis: Record<string, unknown>; width: number | null; height: number | null }> = [];

  if (isTextOnly) {
    const ids = Array.isArray(requestBody.reference_asset_ids)
      ? requestBody.reference_asset_ids.map((item) => safeString(item)).filter(Boolean)
      : [];
    const fallbackId = safeString(requestBody.reference_asset_id || segment.reference_asset_id || "");
    if (!ids.length && fallbackId) ids.push(fallbackId);

    const directions = Array.isArray(requestBody.reference_directions) ? requestBody.reference_directions : [];

    for (const referenceAssetId of ids.slice(0, 8)) {
      const { data: referenceAsset, error: referenceAssetError } = await admin
        .from("video_assets")
        .select("*")
        .eq("id", referenceAssetId)
        .eq("owner_id", user.id)
        .single();

      if (referenceAssetError || !referenceAsset) {
        return respond({ error: "无法读取参考素材", detail: referenceAssetError?.message || null }, 400);
      }

      const mimeType = String(referenceAsset.mime_type || "");
      if (!mimeType.startsWith("video/") && !mimeType.startsWith("audio/") && !mimeType.startsWith("image/")) {
        return respond({ error: "参考素材类型不支持" }, 400);
      }

      const signed = await admin.storage
        .from(referenceAsset.bucket_id || "seedance-inputs")
        .createSignedUrl(referenceAsset.object_path, 3600);

      if (signed.error) {
        return respond({ error: "生成参考素材签名地址失败", detail: signed.error.message }, 500);
      }

      const directionItem = directions.find((item: any) => safeString(item?.asset_id) === referenceAssetId);
      referenceSignedItems.push({
        url: signed.data.signedUrl,
        mime_type: mimeType,
        direction: safeString(directionItem?.direction || "overall"),
        name: safeString(referenceAsset.original_name || referenceAssetId),
        token: safeString(directionItem?.token),
        analysis: (referenceAsset.analysis_metadata && typeof referenceAsset.analysis_metadata === "object") ? referenceAsset.analysis_metadata : {},
        width: Number(referenceAsset.width || 0) || null,
        height: Number(referenceAsset.height || 0) || null,
      });
    }
  } else {
    const { data: assets, error: assetsError } = await admin
      .from("video_assets")
      .select("*")
      .in("id", [segment.from_asset_id, segment.to_asset_id])
      .eq("owner_id", user.id);

    if (assetsError || !assets || assets.length < 2) {
      return respond({ error: "无法读取首尾帧素材", detail: assetsError?.message || null }, 400);
    }

    const firstAsset = assets.find((asset) => asset.id === segment.from_asset_id);
    const lastAsset = assets.find((asset) => asset.id === segment.to_asset_id);
    if (!firstAsset || !lastAsset) return respond({ error: "首尾帧素材不完整" }, 400);

    const assetRatioError = [firstAsset, lastAsset].map((asset) => {
      const w = Number(asset.width || 0);
      const h = Number(asset.height || 0);
      if (!w || !h) return null;
      const r = w / h;
      return (r < 0.40 || r > 2.50) ? `${asset.original_name || asset.id} 比例 ${r.toFixed(2)} 超出 Seedance 0.40-2.50 范围，请使用新版前端重新上传补边后的图片。` : null;
    }).find(Boolean);
    if (assetRatioError) {
      return respond({ error: assetRatioError, retryable: false }, 200);
    }

    const firstSigned = await admin.storage
      .from(firstAsset.bucket_id || "seedance-inputs")
      .createSignedUrl(firstAsset.object_path, 3600);

    const lastSigned = await admin.storage
      .from(lastAsset.bucket_id || "seedance-inputs")
      .createSignedUrl(lastAsset.object_path, 3600);

    if (firstSigned.error || lastSigned.error) {
      return respond({
        error: "生成素材签名地址失败",
        detail: firstSigned.error?.message || lastSigned.error?.message || null,
      }, 500);
    }

    firstSignedUrl = firstSigned.data.signedUrl;
    lastSignedUrl = lastSigned.data.signedUrl;
  }

  const rawAlias = safeString(segment.model_alias || requestBody.model_alias || "mini").toLowerCase();
  const modelAlias = rawAlias === "fast" ? "fast" : "mini";
  const modelMap: Record<string, string> = {
    mini: Deno.env.get("ARK_SEEDANCE_MODEL_MINI") || "doubao-seedance-2-0-mini-260615",
    fast: Deno.env.get("ARK_SEEDANCE_MODEL_FAST") || "doubao-seedance-2-0-fast-260128",
  };

  const model = modelMap[modelAlias];
  const ratio = normalizeRatio(segment.ratio || requestBody.ratio || "adaptive");
  const duration = normalizeDuration(segment.duration || requestBody.duration || 4);
  const resolution = normalizeResolution(segment.resolution || requestBody.resolution || "720p");

  const promptReferenceNormalization = normalizePromptReferences(promptText, referenceSignedItems);
  promptText = promptReferenceNormalization.prompt;

  const firstImageReference = referenceSignedItems.find((item) =>
    String(item.mime_type || "").startsWith("image/")
  ) || null;
  const analysis = (firstImageReference?.analysis || {}) as Record<string, unknown>;
  const realPersonCount = Math.max(0, Math.floor(Number(
    analysis.real_person_count ?? requestBody.real_person_count ?? 0
  )));
  const containsRealPerson = analysis.contains_real_person === true ||
    requestBody.contains_real_person === true || realPersonCount > 0;
  const multiPersonDetected = analysis.multi_person_detected === true ||
    analysis.is_group_photo === true ||
    requestBody.multi_person_detected === true ||
    realPersonCount >= 2;

  const requestedSubmitMode = safeString(requestBody.submit_mode).trim();
  const temporaryPersonMode = requestedSubmitMode === "temporary_reference_person" ||
    (containsRealPerson && Boolean(firstImageReference));
  const submitMode = temporaryPersonMode
    ? "temporary_reference_person"
    : (!referenceSignedItems.length && isTextOnly ? "text_to_video" :
      (!isTextOnly ? "first_last_frame_video" : "reference_image_video"));

  if (temporaryPersonMode &&
      safeString(Deno.env.get("ENABLE_TEMP_PERSON_REFERENCE"), "true").toLowerCase() === "false") {
    return respond({
      error: "TEMP_PERSON_REFERENCE_DISABLED",
      message: "当前真人参考生成功能暂时不可用，素材和项目已保存。",
      retryable: false,
    }, 409);
  }

  if (temporaryPersonMode) {
    const { data: projectVersion, error: projectError } = await admin
      .from("video_projects")
      .select("id, version_root_id")
      .eq("id", segment.project_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (projectError || !projectVersion) {
      return respond({ error: "PROJECT_VERSION_NOT_FOUND" }, 404);
    }
    const { data: confirmation, error: confirmationError } = await admin
      .from("video_material_rights_confirmations")
      .select("id")
      .eq("project_version_id", projectVersion.id)
      .eq("project_id", projectVersion.version_root_id || projectVersion.id)
      .eq("user_id", user.id)
      .eq("terms_version", "2026-07-31-v1")
      .eq("confirmation_type", "temporary_reference_person_material_rights")
      .maybeSingle();
    if (confirmationError) {
      return respond({ error: "RIGHTS_CONFIRMATION_LOOKUP_FAILED", detail: confirmationError.message }, 500);
    }
    if (!confirmation) {
      return respond({
        error: "MATERIAL_RIGHTS_CONFIRMATION_REQUIRED",
        project_id: projectVersion.version_root_id || projectVersion.id,
        project_version_id: projectVersion.id,
        terms_version: "2026-07-31-v1",
        statement: "我确认已获得该图片/视频素材的合法使用权，并承担由此产生的责任。",
        retryable: false,
      }, 409);
    }
  }

  const explicitImageRole = safeString(requestBody.image_role).trim();
  const requestedTaskType = safeString(requestBody.task_type).trim();
  let requestShape: any;
  if (!isTextOnly) {
    requestShape = buildSeedanceRequestShape({
      isTextOnly: false,
      promptText,
      firstFrameUrl: firstSignedUrl,
      lastFrameUrl: lastSignedUrl,
    });
  } else if (referenceSignedItems.length === 1 && firstImageReference) {
    const route = buildGenerationRoute({
      submitMode,
      taskType: requestedTaskType || undefined,
      imageRole: explicitImageRole || "reference_image",
      prompt: promptText,
      imageUrl: firstImageReference.url,
      imageCount: 1,
      containsRealPerson,
      realPersonCount,
      multiPersonDetected,
      isGroupPhoto: analysis.is_group_photo === true,
    });
    requestShape = {
      ...route,
      imageSubmissionMethod: "supabase_signed_url_original",
      imageRoles: route.content.slice(1).map((item: any) => item.role),
      compatibilityRetryAvailable: false,
    };
  } else if (!referenceSignedItems.length) {
    const route = buildGenerationRoute({
      submitMode: "text_to_video",
      taskType: "text_to_video",
      prompt: promptText,
    });
    requestShape = {
      ...route,
      imageSubmissionMethod: "none",
      imageRoles: [],
      compatibilityRetryAvailable: false,
    };
  } else {
    requestShape = buildSeedanceRequestShape({
      isTextOnly: true,
      promptText,
      referenceItems: referenceSignedItems,
    });
  }
  const content = requestShape.content;

  const endpoint = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
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
    endpoint,
    real_person_count: realPersonCount,
    is_group_photo: analysis.is_group_photo === true || multiPersonDetected,
    is_lifestyle_photo: analysis.is_lifestyle_photo === true,
    image_kind: safeString(analysis.image_kind || "unknown"),
    image_width: firstImageReference?.width || null,
    image_height: firstImageReference?.height || null,
    analysis_confidence: Number(analysis.confidence || 0) || null,
  };

  const arkPayload = {
    model,
    content,
    resolution,
    ratio,
    duration,
    generate_audio: Boolean(requestBody.generate_audio),
    watermark: true,
    return_last_frame: false,
  };

  const requestPayloadForRecord = {
    client_submit_nonce: clientSubmitNonce,
    note: "seedance_task_shape_v46",
    endpoint,
    model,
    model_alias: modelAlias,
    ratio,
    duration,
    resolution,
    original_prompt: originalPromptText,
    effective_prompt: promptText,
    prompt_reference_normalization: promptReferenceNormalization,
    api_shape: "ark.content_generation.tasks.create",
    task_type: requestShape.taskType,
    image_submission_method: requestShape.imageSubmissionMethod,
    image_transform: "none",
    compatibility_retry_available: requestShape.compatibilityRetryAvailable,
    compatibility_retry_limit: requestShape.compatibilityRetryAvailable ? 1 : 0,
    image_roles: requestShape.imageRoles,
    reference_roles: referenceSignedItems.map((item) => item.mime_type.startsWith("audio/") ? "reference_audio" : item.mime_type.startsWith("image/") ? "reference_image" : "reference_video"),
    reference_directions: referenceSignedItems.map((item) => ({ name: item.name, mime_type: item.mime_type, direction: item.direction })),
    generation_mode: requestShape.taskType,
    submit_mode: submitMode,
    image_role: requestShape.imageRoles?.[0] || null,
    diagnostics,
    generate_audio: Boolean(requestBody.generate_audio),
    prompt_mode: safeString(requestBody.prompt_mode || "fix_reference_video_role_v34"),
    ark_payload_redacted: redactArkPayload(arkPayload),
    ark_payload: arkPayload,
  };

  const { data: localTask, error: taskInsertError } = await admin
    .from("video_tasks")
    .insert({
      owner_id: user.id,
      project_id: segment.project_id,
      segment_id: segment.id,
      provider_task_id: null,
      status: "queued",
      progress: 10,
      model_alias: modelAlias,
      request_payload: requestPayloadForRecord,
      provider_response: { ark_submit_attempts: 0, submission_phase: "queued_for_worker" },
      metadata: diagnostics,
    })
    .select()
    .single();

  if (taskInsertError || !localTask) {
    if (taskInsertError?.code === "23505") {
      try {
        const racedSubmission = await findExistingSubmission(
          admin,
          user.id,
          segment.id,
          clientSubmitNonce,
        );
        if (racedSubmission) return respond(existingSubmissionResult(racedSubmission));
      } catch (error) {
        return respond({
          error: error instanceof Error ? error.message : String(error),
          retryable: false,
        }, 500);
      }
    }
    return respond({ error: "创建 video_tasks 失败", detail: taskInsertError?.message || null }, 500);
  }

  const { error: policyEventError } = await admin.from("video_provider_policy_events").insert({
    task_id: localTask.id,
    owner_id: user.id,
    provider: "ark",
    model,
    endpoint,
    submit_mode: submitMode,
    task_type: requestShape.taskType,
    image_role: requestShape.imageRoles?.[0] || null,
    image_count: diagnostics.image_count,
    contains_real_person: containsRealPerson,
    multi_person_detected: multiPersonDetected,
    real_person_count: realPersonCount,
    is_group_photo: diagnostics.is_group_photo,
    is_lifestyle_photo: diagnostics.is_lifestyle_photo,
    image_kind: diagnostics.image_kind,
    image_width: diagnostics.image_width,
    image_height: diagnostics.image_height,
    analysis_confidence: diagnostics.analysis_confidence,
    retry_count: 0,
    outcome: "submitted",
  });
  if (policyEventError) {
    console.error(JSON.stringify({
      event: "seedance_policy_event_insert_failed",
      task_id: localTask.id,
      error: policyEventError.message,
    }));
  }

  const { error: auditError } = await admin.from("video_operation_logs").insert({
    owner_id: user.id,
    action: "seedance_submit_queued",
    target_type: "video_task",
    target_id: localTask.id,
    detail: {
      model,
      endpoint: requestPayloadForRecord.endpoint,
      task_type: requestShape.taskType,
      image_submission_method: requestShape.imageSubmissionMethod,
      image_transform: "none",
      request_payload: requestPayloadForRecord.ark_payload_redacted,
      compatibility_retry_limit: requestPayloadForRecord.compatibility_retry_limit,
      prompt_reference_normalization: promptReferenceNormalization,
      final_status: "pending",
    },
  });
  if (auditError) {
    console.error(JSON.stringify({
      event: "seedance_audit_log_failed",
      task_id: localTask.id,
      detail: auditError.message,
    }));
  }

  const nowIso = new Date().toISOString();
  await admin.from("video_segments").update({ status: "queued", updated_at: nowIso })
    .eq("id", segment.id).eq("owner_id", user.id);
  await admin.from("video_projects").update({ status: "generating", updated_at: nowIso })
    .eq("id", segment.project_id).eq("owner_id", user.id);

  console.info(JSON.stringify({
    event: "ark_submit_queued",
    task_id: localTask.id,
    model,
    task_type: requestPayloadForRecord.task_type,
    generation_mode: requestPayloadForRecord.generation_mode,
    image_submission_method: requestPayloadForRecord.image_submission_method,
    asset_count: content.filter((item) => item.type !== "text").length,
  }));

  return respond({
    success: true,
    submission_pending: true,
    status: "queued",
    progress: 10,
    task_id: localTask.id,
    provider_task_id: null,
    project_id: segment.project_id,
    segment_id: segment.id,
  });
});
