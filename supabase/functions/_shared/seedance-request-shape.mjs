function directionText(direction) {
  if (direction === "audio_rhythm") return "参考声音、节奏、音色、氛围";
  if (direction === "visual_style") return "参考画面风格、构图、色彩、质感";
  if (direction === "visual_motion") return "参考动作、镜头、运镜、节奏";
  return "综合参考";
}

function referenceContentItem(item) {
  const reference_direction = directionText(item.direction);
  if (String(item.mime_type || "").startsWith("audio/")) {
    return {
      type: "audio_url",
      audio_url: { url: item.url },
      role: "reference_audio",
      reference_direction,
    };
  }
  if (String(item.mime_type || "").startsWith("video/")) {
    return {
      type: "video_url",
      video_url: { url: item.url },
      role: "reference_video",
      reference_direction,
    };
  }
  return {
    type: "image_url",
    image_url: { url: item.url },
    role: "reference_image",
    reference_direction,
  };
}

export function buildSeedanceRequestShape({
  isTextOnly,
  promptText,
  referenceItems = [],
  firstFrameUrl = "",
  lastFrameUrl = "",
}) {
  const text = { type: "text", text: String(promptText || "") };
  if (!isTextOnly) {
    return {
      taskType: "first_last_i2v",
      imageSubmissionMethod: "supabase_signed_url_original",
      imageRoles: ["first_frame", "last_frame"],
      compatibilityRetryAvailable: false,
      content: [
        text,
        { type: "image_url", image_url: { url: firstFrameUrl }, role: "first_frame" },
        { type: "image_url", image_url: { url: lastFrameUrl }, role: "last_frame" },
      ],
    };
  }

  if (!referenceItems.length) {
    return {
      taskType: "text_to_video",
      imageSubmissionMethod: "none",
      imageRoles: [],
      compatibilityRetryAvailable: false,
      content: [text],
    };
  }

  const onlyReference = referenceItems.length === 1 ? referenceItems[0] : null;
  if (onlyReference && String(onlyReference.mime_type || "").startsWith("image/")) {
    return {
      taskType: "single_image_i2v",
      imageSubmissionMethod: "supabase_signed_url_original",
      imageRoles: ["first_frame"],
      compatibilityRetryAvailable: false,
      content: [
        text,
        {
          type: "image_url",
          image_url: { url: onlyReference.url },
          role: "first_frame",
        },
      ],
    };
  }

  const content = [text, ...referenceItems.map(referenceContentItem)];
  return {
    taskType: "multi_reference_storyboard",
    imageSubmissionMethod: "supabase_signed_url_original",
    imageRoles: content.slice(1).map((item) => item.role),
    compatibilityRetryAvailable: false,
    content,
  };
}

export function redactArkPayload(payload) {
  const clone = JSON.parse(JSON.stringify(payload || {}));
  for (const item of Array.isArray(clone.content) ? clone.content : []) {
    for (const key of ["image_url", "video_url", "audio_url"]) {
      if (item?.[key]?.url) {
        try {
          const url = new URL(item[key].url);
          item[key].url = url.origin + url.pathname + "?signed_url=redacted";
        } catch {
          item[key].url = "[redacted]";
        }
      }
    }
  }
  return clone;
}
