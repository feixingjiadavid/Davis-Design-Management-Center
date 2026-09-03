export const WAN3_MODEL = 'wan3.0-video';
export const WAN3_PRIME_MODEL = 'wan3.0-video-prime';
export const WAN3_REGION = 'cn-beijing';

const MODELS = new Set([WAN3_MODEL, WAN3_PRIME_MODEL]);
const RESOLUTIONS = new Set(['480p', '720p', '1080p']);
const RATIOS = new Set(['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16']);
const MEDIA_TYPES = new Set([
  'first_frame',
  'last_frame',
  'reference_image',
  'reference_video',
  'reference_audio',
]);

export function wan3BaseUrl(workspaceId, region = WAN3_REGION) {
  const workspace = String(workspaceId || '').trim();
  const safeRegion = String(region || WAN3_REGION).trim().toLowerCase();
  if (!workspace) return 'https://dashscope.aliyuncs.com/api/v1';
  if (!/^[a-zA-Z0-9_-]+$/.test(workspace)) throw new Error('DASHSCOPE_WORKSPACE_ID_INVALID');
  if (!/^[a-z0-9-]+$/.test(safeRegion)) throw new Error('DASHSCOPE_REGION_INVALID');
  return `https://${workspace}.${safeRegion}.maas.aliyuncs.com/api/v1`;
}

function mediaUrl(item) {
  return item?.image_url?.url || item?.video_url?.url || item?.audio_url?.url || '';
}

function mediaType(item) {
  const explicit = String(item?.role || '').trim();
  if (MEDIA_TYPES.has(explicit)) return explicit;
  if (item?.type === 'image_url') return 'reference_image';
  if (item?.type === 'video_url') return 'reference_video';
  if (item?.type === 'audio_url') return 'reference_audio';
  return '';
}

export function buildWan3Payload({
  model = WAN3_MODEL,
  prompt,
  content = [],
  resolution = '720p',
  ratio = 'adaptive',
  duration = 5,
  generateAudio = true,
  promptExtend = false,
  watermark = true,
} = {}) {
  const requestedResolution = String(resolution || '').toLowerCase();
  const requestedRatio = String(ratio || 'adaptive');
  const seconds = Number(duration);
  const media = [];
  for (const item of Array.isArray(content) ? content : []) {
    const type = mediaType(item);
    const url = mediaUrl(item);
    if (type && url) media.push({ type, url: String(url) });
  }

  const input = { prompt: String(prompt || '').trim() };
  if (media.length) input.media = media;
  return {
    model: MODELS.has(String(model || '')) ? String(model) : WAN3_MODEL,
    input,
    parameters: {
      resolution: (RESOLUTIONS.has(requestedResolution) ? requestedResolution : '720p').toUpperCase(),
      ratio: RATIOS.has(requestedRatio) ? requestedRatio : 'adaptive',
      duration: seconds === -1 ? -1 : Math.max(2, Math.min(30, Number.isFinite(seconds) ? Math.round(seconds) : 5)),
      audio: Boolean(generateAudio),
      prompt_extend: Boolean(promptExtend),
      watermark: Boolean(watermark),
    },
  };
}

async function readJson(response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function wanFetch(url, apiKey, init, { fetchImpl = fetch, timeoutMs = 45_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('dashscope-timeout'), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${String(apiKey || '')}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      const error = new Error(String(payload?.message || `DashScope HTTP ${response.status}`));
      error.code = String(payload?.code || 'DASHSCOPE_REQUEST_FAILED');
      error.httpStatus = response.status;
      error.retryable = [408, 409, 425, 429].includes(response.status) || response.status >= 500;
      error.payload = payload;
      throw error;
    }
    return { payload, httpStatus: response.status };
  } finally {
    clearTimeout(timer);
  }
}

export async function createWan3Task(apiKey, workspaceId, payload, options = {}) {
  if (!String(apiKey || '').trim()) throw new Error('DASHSCOPE_API_KEY_MISSING');
  const startedAt = Date.now();
  const url = `${wan3BaseUrl(workspaceId, options.region)}/services/aigc/video-generation/video-synthesis`;
  const result = await wanFetch(url, apiKey, {
    method: 'POST',
    headers: { 'X-DashScope-Async': 'enable' },
    body: JSON.stringify(payload || {}),
  }, options);
  const providerTaskId = String(result.payload?.output?.task_id || '').trim();
  if (!providerTaskId) {
    const error = new Error(String(result.payload?.message || 'DASHSCOPE_TASK_ID_MISSING'));
    error.code = String(result.payload?.code || 'DASHSCOPE_TASK_ID_MISSING');
    error.httpStatus = result.httpStatus;
    error.retryable = false;
    throw error;
  }
  return {
    data: result.payload,
    providerTaskId,
    httpStatus: result.httpStatus,
    elapsedMs: Date.now() - startedAt,
  };
}

export async function queryWan3Task(apiKey, workspaceId, providerTaskId, options = {}) {
  if (!String(apiKey || '').trim()) throw new Error('DASHSCOPE_API_KEY_MISSING');
  const taskId = String(providerTaskId || '').trim();
  if (!taskId) throw new Error('DASHSCOPE_TASK_ID_MISSING');
  const url = `${wan3BaseUrl(workspaceId, options.region)}/tasks/${encodeURIComponent(taskId)}`;
  const result = await wanFetch(url, apiKey, { method: 'GET' }, options);
  return result.payload;
}

export function normalizeWan3Result(payload) {
  const output = payload?.output && typeof payload.output === 'object' ? payload.output : {};
  const rawStatus = String(output.task_status || '').toUpperCase();
  const status = rawStatus === 'PENDING'
    ? 'queued'
    : rawStatus === 'RUNNING'
      ? 'running'
      : rawStatus === 'SUCCEEDED'
        ? 'succeeded'
        : ['FAILED', 'CANCELED', 'UNKNOWN'].includes(rawStatus)
          ? 'failed'
          : 'unknown';
  const normalized = {
    status,
    dashscope_status: rawStatus || 'UNKNOWN',
    request_id: payload?.request_id || null,
    usage: payload?.usage || null,
    content: {},
  };
  if (output.video_url) normalized.content.video_url = String(output.video_url);
  if (status === 'failed') {
    normalized.error = {
      code: String(output.code || payload?.code || (rawStatus === 'UNKNOWN' ? 'DASHSCOPE_TASK_UNKNOWN' : 'DASHSCOPE_TASK_FAILED')),
      message: String(output.message || payload?.message || `Wan 3.0 task ${rawStatus || 'failed'}`),
    };
  }
  return normalized;
}
