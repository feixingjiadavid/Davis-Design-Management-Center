import { supabase } from '../supabase-config.js';
import { listDrafts, getDraft, saveDraft, deleteDraft } from './db.js';

const APP_BUILD = '20260721-local-output-no-supabase-storage-v1';
console.log('[Seedance Studio]', APP_BUILD);

const state = {
  session: null,
  user: null,
  drafts: [],
  draft: null,
  selectedSegmentId: null,
  currentView: 'quick',
  objectUrls: new Map(),
  jobs: [],
  outputs: [],
  pollTimer: null,
  isGenerating: false,
};

const $ = id => document.getElementById(id);
const qsa = selector => [...document.querySelectorAll(selector)];
const uid = () => crypto.randomUUID();

const TIMEOUTS = {
  database: 25000,
  upload: 90000,
  edgeFunction: 90000,
};

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时，请检查网络后重试`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function errorMessage(error, fallback = '操作失败') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.details || String(error);
}

const AUTO_DOWNLOAD_KEY = 'seedance_auto_downloaded_provider_tasks_v1';

function downloadedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(AUTO_DOWNLOAD_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveDownloadedSet(set) {
  localStorage.setItem(AUTO_DOWNLOAD_KEY, JSON.stringify([...set].slice(-300)));
}

function safeFilename(name) {
  return String(name || 'seedance-output')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function triggerLocalDownload(url, filename) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `seedance-${Date.now()}.mp4`;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function maybeAutoDownloadOutput(output) {
  if (!output?.url) return;
  const key = output.providerTaskId || output.row?.task_id || output.url;
  const set = downloadedSet();
  if (set.has(key)) return;
  set.add(key);
  saveDownloadedSet(set);
  triggerLocalDownload(output.url, `${safeFilename(state.draft?.name)}-${output.providerTaskId || Date.now()}.mp4`);
  toast('视频已生成', '已触发本地下载；如果浏览器拦截，请点右侧“下载到本地”。');
}

async function getAccessToken() {
  const result = await withTimeout(
    supabase.auth.getSession(),
    TIMEOUTS.database,
    '读取登录状态',
  );
  const token = result?.data?.session?.access_token;
  if (!token) throw new Error('登录状态已失效，请退出后重新登录');
  return token;
}

function toast(title, message = '') {
  $('toast-title').textContent = title;
  $('toast-message').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').hidden = true, 3600);
}

function confirmBox(title, message) {
  return new Promise(resolve => {
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    $('confirm-modal').hidden = false;
    const done = value => {
      $('confirm-modal').hidden = true;
      $('confirm-ok').onclick = null;
      $('confirm-cancel').onclick = null;
      resolve(value);
    };
    $('confirm-ok').onclick = () => done(true);
    $('confirm-cancel').onclick = () => done(false);
  });
}

function newDraft() {
  const id = uid();
  return {
    id,
    name: '未命名 Seedance 项目',
    mode: 'multi_frame',
    ratio: '16:9',
    finalWidth: 1920,
    finalHeight: 1080,
    fitMode: 'contain',
    frames: [],
    segments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    remoteProjectId: null,
  };
}

function getFrameUrl(frame) {
  if (!frame?.blob) return '';
  if (!state.objectUrls.has(frame.id)) state.objectUrls.set(frame.id, URL.createObjectURL(frame.blob));
  return state.objectUrls.get(frame.id);
}

function releaseFrameUrl(frameId) {
  const url = state.objectUrls.get(frameId);
  if (url) URL.revokeObjectURL(url);
  state.objectUrls.delete(frameId);
}

function normalizeSegments(draft) {
  const old = new Map((draft.segments || []).map(s => [`${s.fromFrameId}:${s.toFrameId}`, s]));
  let pairs = [];
  if (draft.frames.length >= 2) {
    if (draft.mode === 'first_last') {
      pairs = [[draft.frames[0], draft.frames[draft.frames.length - 1]]];
    } else {
      for (let i = 0; i < draft.frames.length - 1; i++) pairs.push([draft.frames[i], draft.frames[i + 1]]);
    }
  }
  draft.segments = pairs.map(([from, to], index) => {
    const existing = old.get(`${from.id}:${to.id}`);
    return existing || {
      id: uid(),
      fromFrameId: from.id,
      toFrameId: to.id,
      prompt: '',
      duration: 4,
      model: 'mini',
      resolution: '720p',
      status: 'draft',
      providerTaskId: null,
      remoteSegmentId: null,
      remoteTaskId: null,
      outputPath: null,
      error: null,
      index,
    };
  }).map((segment, index) => ({ ...segment, index }));
  if (!draft.segments.some(s => s.id === state.selectedSegmentId)) {
    state.selectedSegmentId = draft.segments[0]?.id || null;
  }
}

async function persist(render = false) {
  if (!state.draft) return;
  normalizeSegments(state.draft);
  await saveDraft(state.draft);
  const idx = state.drafts.findIndex(d => d.id === state.draft.id);
  const snapshot = { ...state.draft, frames: state.draft.frames.map(f => ({ ...f })) };
  if (idx === -1) state.drafts.unshift(snapshot); else state.drafts[idx] = snapshot;
  if (render) renderAll();
  else {
    renderProjects();
    renderSummary();
    $('draft-status').textContent = '已保存到浏览器';
  }
}

function setView(view) {
  state.currentView = view;
  qsa('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  qsa('.view-tab').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  if (view === 'jobs') refreshJobs();
}

function renderProjects() {
  $('project-list').innerHTML = state.drafts.length
    ? [...state.drafts].sort((a,b) => b.updatedAt-a.updatedAt).map(d => `
      <button class="project-item ${state.draft?.id===d.id?'active':''}" data-project="${d.id}">
        <strong>${escapeHtml(d.name)}</strong>
        <span>${d.frames?.length || 0} 张图 · ${new Date(d.updatedAt).toLocaleString('zh-CN')}</span>
      </button>`).join('')
    : '<div class="empty-state">还没有本地项目</div>';
  qsa('[data-project]').forEach(btn => btn.onclick = () => selectDraft(btn.dataset.project));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}


async function invokeEdgeFunction(name, body) {
  const accessToken = await getAccessToken();
  const request = supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const { data, error } = await withTimeout(
    request,
    TIMEOUTS.edgeFunction,
    `${name} 请求`,
  );

  if (!error) {
    if (data?.error && !data?.success) throw new Error(data.error);
    return data || {};
  }

  let message = errorMessage(error, `${name} 调用失败`);
  try {
    if (error.context && typeof error.context.clone === 'function') {
      const response = error.context.clone();
      const contentType = response.headers?.get?.('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json();
        message = payload?.error || payload?.message || message;
      } else {
        const text = await response.text();
        if (text) message = text;
      }
    }
  } catch {}
  throw new Error(message);
}

function jobStageMarkup(segment) {
  const status = String(segment.status || 'draft').toLowerCase();
  const progress = Number(segment.progress || (
    status === 'submitting' ? 12 :
    status === 'queued' ? 20 :
    status === 'running' || status === 'processing' ? 60 :
    status === 'succeeded' || status === 'completed' || status === 'success' ? 100 : 0
  ));
  const steps = [
    ['素材上传', ['submitting','submitted','queued','running','processing','succeeded','completed','success'].includes(status)],
    ['任务提交', ['queued','running','processing','succeeded','completed','success'].includes(status)],
    ['Seedance 生成', ['running','processing','succeeded','completed','success'].includes(status)],
  ];
  return `
    <div class="job-progress" style="margin:12px 0">
      <div style="height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden">
        <div style="height:100%;width:${Math.max(0,Math.min(100,progress))}%;background:linear-gradient(90deg,#6d5dfc,#9a8cff);transition:.3s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:7px;font-size:10px;color:#8b91a3">
        <span>${progress}%</span>
        <span>${statusText(status)}</span>
      </div>
      <div style="display:grid;gap:5px;margin-top:10px;font-size:10px;color:#8c92a1">
        ${steps.map(([label,done]) => `<span>${done ? '✓' : status==='failed' ? '×' : '○'} ${label}</span>`).join('')}
      </div>
      ${segment.providerTaskId ? `<div style="margin-top:9px;font-size:10px;color:#8b91a3;word-break:break-all">Ark Task：${escapeHtml(segment.providerTaskId)}</div>` : ''}
    </div>`;
}

function frameCard(frame, index, compact = false) {
  const url = getFrameUrl(frame);
  return `<article class="frame-card" data-frame="${frame.id}">
    <img src="${url}" alt="${escapeHtml(frame.name)}" />
    <div class="frame-actions">
      <button data-move-left="${frame.id}" title="左移">←</button>
      <button data-delete-frame="${frame.id}" title="删除">×</button>
      <button data-move-right="${frame.id}" title="右移">→</button>
    </div>
    <div class="frame-meta">
      <strong>图 ${index + 1}${index===0?' · 首帧':index===state.draft.frames.length-1?' · 尾帧':''}</strong>
      <span>${escapeHtml(frame.name)}</span>
    </div>
  </article>`;
}

function segmentMini(segment, index) {
  const text = segment.prompt || '点击填写这两帧之间的提示词';
  return `<article class="segment-mini" data-select-segment="${segment.id}">
    <strong>SEGMENT ${String(index+1).padStart(2,'0')}</strong>
    <span>${segment.duration}s · ${segment.model==='fast'?'Fast':'Mini'} · ${segment.resolution}</span>
    <span>${escapeHtml(text)}</span>
    <button data-edit-segment="${segment.id}">编辑此段</button>
  </article>`;
}

function renderQuickTimeline() {
  const container = $('quick-timeline');
  const parts = [];
  state.draft.frames.forEach((frame, index) => {
    parts.push(frameCard(frame, index, true));
    const segment = state.draft.segments.find(s => s.fromFrameId === frame.id);
    if (segment && index < state.draft.frames.length - 1) parts.push(segmentMini(segment, segment.index));
  });
  container.innerHTML = parts.join('');
  wireFrameActions(container);
  qsa('[data-edit-segment],[data-select-segment]').forEach(btn => btn.onclick = event => {
    event.stopPropagation();
    state.selectedSegmentId = btn.dataset.editSegment || btn.dataset.selectSegment;
    setView('editor');
    renderEditor();
  });
}

function renderEditor() {
  const timeline = $('editor-timeline');
  const parts = [];
  state.draft.frames.forEach((frame, index) => {
    parts.push(frameCard(frame, index));
    const segment = state.draft.segments.find(s => s.fromFrameId === frame.id);
    if (segment && index < state.draft.frames.length - 1) {
      parts.push(`<article class="timeline-segment ${state.selectedSegmentId===segment.id?'active':''}" data-select-segment="${segment.id}">
        <strong>SEGMENT ${String(segment.index+1).padStart(2,'0')}</strong>
        <p>${escapeHtml(segment.prompt || '尚未填写提示词')}</p>
        <span>${segment.duration}s · ${segment.model==='fast'?'Fast':'Mini'} · ${segment.resolution}</span>
      </article>`);
    }
  });
  timeline.innerHTML = parts.join('');
  wireFrameActions(timeline);
  qsa('[data-select-segment]').forEach(el => el.onclick = () => {
    state.selectedSegmentId = el.dataset.selectSegment;
    renderEditor();
  });

  $('segment-list').innerHTML = state.draft.segments.length ? state.draft.segments.map(s => `
    <button class="segment-row ${state.selectedSegmentId===s.id?'active':''}" data-segment-row="${s.id}">
      <strong>SEG ${String(s.index+1).padStart(2,'0')}</strong>
      <p>${escapeHtml(s.prompt || '尚未填写提示词')}</p>
      <span>${s.duration}s · ${s.model==='fast'?'Fast':'Mini'}</span>
      <span>${s.resolution} · ${statusText(s.status)}</span>
    </button>`).join('') : '<div class="empty-state">至少上传两张图片才会创建片段。</div>';
  qsa('[data-segment-row]').forEach(el => el.onclick = () => {
    state.selectedSegmentId = el.dataset.segmentRow;
    renderEditor();
  });
  renderInspector();
}

function renderInspector() {
  const segment = state.draft.segments.find(s => s.id === state.selectedSegmentId);
  $('inspector-empty').hidden = !!segment;
  $('inspector-form').hidden = !segment;
  if (!segment) return;
  const fromIndex = state.draft.frames.findIndex(f => f.id === segment.fromFrameId);
  const toIndex = state.draft.frames.findIndex(f => f.id === segment.toFrameId);
  $('inspector-index').textContent = `SEGMENT ${String(segment.index+1).padStart(2,'0')}`;
  $('inspector-name').textContent = `图 ${fromIndex+1} → 图 ${toIndex+1}`;
  $('inspector-status').textContent = statusText(segment.status);
  $('segment-prompt').value = segment.prompt;
  $('segment-duration').value = String(segment.duration);
  $('segment-model').value = segment.model;
  $('segment-resolution').value = segment.resolution;
  $('segment-ratio').value = state.draft.ratio;
}

function renderSummary() {
  $('summary-frames').textContent = state.draft.frames.length;
  $('summary-segments').textContent = state.draft.segments.length;
  $('summary-duration').textContent = `${state.draft.segments.reduce((sum,s)=>sum+Number(s.duration||0),0)} 秒`;
}

function renderSettings() {
  $('project-name').value = state.draft.name;
  $('project-ratio').value = state.draft.ratio;
  $('final-width').value = state.draft.finalWidth;
  $('final-height').value = state.draft.finalHeight;
  $('fit-mode').value = state.draft.fitMode;
  qsa('#mode-switch button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.draft.mode));
  updateRatioTip();
}

function updateRatioTip() {
  const ratio = state.draft.ratio;
  const size = `${state.draft.finalWidth} × ${state.draft.finalHeight}`;
  $('ratio-tip').textContent = ratio === '3:1'
    ? `当前为 3:1 超宽项目，建议 1920×640 或 3840×1280。当前最终尺寸：${size}。`
    : ratio === 'follow'
      ? `比例将跟随首帧，最终输出尺寸仍以 ${size} 为准。`
      : `项目内全部片段统一使用 ${ratio}，最终输出尺寸：${size}。`;
}

function renderJobs() {
  const segments = state.draft.segments;
  $('jobs-list').innerHTML = segments.length ? segments.map(s => `
    <article class="job-card">
      <div class="job-head">
        <strong>Segment ${String(s.index+1).padStart(2,'0')}</strong>
        <span>${statusText(s.status)}</span>
      </div>
      <p>${escapeHtml(s.prompt || '未填写提示词')}</p>
      ${jobStageMarkup(s)}
      ${s.providerTaskId ? `<p class="task-id">Ark Task：${escapeHtml(s.providerTaskId)}</p>` : ''}
      ${s.error ? `<p style="color:#ff8090;white-space:pre-wrap">${escapeHtml(s.error)}</p>` : ''}
      <div class="job-actions">
        <button data-refresh-segment="${s.id}">立即查询</button>
        <button data-retry-segment="${s.id}">重新生成</button>
      </div>
    </article>`).join('') : '<div class="empty-state">暂无生成任务</div>';

  $('outputs-list').innerHTML = state.outputs.length ? state.outputs.map(o => `
    <article class="output-card">
      <video controls preload="metadata" src="${o.url}"></video>
      <div class="output-copy">
        <strong>Segment ${String(o.index+1).padStart(2,'0')} · 已完成</strong>
        <span>${o.storageMode === 'ark-temp' ? '未占用 Supabase Storage · Ark 临时链接，请及时下载到本地' : 'Supabase Storage 已保存'}</span>
        ${o.providerTaskId ? `<small>Ark Task：${escapeHtml(o.providerTaskId)}</small>` : ''}
        <a href="${o.url}" download target="_blank" rel="noopener" data-download-output="${o.providerTaskId || o.index}">下载到本地</a>
      </div>
    </article>`).join('') : '<div class="empty-state">暂无视频输出。提交后会自动显示真实任务状态和生成结果。</div>';

  qsa('[data-refresh-segment]').forEach(btn => btn.onclick = async () => { await refreshJobs(); });
  qsa('[data-retry-segment]').forEach(btn => btn.onclick = () => generateSegments([btn.dataset.retrySegment]));
  qsa('[data-download-output]').forEach(link => link.onclick = () => {
    const set = downloadedSet();
    set.add(link.dataset.downloadOutput);
    saveDownloadedSet(set);
  });
}

function renderAll() {
  normalizeSegments(state.draft);
  renderProjects();
  renderSettings();
  renderQuickTimeline();
  renderEditor();
  renderSummary();
  renderJobs();
}

function wireFrameActions(container) {
  container.querySelectorAll('[data-delete-frame]').forEach(btn => btn.onclick = event => {
    event.stopPropagation();
    removeFrame(btn.dataset.deleteFrame);
  });
  container.querySelectorAll('[data-move-left]').forEach(btn => btn.onclick = event => {
    event.stopPropagation();
    moveFrame(btn.dataset.moveLeft, -1);
  });
  container.querySelectorAll('[data-move-right]').forEach(btn => btn.onclick = event => {
    event.stopPropagation();
    moveFrame(btn.dataset.moveRight, 1);
  });
}

async function removeFrame(id) {
  const frame = state.draft.frames.find(f => f.id === id);
  if (!frame) return;
  if (!await confirmBox('删除图片', `确定删除“${frame.name}”吗？本地界面会立即更新。`)) return;
  releaseFrameUrl(id);
  state.draft.frames = state.draft.frames.filter(f => f.id !== id);
  normalizeSegments(state.draft);
  renderAll();
  await persist();
}

async function moveFrame(id, direction) {
  const index = state.draft.frames.findIndex(f => f.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= state.draft.frames.length) return;
  [state.draft.frames[index], state.draft.frames[next]] = [state.draft.frames[next], state.draft.frames[index]];
  normalizeSegments(state.draft);
  renderAll();
  await persist();
}

async function addFiles(fileList) {
  const files = [...fileList];
  for (const file of files) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
      toast('格式不支持', file.name);
      continue;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast('文件过大', `${file.name} 超过 20MB`);
      continue;
    }
    const dimensions = await readDimensions(file);
    state.draft.frames.push({
      id: uid(),
      name: file.name,
      type: file.type,
      size: file.size,
      width: dimensions.width,
      height: dimensions.height,
      blob: file,
      createdAt: Date.now(),
      remoteAssetId: null,
      remotePath: null,
    });
  }
  normalizeSegments(state.draft);
  renderAll();
  await persist();
  toast('已加入本地草稿', `${files.length} 张图片已立即显示，尚未上传 Supabase。`);
}

function readDimensions(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width:image.naturalWidth, height:image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width:null, height:null });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

async function selectDraft(id) {
  const draft = await getDraft(id);
  if (!draft) return;
  state.objectUrls.forEach(url => URL.revokeObjectURL(url));
  state.objectUrls.clear();
  state.draft = draft;
  normalizeSegments(state.draft);
  state.selectedSegmentId = state.draft.segments[0]?.id || null;
  try { await syncRemoteTasks(); } catch (error) { console.warn(error); }
  renderAll();
  const hasActive = state.draft.segments.some(s => ['submitted','queued','running','processing'].includes(String(s.status || '').toLowerCase()));
  if (hasActive) startPolling();
}

async function createProject() {
  const draft = newDraft();
  await saveDraft(draft);
  state.drafts.unshift(draft);
  await selectDraft(draft.id);
  setView('quick');
}

async function removeProject() {
  if (!state.draft || !await confirmBox('删除项目', `确定删除“${state.draft.name}”及其本地图片草稿吗？`)) return;
  const id = state.draft.id;
  state.draft.frames.forEach(f => releaseFrameUrl(f.id));
  await deleteDraft(id);
  state.drafts = state.drafts.filter(d => d.id !== id);
  if (!state.drafts.length) await createProject();
  else await selectDraft(state.drafts[0].id);
}

function statusText(status) {
  return ({
    draft:'草稿',
    preparing:'准备中',
    uploading:'上传素材',
    submitting:'正在提交',
    queued:'排队中',
    submitted:'已提交',
    running:'生成中',
    processing:'生成中',
    completed:'已完成',
    succeeded:'已完成',
    success:'已完成',
    failed:'失败',
    error:'失败'
  })[String(status || '').toLowerCase()] || status || '草稿';
}

async function ensureRemoteProject() {
  if (state.draft.remoteProjectId) return state.draft.remoteProjectId;
  const payload = {
    owner_id: state.user.id,
    name: state.draft.name,
    mode: state.draft.mode,
    ratio: state.draft.ratio === 'follow' ? 'adaptive' : state.draft.ratio,
    resolution: '720p',
    frame_fit_mode: state.draft.fitMode,
    status: 'draft',
  };
  const result = await withTimeout(
    supabase.from('video_projects').insert(payload).select().single(),
    TIMEOUTS.database,
    '创建远程项目',
  );
  if (result.error) throw new Error(`创建项目失败：${errorMessage(result.error)}`);
  state.draft.remoteProjectId = result.data.id;
  await persist();
  return result.data.id;
}

async function uploadFrame(frame, projectId, order) {
  if (frame.remoteAssetId && frame.remotePath) return frame;
  if (!(frame.blob instanceof Blob)) throw new Error(`图片“${frame.name}”的本地文件已丢失，请重新上传`);
  const safeName = String(frame.name || 'frame.png').replace(/[^\w.\-]+/g,'_').slice(-100);
  const path = `${state.user.id}/${projectId}/${String(order).padStart(3,'0')}-${frame.id}-${Date.now()}-${safeName}`;
  const upload = await withTimeout(
    supabase.storage.from('seedance-inputs').upload(path, frame.blob, {
      contentType: frame.type || frame.blob.type || 'application/octet-stream',
      upsert: false,
      cacheControl: '3600',
    }),
    TIMEOUTS.upload,
    `上传图片 ${order + 1}`,
  );
  if (upload.error) throw new Error(`图片 ${order + 1} 上传失败：${errorMessage(upload.error)}`);

  const insert = await withTimeout(
    supabase.from('video_assets').insert({
      owner_id: state.user.id,
      project_id: projectId,
      bucket_id: 'seedance-inputs',
      object_path: path,
      original_name: frame.name,
      mime_type: frame.type || frame.blob.type || 'application/octet-stream',
      file_size: frame.size || frame.blob.size,
      width: frame.width,
      height: frame.height,
      kind: 'frame',
      sort_order: order,
    }).select().single(),
    TIMEOUTS.database,
    `登记图片 ${order + 1}`,
  );
  if (insert.error) {
    try { await supabase.storage.from('seedance-inputs').remove([path]); } catch {}
    throw new Error(`图片 ${order + 1} 登记失败：${errorMessage(insert.error)}`);
  }
  frame.remoteAssetId = insert.data.id;
  frame.remotePath = path;
  return frame;
}

async function uploadNeededFrames(segmentIds) {
  const projectId = await ensureRemoteProject();
  const segments = state.draft.segments.filter(s => segmentIds.includes(s.id));
  const needed = new Set(segments.flatMap(s => [s.fromFrameId, s.toFrameId]));
  const frames = state.draft.frames.filter(frame => needed.has(frame.id));

  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const originalIndex = state.draft.frames.findIndex(item => item.id === frame.id);
    const progress = Math.max(3, Math.round(((index + 0.2) / Math.max(frames.length, 1)) * 12));
    segments.forEach(segment => {
      if ([segment.fromFrameId, segment.toFrameId].includes(frame.id)) {
        segment.status = 'uploading';
        segment.progress = progress;
        segment.error = null;
      }
    });
    renderAll();
    await persist();
    await uploadFrame(frame, projectId, originalIndex);
  }

  segments.forEach(segment => {
    const from = state.draft.frames.find(item => item.id === segment.fromFrameId);
    const to = state.draft.frames.find(item => item.id === segment.toFrameId);
    if (from?.remoteAssetId && to?.remoteAssetId) {
      segment.status = 'submitting';
      segment.progress = 13;
    }
  });
  renderAll();
  await persist();
  return projectId;
}

async function submitOne(segment) {
  if (!segment.prompt.trim()) throw new Error(`Segment ${segment.index+1} 尚未填写提示词`);
  const projectId = state.draft.remoteProjectId;
  const from = state.draft.frames.find(f => f.id === segment.fromFrameId);
  const to = state.draft.frames.find(f => f.id === segment.toFrameId);
  if (!projectId) throw new Error('远程项目尚未创建');
  if (!from?.remoteAssetId || !to?.remoteAssetId) throw new Error(`Segment ${segment.index + 1} 的首尾帧尚未上传完成`);

  const insert = await withTimeout(
    supabase.from('video_segments').insert({
      owner_id: state.user.id,
      project_id: projectId,
      position: segment.index,
      from_asset_id: from.remoteAssetId,
      to_asset_id: to.remoteAssetId,
      prompt: segment.prompt,
      model_alias: segment.model,
      duration: Number(segment.duration),
      resolution: segment.resolution,
      ratio: state.draft.ratio === 'follow' ? 'adaptive' : state.draft.ratio,
      status: 'ready',
    }).select().single(),
    TIMEOUTS.database,
    `创建 Segment ${segment.index + 1}`,
  );
  if (insert.error) throw new Error(`创建 Segment ${segment.index + 1} 失败：${errorMessage(insert.error)}`);
  segment.remoteSegmentId = insert.data.id;

  const body = {
    project_id: projectId,
    segment_id: insert.data.id,
    asset_ids: [from.remoteAssetId, to.remoteAssetId],
    prompt: segment.prompt,
    model_alias: segment.model,
    duration: Number(segment.duration),
    resolution: segment.resolution,
    ratio: state.draft.ratio === 'follow' ? 'adaptive' : state.draft.ratio,
    frame_fit_mode: state.draft.fitMode,
    final_width: Number(state.draft.finalWidth),
    final_height: Number(state.draft.finalHeight),
    mode: state.draft.mode,
  };

  const data = await invokeEdgeFunction('seedance-submit', body);
  if (!data.task_id || !data.provider_task_id) throw new Error(data.error || 'Seedance 提交接口没有返回 task_id / provider_task_id');

  segment.status = data.status || 'queued';
  segment.progress = Number(data.progress || 20);
  segment.remoteTaskId = data.task_id;
  segment.providerTaskId = data.provider_task_id;
  segment.error = null;
  await persist();
  return segment;
}

async function generateSegments(segmentIds) {
  if (state.isGenerating) return toast('任务正在提交', '请等待当前提交完成后再操作。');
  const segments = state.draft.segments.filter(s => segmentIds.includes(s.id));
  if (!segments.length) return toast('没有可生成片段', '请先上传至少两张图片。');
  const invalid = segments.find(s => !s.prompt.trim());
  if (invalid) {
    state.selectedSegmentId = invalid.id;
    setView('editor');
    renderEditor();
    return toast('提示词未填写', `请先填写 Segment ${invalid.index+1} 的提示词。`);
  }
  if (!await confirmBox('确认提交真实任务', `将提交 ${segments.length} 个视频片段，最多同时生成 2 段，可能产生 Ark API 费用。`)) return;

  state.isGenerating = true;
  const generateAllButton = $('generate-all');
  if (generateAllButton) {
    generateAllButton.disabled = true;
    generateAllButton.textContent = '正在提交...';
  }
  setView('jobs');

  try {
    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; });
    renderAll();
    await persist();
    await uploadNeededFrames(segmentIds);

    const queue = [...segments];
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length) {
        const segment = queue.shift();
        try {
          segment.status = 'submitting';
          segment.progress = 14;
          renderJobs();
          await submitOne(segment);
        } catch (error) {
          segment.status = 'failed';
          segment.progress = 0;
          segment.error = errorMessage(error, '提交失败');
        }
        await persist();
        renderAll();
      }
    });
    await Promise.all(workers);

    await refreshJobs();
    const successCount = segments.filter(s => ['queued','running','processing','succeeded','completed','success'].includes(s.status)).length;
    const failedCount = segments.filter(s => s.status === 'failed').length;
    if (successCount) {
      toast('真实任务已提交', `${successCount} 段已进入 Seedance；${failedCount ? `${failedCount} 段失败。` : '正在自动查询状态。'}`);
      startPolling();
    } else {
      toast('提交失败', segments[0]?.error || '所有片段均未提交成功');
    }
  } catch (error) {
    const message = errorMessage(error, '提交失败');
    segments.forEach(segment => {
      if (['preparing','uploading','submitting','submitted','queued'].includes(segment.status)) {
        segment.status = 'failed';
        segment.progress = 0;
        segment.error = message;
      }
    });
    await persist();
    renderAll();
    toast('提交失败', message);
  } finally {
    state.isGenerating = false;
    if (generateAllButton) {
      generateAllButton.disabled = false;
      generateAllButton.textContent = '全部生成';
    }
  }
}

async function refreshSingleSegment(segmentId) {
  const segment = state.draft.segments.find(s => s.id === segmentId);
  if (!segment?.remoteTaskId && !segment?.providerTaskId && !segment?.remoteSegmentId && !state.draft?.remoteProjectId) return;
  try {
    const data = await invokeEdgeFunction('seedance-status', {
      project_id: state.draft.remoteProjectId,
      segment_id: segment.remoteSegmentId,
      task_id: segment.remoteTaskId,
      provider_task_id: segment.providerTaskId,
      recover_all: true,
    });

    const result = (data.results || []).find(item =>
      item.task_id === segment.remoteTaskId ||
      item.provider_task_id === segment.providerTaskId
    ) || (data.results || [])[0] || data;

    segment.status = result.status || data.status || segment.status;
    segment.progress = Number(result.progress ?? data.progress ?? segment.progress ?? 0);
    segment.outputPath = result.storage_path || result.output_path || result.output?.storage_path || segment.outputPath;
    segment.providerTaskId = result.provider_task_id || data.provider_task_id || segment.providerTaskId;
    segment.remoteTaskId = result.task_id || data.task_id || segment.remoteTaskId;
    segment.error = result.error || data.error_message || null;

    await persist();
    await loadOutputs();
    renderAll();
  } catch (error) {
    segment.error = errorMessage(error, '状态查询失败');
    await persist();
    renderJobs();
  }
}

async function syncRemoteTasks() {
  if (!state.draft?.remoteProjectId || !state.user?.id) return;

  const [taskResult, segmentResult] = await Promise.all([
    withTimeout(
      supabase.from('video_tasks')
        .select('id,segment_id,provider_task_id,status,progress,error_message,created_at,updated_at')
        .eq('owner_id', state.user.id)
        .eq('project_id', state.draft.remoteProjectId)
        .order('created_at', { ascending: false }),
      TIMEOUTS.database,
      '同步远程任务',
    ),
    withTimeout(
      supabase.from('video_segments')
        .select('id,position,status,created_at,updated_at')
        .eq('owner_id', state.user.id)
        .eq('project_id', state.draft.remoteProjectId)
        .order('created_at', { ascending: false }),
      TIMEOUTS.database,
      '同步远程片段',
    ),
  ]);

  if (taskResult.error) throw new Error(`同步任务失败：${errorMessage(taskResult.error)}`);
  if (segmentResult.error) throw new Error(`同步片段失败：${errorMessage(segmentResult.error)}`);

  const remoteSegments = segmentResult.data || [];
  const tasks = (taskResult.data || []).map(task => ({
    ...task,
    createdMs: new Date(task.created_at || 0).getTime() || 0,
    statusLower: String(task.status || '').toLowerCase(),
  }));

  const segmentsByPosition = new Map();
  for (const remote of remoteSegments) {
    const key = Number(remote.position || 0);
    if (!segmentsByPosition.has(key)) segmentsByPosition.set(key, []);
    segmentsByPosition.get(key).push(remote);
  }

  const activeStatuses = new Set(['submitting', 'submitted', 'queued', 'running', 'processing', 'succeeded', 'completed', 'success']);
  const doneStatuses = new Set(['succeeded', 'completed', 'success']);
  const failedStatuses = new Set(['failed', 'error']);

  function scoreTask(task) {
    let score = task.createdMs;
    if (activeStatuses.has(task.statusLower)) score += 10_000_000_000_000;
    if (doneStatuses.has(task.statusLower)) score += 20_000_000_000_000;
    if (failedStatuses.has(task.statusLower)) score -= 10_000_000_000_000;
    if (task.provider_task_id) score += 1_000_000;
    return score;
  }

  for (const local of state.draft.segments) {
    const position = Number(local.index || 0);
    const candidates = segmentsByPosition.get(position) || [];
    const candidateIds = new Set(candidates.map(s => s.id));

    /*
      重点：不要优先使用 local.remoteSegmentId。
      之前就是因为这里优先命中旧失败 segment，导致页面一直显示旧的 cgt。
      现在按同一 position 找“最新且非失败优先”的 video_tasks。
    */
    if (local.remoteSegmentId) candidateIds.add(local.remoteSegmentId);

    const candidateTasks = tasks.filter(task => candidateIds.has(task.segment_id));
    if (!candidateTasks.length) continue;

    candidateTasks.sort((a, b) => scoreTask(b) - scoreTask(a));
    const latestTask = candidateTasks[0];

    const previousProviderTaskId = local.providerTaskId;
    local.remoteSegmentId = latestTask.segment_id || local.remoteSegmentId;
    local.remoteTaskId = latestTask.id || local.remoteTaskId;
    local.providerTaskId = latestTask.provider_task_id || local.providerTaskId;
    local.status = latestTask.status || local.status;
    local.progress = Number(latestTask.progress ?? local.progress ?? 0);
    local.error = latestTask.error_message || null;

    if (previousProviderTaskId && latestTask.provider_task_id && previousProviderTaskId !== latestTask.provider_task_id) {
      console.log('[Seedance Studio] task switched from old cgt to latest cgt', previousProviderTaskId, '=>', latestTask.provider_task_id);
    }
  }

  await persist();
}

async function refreshJobs() {
  try {
    await syncRemoteTasks();
  } catch (error) {
    console.warn(error);
  }

  const active = state.draft.segments.filter(s =>
    ['submitted','queued','running','processing'].includes(String(s.status || '').toLowerCase())
    && (s.remoteTaskId || s.providerTaskId || s.remoteSegmentId)
  );

  for (const segment of active) {
    await refreshSingleSegment(segment.id);
  }
  await loadOutputs();
  renderJobs();
}

async function loadOutputs() {
  if (!state.user?.id) {
    state.outputs = [];
    return;
  }

  const taskIds = (state.draft?.segments || []).map(s => s.remoteTaskId).filter(Boolean);
  const segmentIds = (state.draft?.segments || []).map(s => s.remoteSegmentId).filter(Boolean);
  const rowsById = new Map();

  async function collect(query) {
    const { data, error } = await query;
    if (error) {
      console.warn('loadOutputs query failed', error);
      return;
    }
    for (const row of data || []) rowsById.set(row.id, row);
  }

  if (taskIds.length) {
    await collect(
      supabase.from('video_outputs')
        .select('*')
        .eq('owner_id', state.user.id)
        .in('task_id', taskIds)
        .order('created_at', { ascending: false })
    );
  }

  if (segmentIds.length) {
    await collect(
      supabase.from('video_outputs')
        .select('*')
        .eq('owner_id', state.user.id)
        .in('segment_id', segmentIds)
        .order('created_at', { ascending: false })
    );
  }

  if (state.draft?.remoteProjectId) {
    await collect(
      supabase.from('video_outputs')
        .select('*')
        .eq('owner_id', state.user.id)
        .eq('project_id', state.draft.remoteProjectId)
        .order('created_at', { ascending: false })
        .limit(50)
    );
  }

  // 兜底：为了找回已扣费但前端项目 ID 错绑的历史结果，读取最近 50 条输出。
  await collect(
    supabase.from('video_outputs')
      .select('*')
      .eq('owner_id', state.user.id)
      .order('created_at', { ascending: false })
      .limit(50)
  );

  const rows = [...rowsById.values()];
  const outputs = [];

  for (const row of rows) {
    const meta = row.metadata || {};
    const providerUrl =
      meta.provider_video_url ||
      meta.ark_response?.content?.video_url ||
      meta.ark_response?.content?.file_url ||
      meta.video_url;

    let url = providerUrl;
    let storageMode = providerUrl ? 'ark-temp' : 'supabase';

    if (!url && row.storage_path && row.bucket_id !== 'ark-url') {
      const signed = await supabase.storage
        .from(row.bucket_id || 'seedance-outputs')
        .createSignedUrl(row.storage_path, 3600);
      if (signed.error) continue;
      url = signed.data.signedUrl;
    }

    if (!url) continue;

    const providerTaskId = meta.provider_task_id || meta.ark_response?.id || String(row.storage_path || '').replace(/^ark:\/\//, '').replace(/\.mp4$/, '');
    const segmentIndex = (state.draft?.segments || []).findIndex(
      s =>
        s.remoteSegmentId === row.segment_id ||
        s.remoteTaskId === row.task_id ||
        s.providerTaskId === providerTaskId
    );

    outputs.push({
      row,
      url,
      storageMode,
      providerTaskId,
      index: segmentIndex < 0 ? outputs.length : segmentIndex,
    });
  }

  state.outputs = outputs.sort((a,b)=>a.index-b.index || new Date(b.row.created_at || 0) - new Date(a.row.created_at || 0));

  // 默认本地优先：新生成/新回收的视频出现后，自动触发一次浏览器下载。
  for (const output of state.outputs) maybeAutoDownloadOutput(output);
}

function startPolling() {
  clearInterval(state.pollTimer);
  refreshJobs();
  state.pollTimer = setInterval(() => {
    if (!state.draft) return clearInterval(state.pollTimer);
    const active = state.draft.segments.some(s =>
      ['submitting','submitted','queued','running','processing'].includes(String(s.status || '').toLowerCase())
    );
    if (!active) return clearInterval(state.pollTimer);
    refreshJobs();
  }, 5000);
}

async function mergeAll() {
  await loadOutputs();
  const ordered = [...state.outputs].sort((a,b)=>a.index-b.index);
  if (ordered.length !== state.draft.segments.length || !ordered.length) {
    return toast('暂不能合并', '必须等待全部片段成功生成。');
  }
  if (!await confirmBox('浏览器内合并', '将下载全部片段并使用 FFmpeg WASM 统一尺寸后拼接。长视频可能占用较多内存。')) return;
  $('merge-all').disabled = true;
  $('merge-all').textContent = '正在加载合并引擎...';
  try {
    const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
      import('https://esm.sh/@ffmpeg/ffmpeg@0.12.10'),
      import('https://esm.sh/@ffmpeg/util@0.12.1'),
    ]);
    const ffmpeg = new FFmpeg();
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    const width = Number(state.draft.finalWidth);
    const height = Number(state.draft.finalHeight);
    for (let i = 0; i < ordered.length; i++) {
      $('merge-all').textContent = `处理片段 ${i+1}/${ordered.length}`;
      await ffmpeg.writeFile(`in${i}.mp4`, await fetchFile(ordered[i].url));
      const vf = state.draft.fitMode === 'cover'
        ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
        : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
      await ffmpeg.exec(['-i',`in${i}.mp4`,'-vf',vf,'-r','30','-c:v','libx264','-preset','ultrafast','-crf','23','-an',`norm${i}.mp4`]);
    }
    const concatText = ordered.map((_,i)=>`file 'norm${i}.mp4'`).join('\n');
    await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatText));
    $('merge-all').textContent = '正在拼接...';
    await ffmpeg.exec(['-f','concat','-safe','0','-i','concat.txt','-c','copy','final.mp4']);
    const data = await ffmpeg.readFile('final.mp4');
    const blob = new Blob([data.buffer], { type:'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.draft.name || 'seedance-project'}-${Date.now()}.mp4`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
    toast('合并完成', '最终长视频已经开始下载。');
  } catch (error) {
    toast('合并失败', error.message || String(error));
  } finally {
    $('merge-all').disabled = false;
    $('merge-all').textContent = '合并长视频';
  }
}

