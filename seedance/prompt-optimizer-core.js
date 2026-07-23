export const ALLOWED_STRATEGIES = new Set(['auto', 'conservative', 'camera', 'strict', 'concise']);

export function normalizeStrategy(value) {
  const strategy = String(value || 'auto').trim().toLowerCase();
  return ALLOWED_STRATEGIES.has(strategy) ? strategy : 'auto';
}

export function extractReferenceTokens(text) {
  const source = String(text || '');
  return [...new Set([...source.matchAll(/@(视频|图片|音频|参考)\d+/g)].map(match => match[0]))];
}

export function missingReferenceTokens(original, optimized) {
  const optimizedText = String(optimized || '');
  return extractReferenceTokens(original).filter(token => !optimizedText.includes(token));
}

export function cleanString(value, maxLength = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function buildOptimizationPayload({ prompt, mode, strategy, ratio, duration, resolution, generateAudio, segmentLabel, frames, references }) {
  return {
    prompt: String(prompt || '').trim(),
    mode: cleanString(mode, 40) || 'text_only',
    strategy: normalizeStrategy(strategy),
    ratio: cleanString(ratio, 30),
    duration: Number(duration || 0) || null,
    resolution: cleanString(resolution, 30),
    generate_audio: Boolean(generateAudio),
    segment_label: cleanString(segmentLabel, 120),
    frames: Array.isArray(frames) ? frames.slice(0, 12).map(item => cleanString(item, 180)).filter(Boolean) : [],
    references: Array.isArray(references) ? references.slice(0, 12).map(item => ({
      token: cleanString(item?.token, 30),
      name: cleanString(item?.name, 180),
      type: cleanString(item?.type, 100),
    })).filter(item => item.token || item.name) : [],
  };
}
