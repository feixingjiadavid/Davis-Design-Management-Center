const SUCCESS = new Set(['succeeded', 'success', 'completed', 'done']);
const FAILURE = new Set([
  'failed',
  'error',
  'rejected',
  'cancelled',
  'canceled',
  'content_policy',
  'content-policy',
  'blocked',
]);
const RUNNING = new Set(['processing', 'running', 'generating']);
const QUEUED = new Set(['queued', 'pending', 'created', 'submitted', 'submitting']);

const MODERATION_PATTERN =
  /content[ _-]?policy|sensitive|safety[ _-]?check|moderation|unsafe|审核|敏感|安全检查|内容安全|违规/i;

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rawArkStatus(payload) {
  return stringValue(
    payload?.status ||
    payload?.task_status ||
    payload?.taskStatus ||
    payload?.data?.status ||
    payload?.data?.task_status ||
    payload?.data?.taskStatus ||
    payload?.result?.status ||
    payload?.result?.task_status,
  ).toLowerCase();
}

function collectErrorStrings(value, found = [], depth = 0) {
  if (value == null || depth > 5) return found;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) found.push(text);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectErrorStrings(item, found, depth + 1);
    return found;
  }
  if (typeof value !== 'object') return found;

  const preferred = ['message', 'detail', 'reason', 'error_message', 'errorMessage', 'code', 'type'];
  for (const key of preferred) {
    if (key in value) collectErrorStrings(value[key], found, depth + 1);
  }
  return found;
}

export function extractArkError(payload) {
  const sources = [
    payload?.error,
    payload?.detail,
    payload?.message,
    payload?.data?.error,
    payload?.data?.detail,
    payload?.result?.error,
  ];
  const values = [];
  for (const source of sources) collectErrorStrings(source, values);
  const unique = [...new Set(values.filter(Boolean))];
  if (!unique.length) return '';

  const message = unique.find(value => /\s|[，。！？]/u.test(value)) || unique[0];
  return message.slice(0, 4000);
}

function isVideoUrl(value) {
  return typeof value === 'string' &&
    /^https?:\/\//i.test(value) &&
    (/\.(mp4|mov|webm)(\?|#|$)/i.test(value) || /video/i.test(value));
}

export function findArkVideoUrl(value, depth = 0) {
  if (value == null || depth > 8) return '';
  if (isVideoUrl(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findArkVideoUrl(item, depth + 1);
      if (url) return url;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  const priority = [
    'video_url',
    'videoUrl',
    'output_url',
    'outputUrl',
    'download_url',
    'downloadUrl',
    'file_url',
    'fileUrl',
    'url',
  ];
  for (const key of priority) {
    if (key in value) {
      const url = findArkVideoUrl(value[key], depth + 1);
      if (url) return url;
    }
  }
  for (const nested of Object.values(value)) {
    const url = findArkVideoUrl(nested, depth + 1);
    if (url) return url;
  }
  return '';
}

export function normalizeArkResult(payload, oldProgress = 0) {
  const rawStatus = rawArkStatus(payload);
  const errorMessage = extractArkError(payload);
  const moderationFailure = MODERATION_PATTERN.test(
    [rawStatus, errorMessage, payload?.error?.code, payload?.code].filter(Boolean).join(' '),
  );
  const httpFailure = payload?.ark_http_ok === false || Number(payload?.ark_http_status || 0) >= 400;

  let status = 'unknown';
  if (SUCCESS.has(rawStatus)) status = 'succeeded';
  else if (FAILURE.has(rawStatus) || moderationFailure || httpFailure) status = 'failed';
  else if (RUNNING.has(rawStatus)) status = 'running';
  else if (QUEUED.has(rawStatus)) status = 'queued';
  else if (rawStatus) status = 'unknown';

  let progress = Number(oldProgress || 0);
  if (status === 'queued') progress = Math.max(progress, 20);
  else if (status === 'running') progress = Math.max(progress, 60);
  else if (status === 'succeeded' || status === 'failed') progress = 100;

  return {
    rawStatus,
    status,
    progress,
    errorMessage: status === 'failed' ? (errorMessage || 'Ark generation failed') : '',
    videoUrl: findArkVideoUrl(payload),
  };
}