async function initSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    location.href = `login.html?redirect=${encodeURIComponent(location.href)}`;
    return false;
  }
  state.session = data.session;
  state.user = data.session.user;
  let meta = {};
  try { meta = JSON.parse(localStorage.getItem('activeUserObj') || '{}'); } catch {}
  meta = { ...(state.user.user_metadata || {}), ...meta };
  const name = meta.displayName || meta.cnName || meta.name || meta.enName || state.user.email.split('@')[0];
  $('sidebar-name').textContent = name;
  $('sidebar-avatar').textContent = (meta.avatar || name[0] || '?').toUpperCase();
  $('sidebar-role').textContent = meta.role || '系统成员';
  return true;
}

function wireEvents() {
  $('back-home').onclick = () => location.href = 'index.html';
  $('logout').onclick = async () => { await supabase.auth.signOut(); localStorage.removeItem('activeUserObj'); location.href='login.html'; };
  $('new-project').onclick = createProject;
  $('delete-project').onclick = removeProject;
  $('open-jobs').onclick = () => setView('jobs');
  $('go-editor').onclick = () => setView('editor');
  $('editor-add-image').onclick = () => $('file-input').click();
  $('upload-zone').onclick = () => $('file-input').click();
  $('file-input').onchange = event => { addFiles(event.target.files); event.target.value=''; };

  const zone = $('upload-zone');
  ['dragenter','dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', event => addFiles(event.dataTransfer.files));

  qsa('.view-tab').forEach(btn => btn.onclick = () => setView(btn.dataset.view));
  qsa('#mode-switch button').forEach(btn => btn.onclick = async () => {
    state.draft.mode = btn.dataset.mode;
    normalizeSegments(state.draft);
    renderAll();
    await persist();
  });

  $('project-name').oninput = async event => { state.draft.name = event.target.value; await persist(); };
  $('project-ratio').onchange = async event => {
    state.draft.ratio = event.target.value;
    const presets = {
      '16:9':[1920,1080], '9:16':[1080,1920], '1:1':[1080,1080],
      '4:3':[1440,1080], '3:4':[1080,1440], '3:1':[1920,640],
    };
    if (presets[state.draft.ratio]) [state.draft.finalWidth,state.draft.finalHeight] = presets[state.draft.ratio];
    renderAll();
    await persist();
  };
  $('final-width').onchange = async event => { state.draft.finalWidth = Number(event.target.value); updateRatioTip(); await persist(); };
  $('final-height').onchange = async event => { state.draft.finalHeight = Number(event.target.value); updateRatioTip(); await persist(); };
  $('fit-mode').onchange = async event => { state.draft.fitMode = event.target.value; await persist(); };

  $('segment-prompt').oninput = async event => {
    const segment = state.draft.segments.find(s => s.id === state.selectedSegmentId);
    if (!segment) return;
    segment.prompt = event.target.value;
    renderSummary();
    await persist();
  };
  $('segment-duration').onchange = async event => { const s=state.draft.segments.find(x=>x.id===state.selectedSegmentId); if(s){s.duration=Number(event.target.value);renderAll();await persist();} };
  $('segment-model').onchange = async event => { const s=state.draft.segments.find(x=>x.id===state.selectedSegmentId); if(s){s.model=event.target.value;renderAll();await persist();} };
  $('segment-resolution').onchange = async event => { const s=state.draft.segments.find(x=>x.id===state.selectedSegmentId); if(s){s.resolution=event.target.value;renderAll();await persist();} };
  qsa('[data-prompt]').forEach(btn => btn.onclick = async () => {
    const s=state.draft.segments.find(x=>x.id===state.selectedSegmentId); if(!s)return;
    s.prompt = [s.prompt, btn.dataset.prompt].filter(Boolean).join('，');
    renderInspector(); await persist(); renderEditor();
  });

  $('preview-segment').onclick = () => {
    const s = state.draft.segments.find(x=>x.id===state.selectedSegmentId);
    if (!s) return;
    const from = state.draft.frames.find(f=>f.id===s.fromFrameId);
    const to = state.draft.frames.find(f=>f.id===s.toFrameId);
    toast('预检通过', `${from?.name} → ${to?.name}；${s.duration}s；${s.model}；${s.resolution}；比例 ${state.draft.ratio}`);
  };
  $('generate-segment').onclick = () => state.selectedSegmentId && generateSegments([state.selectedSegmentId]);
  $('generate-all').onclick = () => generateSegments(state.draft.segments.map(s=>s.id));
  $('refresh-jobs').onclick = refreshJobs;
  $('merge-all').onclick = mergeAll;
}

async function init() {
  if (!await initSession()) return;
  wireEvents();
  state.drafts = await listDrafts();
  if (!state.drafts.length) {
    const draft = newDraft();
    await saveDraft(draft);
    state.drafts = [draft];
  }
  await selectDraft([...state.drafts].sort((a,b)=>b.updatedAt-a.updatedAt)[0].id);
  setView('quick');
}

init().catch(error => {
  console.error(error);
  toast('页面初始化失败', error.message || String(error));
});
