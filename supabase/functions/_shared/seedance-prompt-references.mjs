function referenceToken(item, index) {
  const token = String(item?.token || "").trim();
  if (/^@(视频|图片|音频|参考)\d+$/.test(token)) return token;
  const mime = String(item?.mime_type || item?.type || "");
  if (mime.startsWith("video/")) return `@视频${index + 1}`;
  if (mime.startsWith("audio/")) return `@音频${index + 1}`;
  if (mime.startsWith("image/")) return `@图片${index + 1}`;
  return `@参考${index + 1}`;
}

export function normalizePromptReferences(prompt, references = []) {
  const source = String(prompt || "");
  const list = Array.isArray(references) ? references : [];
  const availableTokens = list.map(referenceToken);
  const available = new Set(availableTokens);
  const seen = new Set();
  const removedTokens = [];
  const deduplicatedTokens = [];

  let normalized = source.replace(/@(视频|图片|音频|参考)\d+/g, (token) => {
    if (!available.has(token)) {
      removedTokens.push(token);
      return "";
    }
    if (seen.has(token)) {
      deduplicatedTokens.push(token);
      return "";
    }
    seen.add(token);
    return token;
  });

  const imageCount = list.filter((item) =>
    String(item?.mime_type || item?.type || "").startsWith("image/")
  ).length;

  if (list.length) {
    normalized = normalized.replace(
      "当前任务为纯文字描述生成模式，没有上传参考图。",
      `当前任务为文字描述与 ${imageCount || list.length} 个参考素材结合生成。`,
    );
  }

  if (imageCount > 0) {
    normalized = normalized.replace(
      /(?:一|二|两|三|四|五|六|七|八|九|十|\d+)\s*张\s*(原图|参考图|图片)/g,
      `${imageCount} 张$1`,
    );
  }

  normalized = normalized
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return {
    prompt: normalized,
    reference_count: list.length,
    image_count: imageCount,
    available_tokens: availableTokens,
    removed_tokens: [...new Set(removedTokens)],
    deduplicated_tokens: [...new Set(deduplicatedTokens)],
  };
}
