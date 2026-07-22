import { supabase } from '../supabase-config.js';
import { listDrafts, getDraft, saveDraft, deleteDraft } from './db.js';

const APP_BUILD = '20260722-video-proxy-blob-playback';
const IMAGE_SAFE_VERSION = 'ark-image-aspect-safe-v5-blackbar-2p49-force-reupload';
const SEEDANCE_VIDEO_PROXY_URL = 'https://supffjeeouibhqdfqosk.supabase.co/functions/v1/seedance-video-proxy';
console.log('[Seedance Studio]', APP_BUILD);

const state = {
  session: null,
  user: null,
  drafts: [],
  draft: null,
  selectedSegmentId: null,
  currentView: 'quick',
  objectUrls: new Map(),
  outputBlobUrls: new Map(),
  jobs: [],
  outputs: [],
  outputHistory: [],
  referenceVideo: null,
  referenceAssets: [],
  pollTimer: null,
  isGenerating: false,
};

const $ = id => document.getElementById(id);
const qsa = selector => [...document.querySelectorAll(selector)];
const uid = () => crypto.randomUUID();

const TIMEOUTS = {
  database: 25000,
  upload: 90000,
  edgeFunction: 180000,
};

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时，请检查网络后重试`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableSubmitError(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('connection timed out') ||
    message.includes('tcp connect') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('请求超时') ||
    message.includes('超时') ||
    message.includes('temporarily') ||
    message.includes('无法连接 ark api');
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败，请重新上传')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片预处理失败')), type, quality);
  });
}

async function makeArkSafeFrameBlob(frame) {
  if (!(frame.blob instanceof Blob)) throw new Error(`图片“${frame.name}”的本地文件已丢失，请重新上传`);
  const img = await blobToImage(frame.blob);
  const srcW = img.naturalWidth || frame.width;
  const srcH = img.naturalHeight || frame.height;
  if (!srcW || !srcH) return { blob: frame.blob, width: frame.width, height: frame.height, type: frame.type || frame.blob.type };

  /*
    Seedance 输入图比例必须在 0.40 到 2.50 之间。
    这里采用“最接近原图比例”的安全补边策略：
    - 超宽图，例如 3:1：不裁切，补上下黑边到 2.49:1。
    - 超高图，例如 1:3：不裁切，补左右黑边到 0.41:1。
    - 合规图：完全不处理。
    用 2.49 / 0.41 是为了避开 Ark 边界浮点误差。
  */
  const minRatio = 0.41;
  const maxRatio = 2.49;
  const ratio = srcW / srcH;
  let dstW = srcW;
  let dstH = srcH;
  let padMode = 'none';

  if (ratio > maxRatio) {
    dstH = Math.ceil(srcW / maxRatio);
    padMode = 'letterbox_vertical_black_bars';
  } else if (ratio < minRatio) {
    dstW = Math.ceil(srcH * minRatio);
    padMode = 'pillarbox_horizontal_black_bars';
  } else {
    return {
      blob: frame.blob,
      width: srcW,
      height: srcH,
      type: frame.type || frame.blob.type || 'image/png',
      normalized: false,
      padMode,
      ratio,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');

  // 按用户要求：不裁切、不虚化填充，直接使用黑边，最大限度保护原图内容。
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, Math.round((dstW - srcW) / 2), Math.round((dstH - srcH) / 2), srcW, srcH);

  const blob = await canvasToBlob(canvas, 'image/png', 0.95);
  return {
    blob,
    width: dstW,
    height: dstH,
    type: 'image/png',
    normalized: true,
    padMode,
    originalRatio: ratio,
    safeRatio: dstW / dstH,
  };
}

function errorMessage(error, fallback = '操作失败') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.details || String(error);
}

const AUTO_DOWNLOAD_KEY = 'seedance_auto_downloaded_provider_tasks_v1';
const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';

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
  // Ark 签名临时 URL 不能直接作为本地下载来源；播放器会通过 seedance-video-proxy 拉 Blob。
  if (output.storageMode === 'ark-temp') return;
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
    remoteProjectId: null,
    workspaces: {
      first_last: createWorkspaceState(),
      multi_frame: createWorkspaceState(),
      text_only: createWorkspaceState(),
    },
  };
}

function createWorkspaceState() {
  return {
    frames: [],
    segments: [],
    outputs: [],
    outputHistory: [],
    referenceVideo: null,
    referenceAssets: [],
    jobs: [],
    selectedSegmentId: null,
    remoteProjectId: null,
  };
}

function migrateDraftWorkspaces(draft) {
  if (!draft) return draft;
  if (!draft.workspaces) {
    const oldFrames = Array.isArray(draft.frames) ? draft.frames : [];
    const oldSegments = Array.isArray(draft.segments) ? draft.segments : [];
    const oldMode = draft.mode === 'first_last' ? 'first_last' : 'multi_frame';
    draft.workspaces = {
      first_last: createWorkspaceState(),
      multi_frame: createWorkspaceState(),
    };
    draft.workspaces[oldMode].frames = oldFrames;
    draft.workspaces[oldMode].segments = oldSegments;
    draft.workspaces[oldMode].selectedSegmentId = draft.selectedSegmentId || null;
    draft.workspaces[oldMode].remoteProjectId = draft.remoteProjectId || null;
  }
  if (!draft.workspaces.first_last) draft.workspaces.first_last = createWorkspaceState();
  if (!draft.workspaces.multi_frame) draft.workspaces.multi_frame = createWorkspaceState();
  if (!draft.workspaces.text_only) draft.workspaces.text_only = createWorkspaceState();
  if (!Array.isArray(draft.workspaces.first_last.outputHistory)) draft.workspaces.first_last.outputHistory = [];
  if (!Array.isArray(draft.workspaces.multi_frame.outputHistory)) draft.workspaces.multi_frame.outputHistory = [];
  if (!Array.isArray(draft.workspaces.text_only.outputHistory)) draft.workspaces.text_only.outputHistory = [];
  if (!('referenceVideo' in draft.workspaces.text_only)) draft.workspaces.text_only.referenceVideo = null;
  if (!Array.isArray(draft.workspaces.text_only.referenceAssets)) {
    draft.workspaces.text_only.referenceAssets = draft.workspaces.text_only.referenceVideo ? [draft.workspaces.text_only.referenceVideo] : [];
  }

  // 兼容旧代码：当前模式的 frames / segments 始终映射到当前工作区。
  const workspace = getWorkspace(draft);
  draft.frames = workspace.frames;
  draft.segments = workspace.segments;
  draft.remoteProjectId = workspace.remoteProjectId || draft.remoteProjectId || null;
  if (workspace.selectedSegmentId) draft.selectedSegmentId = workspace.selectedSegmentId;
  return draft;
}

function getWorkspace(draft = state.draft, mode = draft?.mode) {
  if (!draft) return createWorkspaceState();
  if (!draft.workspaces) draft.workspaces = { first_last: createWorkspaceState(), multi_frame: createWorkspaceState(), text_only: createWorkspaceState() };
  const key = mode === 'first_last' ? 'first_last' : (mode === 'text_only' ? 'text_only' : 'multi_frame');
  if (!draft.workspaces[key]) draft.workspaces[key] = createWorkspaceState();
  return draft.workspaces[key];
}

function bindCurrentWorkspace() {
  if (!state.draft) return;
  migrateDraftWorkspaces(state.draft);
  const workspace = getWorkspace();
  state.draft.frames = workspace.frames;
  state.draft.segments = workspace.segments;
  state.draft.remoteProjectId = workspace.remoteProjectId || null;
  state.outputs = Array.isArray(workspace.outputs) ? workspace.outputs : [];
  state.outputHistory = Array.isArray(workspace.outputHistory) ? workspace.outputHistory : [];
  state.referenceAssets = Array.isArray(workspace.referenceAssets)
    ? workspace.referenceAssets
    : (workspace.referenceVideo ? [workspace.referenceVideo] : []);
  state.referenceVideo = state.referenceAssets[0] || null;
  state.selectedSegmentId = workspace.selectedSegmentId || workspace.segments[0]?.id || null;
}

function saveCurrentWorkspaceSelection() {
  if (!state.draft) return;
  const workspace = getWorkspace();
  workspace.frames = state.draft.frames || [];
  workspace.segments = state.draft.segments || [];
  workspace.outputs = state.outputs || [];
  workspace.outputHistory = state.outputHistory || workspace.outputHistory || [];
  workspace.referenceAssets = state.draft.mode === 'text_only' ? (state.referenceAssets || workspace.referenceAssets || []) : (workspace.referenceAssets || []);
  workspace.referenceVideo = workspace.referenceAssets?.[0] || null;
  workspace.remoteProjectId = state.draft.remoteProjectId || workspace.remoteProjectId || null;
  workspace.selectedSegmentId = state.selectedSegmentId || null;
}

function workspaceLabel(mode = state.draft?.mode) {
  if (mode === 'first_last') return '首尾帧';
  if (mode === 'text_only') return '纯文字生成';
  return '多帧 Storyboard';
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


function getBlobUrl(fileLike) {
  if (!fileLike?.blob) return '';
  if (!state.objectUrls.has(fileLike.id)) state.objectUrls.set(fileLike.id, URL.createObjectURL(fileLike.blob));
  return state.objectUrls.get(fileLike.id);
}

function renderTextModePanel() {
  const panel = $('text-mode-panel');
  if (!panel) return;
  const isText = state.draft?.mode === 'text_only';
  panel.hidden = !isText;
  if ($('upload-zone')) $('upload-zone').hidden = isText;
  if ($('quick-timeline')) $('quick-timeline').hidden = isText;
  if (!isText) return;

  normalizeSegments(state.draft);
  const segment = state.draft.segments[0];
  if ($('text-mode-prompt') && document.activeElement !== $('text-mode-prompt')) {
    $('text-mode-prompt').value = segment?.prompt || '';
  }

  const preview = $('reference-video-preview');
  const card = $('reference-video-card');
  if (!preview || !card) return;

  const assets = state.referenceAssets || getWorkspace().referenceAssets || [];
  if (!assets.length) {
    preview.hidden = true;
    preview.innerHTML = '';
    card.classList.remove('has-reference');
    return;
  }

  card.classList.add('has-reference');
  preview.hidden = false;
  preview.innerHTML = assets.map((asset, index) => referenceAssetMarkup(asset, index)).join('');

  preview.querySelectorAll('[data-remove-reference]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.removeReference;
      const target = (state.referenceAssets || []).find(item => item.id === id);
      if (target?.id) releaseFrameUrl(target.id);
      state.referenceAssets = (state.referenceAssets || []).filter(item => item.id !== id);
      state.referenceVideo = state.referenceAssets[0] || null;
      getWorkspace().referenceAssets = state.referenceAssets;
      getWorkspace().referenceVideo = state.referenceVideo;
      renderTextModePanel();
      await persist();
    };
  });

  preview.querySelectorAll('[data-insert-reference]').forEach(btn => {
    btn.onclick = async () => {
      insertReferenceToken(btn.dataset.insertReference || '');
      await persist();
    };
  });

  syncCustomSelects();
}

function referenceAssetMarkup(asset, index) {
  const url = getBlobUrl(asset);
  const type = String(asset.type || '');
  const label = assetKindLabel(asset);
  const token = referenceToken(asset, index);
  let media = '';
  if (type.startsWith('video/')) {
    media = `<video src="${url}" controls preload="metadata"></video>`;
  } else if (type.startsWith('audio/')) {
    media = `<div class="audio-ref-card"><b>♪</b><audio src="${url}" controls preload="metadata"></audio></div>`;
  } else if (type.startsWith('image/')) {
    media = `<img src="${url}" alt="${escapeHtml(asset.name || token)}" />`;
  } else {
    media = `<div class="file-ref-card">REF</div>`;
  }

  return `<article class="reference-pool-item">
    <div class="reference-pool-media">${media}</div>
    <div class="reference-video-meta">
      <div class="reference-title-row">
        <strong>${escapeHtml(token)}</strong>
        <button type="button" class="reference-token-btn" data-insert-reference="${escapeHtml(token)}">插入 ${escapeHtml(token)}</button>
      </div>
      <em title="${escapeHtml(asset.name || '参考内容')}">${escapeHtml(asset.name || '参考内容')}</em>
      <span>${formatBytes(asset.size || 0)} · ${escapeHtml(asset.type || 'file')}</span>
      <small>${asset.remoteAssetId ? '已上传 Supabase，生成时会传给 Ark' : '本地参考内容，生成时才上传'}</small>
      <p class="reference-free-tip">在描述里自由写：${escapeHtml(token)} 参考人物动作 / 运镜 / 声音 / 风格。系统不固定用途。</p>
    </div>
    <button class="icon-mini danger" data-remove-reference="${asset.id}" type="button">删除</button>
  </article>`;
}

function referenceToken(asset, index) {
  const type = String(asset?.type || '');
  if (type.startsWith('video/')) return `@视频${index + 1}`;
  if (type.startsWith('audio/')) return `@音频${index + 1}`;
  if (type.startsWith('image/')) return `@图片${index + 1}`;
  return `@参考${index + 1}`;
}


function assetKindLabel(asset) {
  const type = String(asset.type || '');
  if (type.startsWith('video/')) return '视频参考';
  if (type.startsWith('audio/')) return '音频参考';
  if (type.startsWith('image/')) return '图片参考';
  return '参考内容';
}

function defaultReferenceDirection(asset) {
  const type = String(asset.type || '');
  if (type.startsWith('audio/')) return 'audio_rhythm';
  if (type.startsWith('image/')) return 'visual_style';
  return 'visual_motion';
}

function insertReferenceToken(token) {
  if (!token) return;
  const textarea = $('text-mode-prompt') || $('segment-prompt');
  normalizeSegments(state.draft);
  const segment = state.draft.segments[0];
  if (!textarea || !segment) return;

  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const needsSpaceBefore = before && !/\s$/.test(before);
  const needsSpaceAfter = after && !/^\s/.test(after);
  const inserted = `${needsSpaceBefore ? ' ' : ''}${token}${needsSpaceAfter ? ' ' : ''}`;
  textarea.value = before + inserted + after;
  const pos = before.length + inserted.length;
  textarea.focus();
  textarea.setSelectionRange(pos, pos);

  segment.prompt = textarea.value;
  state.selectedSegmentId = segment.id;
  saveCurrentWorkspaceSelection();
  renderSummary();
  toast('已插入引用', `${token} 已加入描述，你可以继续写具体参考什么。`);
}

function formatBytes(size) {
  const n = Number(size || 0);
  if (!n) return '0 B';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function enhanceCustomSelects() {
  document.querySelectorAll('select').forEach(select => {
    if (select.dataset.customReady === '1') return;
    select.dataset.customReady = '1';
    select.classList.add('native-select-hidden');

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    wrapper.dataset.for = select.id || '';
    wrapper.innerHTML = `
      <button type="button" class="custom-select-trigger">
        <span></span>
        <i>⌄</i>
      </button>
    `;
    select.insertAdjacentElement('afterend', wrapper);

    const menu = document.createElement('div');
    menu.className = 'custom-select-menu custom-select-portal';
    menu.dataset.for = select.id || '';
    document.body.appendChild(menu);
    wrapper._customMenu = menu;

    wrapper.querySelector('.custom-select-trigger').addEventListener('click', event => {
      event.stopPropagation();
      const willOpen = !wrapper.classList.contains('open');
      closeAllCustomSelects();
      if (willOpen) openCustomSelect(select, wrapper, menu);
    });

    select.addEventListener('change', () => syncCustomSelect(select));
    syncCustomSelect(select);
  });

  if (!document.body.dataset.customSelectGlobal) {
    document.body.dataset.customSelectGlobal = '1';
    document.addEventListener('click', closeAllCustomSelects);
    window.addEventListener('resize', repositionOpenCustomSelect);
    window.addEventListener('scroll', repositionOpenCustomSelect, true);
  }
}

function openCustomSelect(select, wrapper, menu) {
  wrapper.classList.add('open');
  menu.classList.add('open');
  syncCustomSelect(select);
  positionCustomSelectMenu(select, wrapper, menu);
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select.open').forEach(item => item.classList.remove('open'));
  document.querySelectorAll('.custom-select-menu.open').forEach(item => item.classList.remove('open'));
}

function repositionOpenCustomSelect() {
  const wrapper = document.querySelector('.custom-select.open');
  if (!wrapper) return;
  const selectId = wrapper.dataset.for;
  const select = selectId ? document.getElementById(selectId) : null;
  const menu = wrapper._customMenu || document.querySelector(`.custom-select-menu[data-for="${selectId}"]`);
  if (select && menu) positionCustomSelectMenu(select, wrapper, menu);
}

function positionCustomSelectMenu(select, wrapper, menu) {
  const rect = wrapper.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight;
  const viewportW = window.innerWidth || document.documentElement.clientWidth;
  const maxHeight = Math.min(360, Math.max(180, viewportH - 48));
  const wantedHeight = Math.min(maxHeight, Math.max(180, menu.scrollHeight || 220));
  const spaceBelow = viewportH - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const openUp = spaceBelow < Math.min(220, wantedHeight) && spaceAbove > spaceBelow;

  const width = Math.min(rect.width, viewportW - 24);
  const left = Math.min(Math.max(12, rect.left), viewportW - width - 12);
  const top = openUp
    ? Math.max(12, rect.top - Math.min(wantedHeight, spaceAbove) - 8)
    : Math.min(viewportH - Math.min(wantedHeight, spaceBelow) - 12, rect.bottom + 8);

  menu.style.setProperty('--select-left', `${left}px`);
  menu.style.setProperty('--select-top', `${top}px`);
  menu.style.setProperty('--select-width', `${width}px`);
  menu.style.setProperty('--select-max-height', `${openUp ? Math.max(160, spaceAbove - 16) : Math.max(160, spaceBelow - 16)}px`);
  menu.classList.toggle('drop-up', openUp);
}

function syncCustomSelect(select) {
  if (!select?.dataset?.customReady) return;
  const wrapper = select.nextElementSibling?.classList?.contains('custom-select') ? select.nextElementSibling : null;
  if (!wrapper) return;
  const menu = wrapper._customMenu || document.querySelector(`.custom-select-menu[data-for="${select.id || ''}"]`);
  if (!menu) return;

  const triggerText = wrapper.querySelector('.custom-select-trigger span');
  const current = select.selectedOptions[0];
  if (triggerText) triggerText.textContent = current?.textContent || select.value || '请选择';

  menu.innerHTML = [...select.options].map(option => `
    <button type="button" class="${option.value === select.value ? 'active' : ''}" data-value="${escapeHtml(option.value)}">
      <span>${escapeHtml(option.textContent)}</span>
      ${option.value === select.value ? '<b>✓</b>' : ''}
    </button>
  `).join('');

  menu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', event => {
      event.stopPropagation();
      select.value = btn.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeAllCustomSelects();
      syncCustomSelect(select);
    });
  });

  if (wrapper.classList.contains('open')) {
    menu.classList.add('open');
    positionCustomSelectMenu(select, wrapper, menu);
  }
}

function syncCustomSelects() {
  enhanceCustomSelects();
  document.querySelectorAll('select').forEach(syncCustomSelect);
}

function normalizeSegments(draft) {
  if (draft.mode === 'text_only') {
    const existing = (draft.segments || [])[0];
    draft.segments = [{
      id: existing?.id || uid(),
      fromFrameId: null,
      toFrameId: null,
      prompt: existing?.prompt || '',
      duration: existing?.duration || 4,
      model: existing?.model || 'mini',
      resolution: existing?.resolution || '720p',
      status: existing?.status || 'draft',
      providerTaskId: existing?.providerTaskId || null,
      remoteSegmentId: existing?.remoteSegmentId || null,
      remoteTaskId: existing?.remoteTaskId || null,
      outputPath: existing?.outputPath || null,
      outputUrl: existing?.outputUrl || null,
      error: existing?.error || null,
      index: 0,
      mode: 'text_only',
      generateAudio: Boolean(existing?.generateAudio),
      referenceAssetId: existing?.referenceAssetId || null,
      referenceAssetIds: existing?.referenceAssetIds || [],
    }];
  } else {
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
        generateAudio: false,
        referenceAssetId: null,
      };
    }).map((segment, index) => ({ ...segment, index }));
  }
  if (!draft.segments.some(s => s.id === state.selectedSegmentId)) {
    state.selectedSegmentId = draft.segments[0]?.id || null;
  }
  const workspace = getWorkspace(draft);
  workspace.frames = draft.frames;
  workspace.segments = draft.segments;
  workspace.selectedSegmentId = state.selectedSegmentId;
}

async function persist(render = false) {
  if (!state.draft) return;
  bindCurrentWorkspace();
  normalizeSegments(state.draft);
  saveCurrentWorkspaceSelection();
  await saveDraft(state.draft);
  const idx = state.drafts.findIndex(d => d.id === state.draft.id);
  const snapshot = { ...state.draft, frames: state.draft.frames.map(f => ({ ...f })) };
  if (idx === -1) state.drafts.unshift(snapshot); else state.drafts[idx] = snapshot;
  if (render) renderAll();
  else {
    renderProjects();
    renderSummary();
    $('draft-status').textContent = `${workspaceLabel()} 已保存到浏览器`;
  }
}

function setView(view) {
  state.currentView = view;
  qsa('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  qsa('.view-tab').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  if (view === 'jobs') refreshJobs();
}


function orderedDrafts() {
  // 项目列表只按创建时间排序。点击/同步/查询不会把项目自动置顶，避免用户迷路。
  return [...state.drafts].sort((a, b) => Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0));
}

function renderProjects() {
  const list = orderedDrafts();
  $('project-list').innerHTML = list.length
    ? list.map(d => `
      <button class="project-item ${state.draft?.id===d.id?'active':''}" data-project="${d.id}">
        <strong>${escapeHtml(d.name)}</strong>
        <span>${d.frames?.length || 0} 张图 · ${new Date(d.createdAt || d.updatedAt || Date.now()).toLocaleString('zh-CN')}</span>
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
  if (state.draft.mode === 'text_only') {
    container.innerHTML = '';
    return;
  }
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
  if (state.draft.mode === 'text_only') {
    const segment = state.draft.segments[0];
    const ref = state.referenceVideo || getWorkspace().referenceVideo || null;
    timeline.innerHTML = `<article class="text-only-editor-card">
      <strong>纯文字生成</strong>
      <p>${escapeHtml(segment?.prompt || '尚未填写视频描述')}</p>
      <span>${(state.referenceAssets || []).length ? `已添加 ${(state.referenceAssets || []).length} 个参考内容` : '无参考内容 · 纯文字生成'}</span>
    </article>`;
  } else {
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
  }

  $('segment-list').innerHTML = state.draft.segments.length ? state.draft.segments.map(s => `
    <button class="segment-row ${state.selectedSegmentId===s.id?'active':''}" data-segment-row="${s.id}">
      <strong>SEG ${String(s.index+1).padStart(2,'0')}</strong>
      <p>${escapeHtml(s.prompt || '尚未填写提示词')}</p>
      <span>${s.duration}s · ${s.model==='fast'?'Fast':'Mini'}</span>
      <span>${s.resolution} · ${statusText(s.status)}</span>
    </button>`).join('') : '<div class="empty-state">首尾帧/多帧至少上传两张图片；纯文字模式直接输入描述即可生成。</div>';
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
  $('inspector-index').textContent = state.draft.mode === 'text_only' ? 'TEXT TO VIDEO' : `SEGMENT ${String(segment.index+1).padStart(2,'0')}`;
  $('inspector-name').textContent = state.draft.mode === 'text_only' ? '纯文字描述生成' : `图 ${fromIndex+1} → 图 ${toIndex+1}`;
  $('inspector-status').textContent = statusText(segment.status);
  $('segment-prompt').value = segment.prompt;
  $('segment-duration').value = String(segment.duration);
  $('segment-model').value = segment.model;
  $('segment-resolution').value = segment.resolution;
  $('segment-ratio').value = state.draft.ratio === 'adaptive' ? '智能比例' : state.draft.ratio;
  if ($('segment-audio')) $('segment-audio').value = String(Boolean(segment.generateAudio));
  if ($('segment-prompt')) $('segment-prompt').placeholder = state.draft.mode === 'text_only'
    ? '描述你想直接生成的视频。可以只写文字，也可以先上传一个参考视频，让模型学习动作、镜头节奏和风格。'
    : '描述这两帧之间的动作、镜头、节奏和画面变化。';
  syncCustomSelects();
}

function renderSummary() {
  $('summary-frames').textContent = state.draft.mode === 'text_only' ? '无需图片' : state.draft.frames.length;
  $('summary-segments').textContent = state.draft.mode === 'text_only' ? 1 : state.draft.segments.length;
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
  renderTextModePanel();
  syncCustomSelects();
}


function buildStrictFrameLockPrompt(segment) {
  const rawPrompt = String(segment?.prompt || '').trim();
  if (state.draft.mode === 'text_only') {
    const ratioLabel = state.draft.ratio === 'follow' ? '16:9' : state.draft.ratio;
    return [
      '【纯文字生成要求】',
      '当前任务为纯文字描述生成模式，没有上传参考图。',
      '请严格根据用户文字描述生成视频，不要凭空添加与描述冲突的主体、文字、Logo、人物或复杂背景。',
      `输出比例：${ratioLabel}；整体应保持画面稳定、主体明确、镜头运动自然。`,
      '【用户视频描述】',
      rawPrompt || '请生成一个画面稳定、质感高级、自然运动的短视频。'
    ].join('\n');
  }
  const fromIndex = state.draft.frames.findIndex(f => f.id === segment.fromFrameId);
  const toIndex = state.draft.frames.findIndex(f => f.id === segment.toFrameId);
  const modeLabel = state.draft.mode === 'first_last' ? '首尾帧模式' : '多帧 Storyboard 模式';
  const ratioLabel = state.draft.ratio === 'follow' ? '跟随素材比例' : state.draft.ratio;
  const frameA = fromIndex >= 0 ? `图 ${fromIndex + 1}` : '首图';
  const frameB = toIndex >= 0 ? `图 ${toIndex + 1}` : '尾图';
  const rules = [
    `【系统锁定要求｜必须严格遵守】`,
    `当前任务为${modeLabel}。已提供两张关键控制图，按顺序分别是起始控制图（${frameA}）和结束控制图（${frameB}）。`,
    `1. 视频第1帧必须与起始控制图高度一致：主体形象、IP造型、五官/表情（如有人物）、数字样式、道具、背景布局、配色、材质、光线、镜头角度、景别、构图、文字内容都不能被改写。`,
    `2. 视频最后1帧必须与结束控制图高度一致：主体形象、IP造型、数字样式、道具、背景布局、配色、材质、光线、镜头角度、景别、构图、文字内容都不能被改写。`,
    `3. 中间过程只允许做自然过渡、缓动和位移动画，不允许重新设计角色，不允许把元素换样式，不允许新增或删除主要元素，不允许改变数字、物体、背景、装饰、文字、世界观。`,
    `4. 若用户描述与两张控制图冲突，以两张控制图为最高优先级；动画要服务于从${frameA}过渡到${frameB}，而不是重新创作一套新画面。`,
    `5. 保持同一资产、同一世界观、同一镜头语言、同一透视、同一光照逻辑；最终输出比例为 ${ratioLabel}，应尽量避免裁切关键主体。`,
    `【用户动画要求】`,
    rawPrompt || '请基于两张控制图做自然、稳定、轻微的镜头和主体过渡动画。',
  ];
  return rules.join('\n');
}

function updateRatioTip() {
  const ratio = state.draft.ratio;
  const size = `${state.draft.finalWidth} × ${state.draft.finalHeight}`;
  $('ratio-tip').textContent = ratio === 'adaptive'
    ? `当前为 Seedance 原生智能比例，最终尺寸仍按 ${size} 控制本地预览与合成长视频。`
    : ratio === '3:1'
      ? `当前为 3:1 超宽项目，提交 Ark 时会映射到 21:9，最终尺寸：${size}。`
      : ratio === 'follow'
        ? `比例将跟随首帧，最终输出尺寸仍以 ${size} 为准。`
        : `项目内全部片段统一使用 ${ratio}，最终尺寸：${size}。`;
}




function deepFindVideoUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const isHttp = /^https?:\/\//i.test(value);
    const looksVideo = /\.(mp4|mov|webm)(\?|#|$)/i.test(value) || /video/i.test(value);
    return isHttp && looksVideo ? value : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindVideoUrl(item);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    const priorityKeys = [
      'video_url',
      'file_url',
      'output_url',
      'download_url',
      'url',
      'signed_url',
      'provider_video_url',
    ];
    for (const key of priorityKeys) {
      if (key in value) {
        const found = deepFindVideoUrl(value[key]);
        if (found) return found;
      }
    }
    for (const item of Object.values(value)) {
      const found = deepFindVideoUrl(item);
      if (found) return found;
    }
  }
  return '';
}

function outputVideoUrlFromMetadata(meta = {}) {
  return (
    meta.provider_video_url ||
    meta.video_url ||
    meta.output_url ||
    meta.download_url ||
    meta.provider_url ||
    meta.ark_response?.content?.video_url ||
    meta.ark_response?.content?.file_url ||
    meta.ark_response?.data?.content?.video_url ||
    meta.ark_response?.data?.content?.file_url ||
    deepFindVideoUrl(meta)
  );
}

function providerTaskIdFromOutputRow(row, meta = {}) {
  return (
    meta.provider_task_id ||
    meta.providerTaskId ||
    meta.ark_response?.id ||
    meta.ark_response?.data?.id ||
    String(row?.storage_path || '').replace(/^ark:\/\//, '').replace(/\.mp4$/, '') ||
    ''
  );
}

function activeTaskStatuses() {
  return new Set(['preparing','uploading','submitting','retrying','submitted','queued','running','processing']);
}

function doneTaskStatuses() {
  return new Set(['completed','succeeded','success']);
}

function outputBelongsToSegment(output, segment, oldProviderTaskId = null, oldRemoteTaskId = null) {
  if (!output || !segment) return false;
  if (output.segmentId && output.segmentId === segment.id) return true;
  if (oldProviderTaskId && output.providerTaskId === oldProviderTaskId) return true;
  if (oldRemoteTaskId && output.taskId === oldRemoteTaskId) return true;
  if (segment.providerTaskId && output.providerTaskId === segment.providerTaskId) return true;
  if (segment.remoteTaskId && output.taskId === segment.remoteTaskId) return true;
  return false;
}

function rememberHistoricalOutput(output, segment, reason = '重新提交前旧版本') {
  if (!output?.url || !segment) return;
  const workspace = getWorkspace();
  workspace.outputHistory = Array.isArray(workspace.outputHistory) ? workspace.outputHistory : [];
  state.outputHistory = Array.isArray(state.outputHistory) ? state.outputHistory : workspace.outputHistory;

  const item = {
    ...output,
    historyId: `${output.providerTaskId || output.taskId || output.url}-${Date.now()}`,
    segmentId: segment.id,
    index: segment.index,
    promptSnapshot: segment.prompt || '',
    savedAt: Date.now(),
    reason,
    historical: true,
  };

  const key = output.providerTaskId || output.taskId || output.url;
  const exists = state.outputHistory.some(old => (old.providerTaskId || old.taskId || old.url) === key);
  if (!exists) state.outputHistory.unshift(item);
  state.outputHistory = state.outputHistory.slice(0, 30);
  workspace.outputHistory = state.outputHistory;
}

function currentOutputRows() {
  return (state.outputs || []).filter(isOutputCurrentForSegment);
}

function historicalOutputRows() {
  const currentKeys = new Set(currentOutputRows().map(o => o.providerTaskId || o.taskId || o.url));
  return (state.outputHistory || []).filter(o => !currentKeys.has(o.providerTaskId || o.taskId || o.url));
}

function activeGenerationRows() {
  return (state.draft?.segments || []).filter(s => activeTaskStatuses().has(String(s.status || '').toLowerCase()));
}

function renderActiveGenerationCards() {
  const active = activeGenerationRows();
  if (!active.length) return '';
  return active.map(s => `
    <article class="output-card output-card-generating">
      <div class="generation-live">
        <strong>Segment ${String(s.index + 1).padStart(2, '0')} · ${statusText(s.status)}</strong>
        <span>${escapeHtml(s.prompt || '未填写提示词')}</span>
        <div class="mini-progress"><i style="width:${Math.max(2, Number(s.progress || 0))}%"></i></div>
        <small>${s.providerTaskId ? `Ark Task：${escapeHtml(s.providerTaskId)}` : '正在创建新的 Ark Task，本次完成后才会替换为新视频。'}</small>
      </div>
    </article>
  `).join('');
}


function outputKey(o) {
  return String(o?.providerTaskId || o?.taskId || o?.url || o?.index || '').trim();
}

async function fetchVideoBlobThroughProxy(output) {
  const providerTaskId = output?.providerTaskId;
  const taskId = output?.taskId;
  if (!providerTaskId && !taskId) throw new Error('缺少 Ark Task ID，无法通过代理拉取视频');

  const token = await getAccessToken();
  const params = new URLSearchParams();
  if (providerTaskId) params.set('provider_task_id', providerTaskId);
  if (taskId) params.set('task_id', taskId);

  const response = await fetch(`${SEEDANCE_VIDEO_PROXY_URL}?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let detail = '';
    try {
      const json = await response.json();
      detail = json.message || json.error || JSON.stringify(json);
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new Error(detail || `视频代理返回 HTTP ${response.status}`);
  }

  if (!contentType.includes('video') && !contentType.includes('octet-stream')) {
    let detail = '';
    try {
      const json = await response.json();
      detail = json.message || json.error || JSON.stringify(json);
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new Error(detail || '视频代理没有返回 MP4 文件');
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error('代理返回了空视频文件');
  return blob;
}

async function hydrateProxyVideoElements() {
  const videos = qsa('video[data-provider-task-id]');
  for (const video of videos) {
    if (video.dataset.proxyLoading === '1' || video.dataset.proxyLoaded === '1') continue;

    const providerTaskId = video.dataset.providerTaskId || '';
    const taskId = video.dataset.taskId || '';
    const key = providerTaskId || taskId || video.dataset.outputKey || '';
    const statusEl = document.querySelector(`[data-output-load-status="${CSS.escape(key)}"]`);
    const downloadEl = document.querySelector(`[data-proxy-download="${CSS.escape(key)}"]`);

    if (!key) continue;

    if (state.outputBlobUrls.has(key)) {
      const cachedUrl = state.outputBlobUrls.get(key);
      video.src = cachedUrl;
      video.dataset.proxyLoaded = '1';
      if (downloadEl) downloadEl.href = cachedUrl;
      if (statusEl) statusEl.textContent = '已通过代理加载，可播放/下载';
      continue;
    }

    const output = [...(state.outputs || []), ...(state.outputHistory || [])].find(o => {
      return o.providerTaskId === providerTaskId || o.taskId === taskId || outputKey(o) === key;
    });

    if (!output) continue;

    video.dataset.proxyLoading = '1';
    if (statusEl) statusEl.textContent = '正在通过服务端代理拉取 MP4...';

    try {
      const blob = await fetchVideoBlobThroughProxy(output);
      const objectUrl = URL.createObjectURL(blob);
      state.outputBlobUrls.set(key, objectUrl);

      video.src = objectUrl;
      video.dataset.proxyLoaded = '1';
      video.dataset.proxyLoading = '0';
      video.load();

      if (downloadEl) {
        downloadEl.href = objectUrl;
        downloadEl.download = `seedance-${providerTaskId || taskId || Date.now()}.mp4`;
      }
      if (statusEl) statusEl.textContent = `已通过代理加载：${formatBytes(blob.size)}`;
    } catch (error) {
      video.dataset.proxyLoading = '0';
      const msg = errorMessage(error, '视频代理加载失败');
      if (statusEl) statusEl.textContent = `加载失败：${msg}`;
      console.warn('[Seedance Studio] proxy video load failed', error);
    }
  }
}

function outputCardMarkup(o, historical = false) {
  const title = historical
    ? `Segment ${String(Number(o.index || 0) + 1).padStart(2,'0')} · 历史版本`
    : `Segment ${String(Number(o.index || 0) + 1).padStart(2,'0')} · 已完成`;
  const key = outputKey(o);
  const isArkOutput = o.storageMode === 'ark-temp' || o.providerTaskId;
  const directUrl = isArkOutput ? '' : (o.url || '');

  return `
    <article class="output-card ${historical ? 'output-card-history' : ''}">
      <video controls preload="metadata"
        src="${escapeHtml(directUrl)}"
        data-output-key="${escapeHtml(key)}"
        data-provider-task-id="${escapeHtml(o.providerTaskId || '')}"
        data-task-id="${escapeHtml(o.taskId || '')}"></video>
      <div class="output-copy">
        <strong>${title}</strong>
        <span>${historical ? '旧版本已保留，不会被新提交覆盖' : (isArkOutput ? 'Ark 输出 · 通过服务端代理拉取 MP4' : 'Supabase Storage 已保存')}</span>
        <small data-output-load-status="${escapeHtml(key)}">${isArkOutput ? '等待代理加载视频...' : '可直接播放'}</small>
        ${o.providerTaskId ? `<small>Ark Task：${escapeHtml(o.providerTaskId)}</small>` : ''}
        ${historical && o.promptSnapshot ? `<small>旧提示词：${escapeHtml(o.promptSnapshot).slice(0, 120)}...</small>` : ''}
        <div class="output-actions">
          <button data-edit-output-segment="${o.segmentId || ''}" data-output-index="${o.index}">重新编辑</button>
          <a href="${escapeHtml(directUrl || '#')}" download="seedance-${escapeHtml(o.providerTaskId || `segment-${Number(o.index || 0)+1}`)}.mp4" target="_blank" rel="noopener" data-proxy-download="${escapeHtml(key)}" data-download-output="${o.providerTaskId || o.index}">下载到本地</a>
        </div>
      </div>
    </article>`;
}


function isOutputCurrentForSegment(output) {
  const segment = state.draft?.segments?.find(s => {
    if (output.segmentId && s.id === output.segmentId) return true;
    if (output.providerTaskId && s.providerTaskId === output.providerTaskId) return true;
    return false;
  });
  if (!segment) return true;
  if (segment.providerTaskId && output.providerTaskId && output.providerTaskId !== segment.providerTaskId) return false;
  if (segment.remoteTaskId && output.taskId && output.taskId !== segment.remoteTaskId) return false;
  if ((segment.previousTaskIds || []).includes(output.providerTaskId) || (segment.previousTaskIds || []).includes(output.taskId)) return false;
  return true;
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
        <button data-recover-output="${s.id}">找回视频</button>
        <button data-bind-provider-task="${s.id}">输入Task找回</button>
        <button data-edit-from-job="${s.id}">重新编辑</button>
        <button data-retry-segment="${s.id}" class="danger-lite">重新提交</button>
      </div>
    </article>`).join('') : '<div class="empty-state">暂无生成任务</div>';

  const activeMarkup = renderActiveGenerationCards();
  const visibleOutputs = currentOutputRows();
  const historyOutputs = historicalOutputRows();
  const outputMarkup = [
    activeMarkup,
    visibleOutputs.map(o => outputCardMarkup(o, false)).join(''),
    historyOutputs.length ? `<div class="history-title">历史输出</div>${historyOutputs.map(o => outputCardMarkup(o, true)).join('')}` : '',
  ].filter(Boolean).join('');
  $('outputs-list').innerHTML = outputMarkup || '<div class="empty-state">暂无视频输出。提交后会自动显示真实任务状态和生成结果。</div>';
  setTimeout(hydrateProxyVideoElements, 0);

  qsa('[data-refresh-segment]').forEach(btn => btn.onclick = async () => { await refreshJobs(); });
  qsa('[data-recover-output]').forEach(btn => btn.onclick = async () => { await recoverSegmentOutput(btn.dataset.recoverOutput); });
  qsa('[data-bind-provider-task]').forEach(btn => btn.onclick = async () => { await bindProviderTaskAndRecover(btn.dataset.bindProviderTask); });
  qsa('[data-edit-from-job]').forEach(btn => btn.onclick = () => reEditSegment(btn.dataset.editFromJob));
  qsa('[data-edit-output-segment]').forEach(btn => btn.onclick = () => reEditSegment(btn.dataset.editOutputSegment || findSegmentIdByOutputIndex(btn.dataset.outputIndex)));
  qsa('[data-retry-segment]').forEach(btn => btn.onclick = () => resubmitSegment(btn.dataset.retrySegment));
  qsa('[data-download-output]').forEach(link => link.onclick = () => {
    const set = downloadedSet();
    set.add(link.dataset.downloadOutput);
    saveDownloadedSet(set);
  });
}


function findSegmentIdByOutputIndex(indexValue) {
  const index = Number(indexValue);
  const segment = state.draft?.segments?.find(s => Number(s.index) === index);
  return segment?.id || null;
}

function reEditSegment(segmentId) {
  if (!segmentId) {
    toast('无法定位片段', '这个输出没有找到对应片段，请在高级 Storyboard 中手动选择。');
    setView('editor');
    return;
  }
  const segment = state.draft.segments.find(s => s.id === segmentId || s.remoteTaskId === segmentId);
  if (!segment) {
    toast('无法定位片段', '当前工作区没有找到对应片段，请确认是否切换到了正确模式。');
    setView('editor');
    return;
  }
  state.selectedSegmentId = segment.id;
  saveCurrentWorkspaceSelection();
  setView('editor');
  renderEditor();
  toast('已回到编辑页', `现在可以调整 ${workspaceLabel()} 的首尾帧和提示词，再决定是否重新提交。`);
}

function renderAll() {
  normalizeSegments(state.draft);
  renderProjects();
  renderSettings();
  renderQuickTimeline();
  renderEditor();
  renderSummary();
  renderJobs();
  renderTextModePanel();
  syncCustomSelects();
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
  if (!await confirmBox('删除图片', `确定从${workspaceLabel()}删除“${frame.name}”吗？另一种模式里的图片和输出不会受影响。`)) return;
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


async function addReferenceVideo(fileList) {
  return addReferenceAssets(fileList);
}

async function addReferenceAssets(fileList) {
  const files = [...fileList];
  const allowed = new Set([
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4', 'audio/ogg',
    'image/png', 'image/jpeg', 'image/webp',
  ]);

  let added = 0;
  for (const file of files) {
    if (!allowed.has(file.type)) {
      toast('格式不支持', `${file.name} 不是支持的参考格式`);
      continue;
    }
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const maxSize = isVideo ? 300 * 1024 * 1024 : isAudio ? 80 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast('文件过大', `${file.name} 超过当前类型限制`);
      continue;
    }

    state.referenceAssets = state.referenceAssets || [];
    state.referenceAssets.push({
      id: uid(),
      name: file.name,
      type: file.type,
      size: file.size,
      blob: file,
      createdAt: Date.now(),
      remoteAssetId: null,
      remotePath: null,
    });
    added += 1;
  }

  state.referenceVideo = state.referenceAssets[0] || null;
  getWorkspace().referenceAssets = state.referenceAssets;
  getWorkspace().referenceVideo = state.referenceVideo;
  renderTextModePanel();
  await persist();
  if (added) toast('参考内容已加入', `已添加 ${added} 个参考内容，可在文字中指定参考方向。`);
}

async function uploadReferenceVideo(projectId) {
  const ids = await uploadReferenceAssets(projectId);
  return ids[0] || null;
}

async function uploadReferenceAssets(projectId) {
  const assets = state.referenceAssets || getWorkspace().referenceAssets || [];
  const resultIds = [];

  for (const ref of assets) {
    if (ref.remoteAssetId && ref.remotePath) {
      resultIds.push(ref.remoteAssetId);
      continue;
    }
    if (!(ref.blob instanceof Blob)) throw new Error(`参考内容“${ref.name}”的本地文件已丢失，请重新上传`);

    const ext = extensionFromMime(ref.type);
    const kindFolder = ref.type.startsWith('audio/') ? 'reference-audios' : ref.type.startsWith('image/') ? 'reference-images' : 'reference-videos';
    const safeNameBase = String(ref.name || 'reference').replace(/\.[^.]+$/, '').replace(/[^\w.\-]+/g,'_').slice(-90) || 'reference';
    const path = `${state.user.id}/${projectId}/${kindFolder}/${ref.id}-${Date.now()}-${safeNameBase}.${ext}`;

    const upload = await withTimeout(
      supabase.storage.from('seedance-inputs').upload(path, ref.blob, {
        contentType: ref.type || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600',
      }),
      TIMEOUTS.upload,
      `上传参考内容 ${ref.name}`,
    );
    if (upload.error) throw new Error(`参考内容上传失败：${errorMessage(upload.error)}`);

    const insert = await withTimeout(
      supabase.from('video_assets').insert({
        owner_id: state.user.id,
        project_id: projectId,
        bucket_id: 'seedance-inputs',
        object_path: path,
        original_name: ref.name,
        mime_type: ref.type || 'application/octet-stream',
        file_size: ref.blob.size,
        width: null,
        height: null,
        kind: ref.type.startsWith('audio/') ? 'reference_audio' : ref.type.startsWith('image/') ? 'reference_image' : 'reference_video',
        sort_order: resultIds.length,
      }).select().single(),
      TIMEOUTS.database,
      `登记参考内容 ${ref.name}`,
    );
    if (insert.error) {
      try { await supabase.storage.from('seedance-inputs').remove([path]); } catch {}
      throw new Error(`参考内容登记失败：${errorMessage(insert.error)}`);
    }

    ref.remoteAssetId = insert.data.id;
    ref.remotePath = path;
    resultIds.push(ref.remoteAssetId);
  }

  state.referenceAssets = assets;
  state.referenceVideo = assets[0] || null;
  getWorkspace().referenceAssets = assets;
  getWorkspace().referenceVideo = state.referenceVideo;
  return resultIds;
}

function extensionFromMime(type) {
  const map = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return map[type] || 'bin';
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
  toast('已加入当前工作区', `${workspaceLabel()} 已加入 ${files.length} 张图片，另一种模式不会受影响。`);
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
  const draft = migrateDraftWorkspaces(await getDraft(id));
  if (!draft) return;

  clearInterval(state.pollTimer);
  state.pollTimer = null;

  state.objectUrls.forEach(url => URL.revokeObjectURL(url));
  state.objectUrls.clear();

  // 切换项目时立刻清空上一项目的输出缓存，避免右侧继续展示上一个项目的视频。
  state.outputs = [];
  state.jobs = [];

  state.draft = draft;
  bindCurrentWorkspace();
  normalizeSegments(state.draft);
  saveCurrentWorkspaceSelection();
  localStorage.setItem(LAST_SELECTED_DRAFT_KEY, id);

  // 先渲染一次空状态，让用户看到确实切换到了当前项目。
  renderAll();

  try {
    await syncRemoteTasks();
    await loadOutputs();
  } catch (error) {
    console.warn('[Seedance Studio] project switch sync failed', error);
  }

  renderAll();

  const hasActive = state.draft.segments.some(s =>
    ['submitting','submitted','queued','running','processing'].includes(String(s.status || '').toLowerCase())
  );
  if (hasActive) startPolling();
}

async function createProject() {
  const draft = migrateDraftWorkspaces(newDraft());
  await saveDraft(draft);
  state.drafts.unshift(draft);
  await selectDraft(draft.id);
  setView('quick');
}

async function removeProject() {
  if (!state.draft || !await confirmBox('删除项目', `确定删除“${state.draft.name}”及其本地图片草稿吗？`)) return;
  const id = state.draft.id;
  Object.values(state.draft.workspaces || {}).forEach(ws => {
    (ws.frames || []).forEach(f => releaseFrameUrl(f.id));
    if (ws.referenceVideo?.id) releaseFrameUrl(ws.referenceVideo.id);
    (ws.referenceAssets || []).forEach(asset => asset?.id && releaseFrameUrl(asset.id));
  });
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
    retrying:'重试连接',
    queued:'排队中',
    submitted:'已提交',
    running:'生成中',
    processing:'生成中',
    completed:'已完成',
    succeeded:'已完成',
    success:'已完成',
    failed:'失败',
    error:'失败',
    recovering:'找回中',
    charged_unknown:'疑似已扣费待确认'
  })[String(status || '').toLowerCase()] || status || '草稿';
}

async function ensureRemoteProject() {
  bindCurrentWorkspace();

  const workspace = getWorkspace();
  const isTextOnly = state.draft?.mode === 'text_only';

  if (workspace.remoteProjectId) {
    state.draft.remoteProjectId = workspace.remoteProjectId;
    return workspace.remoteProjectId;
  }

  const payload = {
    owner_id: state.user.id,
    name: state.draft.name,
    mode: isTextOnly ? 'text_only' : state.draft.mode,
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

  if (result.error) {
    throw new Error(`创建项目失败：${errorMessage(result.error)}`);
  }

  state.draft.remoteProjectId = result.data.id;
  workspace.remoteProjectId = result.data.id;

  saveCurrentWorkspaceSelection();
  await persist();

  return result.data.id;
}

async function uploadFrame(frame, projectId, order) {
  if (frame.remoteAssetId && frame.remotePath && frame.arkSafeVersion === IMAGE_SAFE_VERSION) return frame;
  if (!(frame.blob instanceof Blob)) throw new Error(`图片“${frame.name}”的本地文件已丢失，请重新上传`);

  const safeFrame = await makeArkSafeFrameBlob(frame);
  const safeNameBase = String(frame.name || 'frame.png').replace(/\.[^.]+$/, '').replace(/[^\w.\-]+/g,'_').slice(-90) || 'frame';
  const ext = safeFrame.type === 'image/png' ? 'png' : 'jpg';
  const path = `${state.user.id}/${projectId}/${String(order).padStart(3,'0')}-${frame.id}-${Date.now()}-${safeNameBase}.${ext}`;

  const upload = await withTimeout(
    supabase.storage.from('seedance-inputs').upload(path, safeFrame.blob, {
      contentType: safeFrame.type || 'image/png',
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
      original_name: safeFrame.normalized ? `${frame.name}（已自动补边适配 Seedance）` : frame.name,
      mime_type: safeFrame.type || 'image/png',
      file_size: safeFrame.blob.size,
      width: safeFrame.width,
      height: safeFrame.height,
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
  frame.arkSafeVersion = IMAGE_SAFE_VERSION;
  frame.uploadWidth = safeFrame.width;
  frame.uploadHeight = safeFrame.height;
  frame.wasAspectPadded = Boolean(safeFrame.normalized);
  frame.aspectPadMode = safeFrame.padMode || 'none';
  frame.uploadSafeRatio = safeFrame.safeRatio || (safeFrame.width && safeFrame.height ? safeFrame.width / safeFrame.height : null);
  frame.originalRatio = safeFrame.originalRatio || (frame.width && frame.height ? frame.width / frame.height : null);
  return frame;
}

async function uploadNeededFrames(segmentIds) {
  const projectId = await ensureRemoteProject();
  const segments = state.draft.segments.filter(s => segmentIds.includes(s.id));
  if (state.draft.mode === 'text_only') {
    const referenceAssetIds = await uploadReferenceAssets(projectId);
    segments.forEach(segment => {
      segment.referenceAssetId = referenceAssetIds[0] || null;
      segment.referenceAssetIds = referenceAssetIds;
      segment.status = 'submitting';
      segment.progress = 13;
      segment.error = null;
    });
    renderAll();
    await persist();
    return projectId;
  }
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
  const isTextOnly = state.draft.mode === 'text_only';
  if (!projectId) throw new Error('远程项目尚未创建');
  if (!isTextOnly && (!from?.remoteAssetId || !to?.remoteAssetId)) throw new Error(`Segment ${segment.index + 1} 的首尾帧尚未上传完成`);

  const segmentPayload = {
    owner_id: state.user.id,
    project_id: projectId,
    position: segment.index,
    from_asset_id: isTextOnly ? null : from.remoteAssetId,
    to_asset_id: isTextOnly ? null : to.remoteAssetId,
    prompt: segment.prompt,
    model_alias: segment.model,
    duration: Number(segment.duration),
    resolution: segment.resolution,
    ratio: state.draft.ratio === 'follow' ? 'adaptive' : state.draft.ratio,
    status: 'ready',
    mode: isTextOnly ? 'text_only' : state.draft.mode,
    reference_asset_id: isTextOnly ? (segment.referenceAssetId || state.referenceAssets?.[0]?.remoteAssetId || null) : null,
    reference_asset_ids: isTextOnly ? (segment.referenceAssetIds || (state.referenceAssets || []).map(item => item.remoteAssetId).filter(Boolean)) : [],
    reference_directions: isTextOnly ? (state.referenceAssets || []).map((item, index) => ({
      asset_id: item.remoteAssetId || null,
      token: referenceToken(item, index),
      name: item.name,
      mime_type: item.type,
      usage: 'free_prompt_reference',
    })) : [],
    generate_audio: Boolean(segment.generateAudio),
  };

  if (!segment.remoteSegmentId) {
    const insert = await withTimeout(
      supabase.from('video_segments').insert(segmentPayload).select().single(),
      TIMEOUTS.database,
      `创建 Segment ${segment.index + 1}`,
    );
    if (insert.error) throw new Error(`创建 Segment ${segment.index + 1} 失败：${errorMessage(insert.error)}`);
    segment.remoteSegmentId = insert.data.id;
  } else {
    const update = await withTimeout(
      supabase.from('video_segments')
        .update({
          from_asset_id: segmentPayload.from_asset_id,
          to_asset_id: segmentPayload.to_asset_id,
          prompt: segmentPayload.prompt,
          model_alias: segmentPayload.model_alias,
          duration: segmentPayload.duration,
          resolution: segmentPayload.resolution,
          ratio: segmentPayload.ratio,
          status: 'ready',
          mode: segmentPayload.mode,
          reference_asset_id: segmentPayload.reference_asset_id,
          reference_asset_ids: segmentPayload.reference_asset_ids,
          reference_directions: segmentPayload.reference_directions,
          generate_audio: segmentPayload.generate_audio,
        })
        .eq('id', segment.remoteSegmentId)
        .eq('owner_id', state.user.id)
        .select()
        .single(),
      TIMEOUTS.database,
      `更新 Segment ${segment.index + 1}`,
    );
    if (update.error) throw new Error(`更新 Segment ${segment.index + 1} 失败：${errorMessage(update.error)}`);
  }

  const submitNonce = `${segment.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  segment.currentSubmitNonce = submitNonce;
  segment.currentSubmitStartedAt = Date.now();

  const body = {
    project_id: projectId,
    segment_id: segment.remoteSegmentId,
    asset_ids: isTextOnly ? [] : [from.remoteAssetId, to.remoteAssetId],
    prompt: segment.prompt,
    effective_prompt: buildStrictFrameLockPrompt(segment),
    prompt_mode: isTextOnly ? 'text_reference_video_v14' : 'strict_frame_lock_v14',
    client_submit_nonce: submitNonce,
    reference_asset_id: isTextOnly ? (segment.referenceAssetId || state.referenceAssets?.[0]?.remoteAssetId || null) : null,
    reference_asset_ids: isTextOnly ? (segment.referenceAssetIds || (state.referenceAssets || []).map(item => item.remoteAssetId).filter(Boolean)) : [],
    reference_directions: isTextOnly ? (state.referenceAssets || []).map((item, index) => ({
      asset_id: item.remoteAssetId || null,
      token: referenceToken(item, index),
      name: item.name,
      mime_type: item.type,
      usage: 'free_prompt_reference',
    })) : [],
    generate_audio: Boolean(segment.generateAudio),
    model_alias: segment.model,
    duration: Number(segment.duration),
    resolution: segment.resolution,
    ratio: state.draft.ratio === 'follow' ? 'adaptive' : state.draft.ratio,
    frame_fit_mode: state.draft.fitMode,
    final_width: Number(state.draft.finalWidth),
    final_height: Number(state.draft.finalHeight),
    mode: isTextOnly ? 'text_only' : state.draft.mode,
  };

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      segment.status = attempt === 1 ? 'submitting' : 'retrying';
      segment.progress = attempt === 1 ? 14 : 10;
      segment.error = attempt === 1 ? null : `第 ${attempt} 次重新连接 Ark...`;
      renderJobs();
      await persist();

      const data = await invokeEdgeFunction('seedance-submit', body);
      if (!data.task_id || !data.provider_task_id) throw new Error(data.error || 'Seedance 提交接口没有返回 task_id / provider_task_id');

      segment.status = data.status || 'queued';
      segment.progress = Number(data.progress || 20);
      segment.remoteTaskId = data.task_id;
      segment.providerTaskId = data.provider_task_id;
      segment.currentSubmitNonce = submitNonce;
      segment.outputPath = null;
      segment.outputUrl = null;
      segment.error = null;
      await persist();
      return segment;
    } catch (error) {
      lastError = error;
      if (attempt === 3 && isRetryableSubmitError(error)) {
        segment.status = 'charged_unknown';
        segment.progress = Math.max(Number(segment.progress || 0), 12);
        segment.error = '提交请求中断：Ark 可能已经创建任务并扣费，但本地没有拿到 cgt Task ID。请去火山控制台查找该时间点的 cgt-...，然后点“输入Task找回”。';
        renderJobs();
        await persist();
      }
      if (!isRetryableSubmitError(error) || attempt === 3) break;
      await sleep(3500 * attempt);
    }
  }

  throw lastError || new Error('提交 Seedance 失败');
}


function resetSegmentForNewSubmit(segment) {
  if (!segment) return;
  const oldProviderTaskId = segment.providerTaskId || null;
  const oldRemoteTaskId = segment.remoteTaskId || null;

  // 旧视频不能丢：先收进历史输出，再把它从“当前输出”移开。
  (state.outputs || []).forEach(output => {
    if (outputBelongsToSegment(output, segment, oldProviderTaskId, oldRemoteTaskId)) {
      rememberHistoricalOutput(output, segment, '重新提交前旧版本');
    }
  });

  segment.status = 'draft';
  segment.progress = 0;
  segment.error = null;
  segment.providerTaskId = null;
  segment.remoteTaskId = null;
  segment.remoteSegmentId = null;
  segment.outputPath = null;
  segment.outputUrl = null;
  segment.lastResubmitAt = Date.now();
  segment.previousTaskIds = [...(segment.previousTaskIds || []), oldProviderTaskId, oldRemoteTaskId].filter(Boolean);

  state.outputs = (state.outputs || []).filter(output => !outputBelongsToSegment(output, segment, oldProviderTaskId, oldRemoteTaskId));
  const workspace = getWorkspace();
  workspace.outputs = state.outputs;
  workspace.outputHistory = state.outputHistory || workspace.outputHistory || [];
}


function segmentHasExistingTask(segment) {
  return Boolean(segment?.providerTaskId || segment?.remoteTaskId || segment?.outputPath || segment?.outputUrl || ['completed','succeeded','success','failed','cancelled'].includes(String(segment?.status || '').toLowerCase()));
}

function prepareSegmentForEditorSubmit(segment) {
  if (!segmentHasExistingTask(segment)) return false;
  resetSegmentForNewSubmit(segment);
  return true;
}

async function resubmitSegment(segmentId) {
  const segment = state.draft?.segments?.find(s => s.id === segmentId);
  if (!segment) {
    toast('无法重新提交', '当前工作区没有找到对应片段。');
    return;
  }

  const ok = await confirmBox(
    '重新提交新任务',
    '这会创建一个新的 Ark 生成任务，并可能再次产生费用。旧视频会保留在历史输出里，新任务会显示在上方生成中。确定继续吗？'
  );
  if (!ok) return;

  resetSegmentForNewSubmit(segment);
  saveCurrentWorkspaceSelection();
  renderAll();
  await persist();
  await generateSegments([segment.id]);
}


async function generateSegments(segmentIds) {
  if (state.isGenerating) return toast('任务正在提交', '请等待当前提交完成后再操作。');
  const segments = state.draft.segments.filter(s => segmentIds.includes(s.id));
  if (!segments.length) return toast('没有可生成片段', state.draft.mode === 'text_only' ? '请先填写文字描述。' : '首尾帧/多帧请先上传至少两张图片；纯文字模式请填写描述。');

  let resetCount = 0;
  segments.forEach(segment => {
    if (prepareSegmentForEditorSubmit(segment)) resetCount += 1;
  });
  if (resetCount) {
    state.outputs = (state.outputs || []).filter(isOutputCurrentForSegment);
    saveCurrentWorkspaceSelection();
    renderAll();
    await persist();
  }
  const invalid = segments.find(s => !s.prompt.trim());
  if (invalid) {
    state.selectedSegmentId = invalid.id;
    setView('editor');
    renderEditor();
    return toast('提示词未填写', `请先填写 Segment ${invalid.index+1} 的提示词。`);
  }
  if (!await confirmBox('确认提交真实任务', `将提交 ${segments.length} 个视频片段。为避免 Ark 连接超时，多帧会逐段提交，可能产生 Ark API 费用。`)) return;

  state.isGenerating = true;
  const generateAllButton = $('generate-all');
  if (generateAllButton) {
    generateAllButton.disabled = true;
    generateAllButton.textContent = '正在提交...';
  }
  setView('jobs');

  try {
    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; });
    // 强制当前要生成的帧重新上传。旧版本曾把 3:1 原图直接传给 Ark，导致 image_url 比例 3.00 报错。
    // 重新上传会走 makeArkSafeFrameBlob，把超宽图自动补边到 Seedance 可接受比例。
    const forceFrameIds = new Set(segments.flatMap(s => [s.fromFrameId, s.toFrameId]));
    state.draft.frames.forEach(frame => {
      if (forceFrameIds.has(frame.id)) {
        frame.remoteAssetId = null;
        frame.remotePath = null;
        frame.arkSafeVersion = null;
        frame.wasAspectPadded = false;
      }
    });
    renderAll();
    await persist();
    await uploadNeededFrames(segmentIds);

    const queue = [...segments];
    const workers = Array.from({ length: Math.min(1, queue.length) }, async () => {
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
      (segment.remoteTaskId && item.task_id === segment.remoteTaskId) ||
      (segment.providerTaskId && item.provider_task_id === segment.providerTaskId)
    ) || data;

    if (result.provider_task_id && segment.providerTaskId && result.provider_task_id !== segment.providerTaskId) {
      console.warn('[Seedance Studio] ignored stale status result', result.provider_task_id, 'current=', segment.providerTaskId);
      return;
    }

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

  const activeStatuses = new Set(['submitting', 'submitted', 'queued', 'running', 'processing']);
  const failedStatuses = new Set(['failed', 'error']);

  function scoreTask(task) {
    let score = task.createdMs;
    if (activeStatuses.has(task.statusLower)) score += 1_000_000_000;
    if (failedStatuses.has(task.statusLower)) score -= 1_000_000_000;
    if (task.provider_task_id) score += 1000;
    return score;
  }

  function applyRemoteTask(local, latestTask) {
    const previousProviderTaskId = local.providerTaskId;
    local.remoteSegmentId = latestTask.segment_id || local.remoteSegmentId;
    local.remoteTaskId = latestTask.id || local.remoteTaskId;
    local.providerTaskId = latestTask.provider_task_id || local.providerTaskId;
    local.status = latestTask.status || local.status;
    local.progress = Number(latestTask.progress ?? local.progress ?? 0);
    local.error = latestTask.error_message || null;

    if (previousProviderTaskId && latestTask.provider_task_id && previousProviderTaskId !== latestTask.provider_task_id) {
      console.log('[Seedance Studio] task switched', previousProviderTaskId, '=>', latestTask.provider_task_id);
    }
  }

  for (const local of state.draft.segments) {
    let candidateTasks = [];

    // 最高优先级：本地当前正在跟踪的 task。只要有它，就绝不再按 position 捞旧 completed task。
    if (local.remoteTaskId) candidateTasks = tasks.filter(task => task.id === local.remoteTaskId);
    if (!candidateTasks.length && local.providerTaskId) candidateTasks = tasks.filter(task => task.provider_task_id === local.providerTaskId);
    if (!candidateTasks.length && local.remoteSegmentId) candidateTasks = tasks.filter(task => task.segment_id === local.remoteSegmentId);

    // 只有完全没有当前 task/segment 时，才允许按 position 恢复历史远程任务。
    if (!candidateTasks.length && !local.remoteTaskId && !local.providerTaskId && !local.remoteSegmentId) {
      const position = Number(local.index || 0);
      const candidates = segmentsByPosition.get(position) || [];
      const candidateIds = new Set(candidates.map(s => s.id));
      candidateTasks = tasks.filter(task => candidateIds.has(task.segment_id));
    }

    if (!candidateTasks.length) continue;
    candidateTasks.sort((a, b) => scoreTask(b) - scoreTask(a));
    applyRemoteTask(local, candidateTasks[0]);
  }

  await persist();
}



async function bindProviderTaskAndRecover(segmentId) {
  const segment = state.draft?.segments?.find(s => s.id === segmentId);
  if (!segment) {
    toast('无法绑定', '当前工作区没有找到这个片段。');
    return;
  }

  const raw = window.prompt('粘贴 Ark Task ID（通常是 cgt- 开头）。这个功能用于 Ark 已扣费但本地没保存 task id 的情况。');
  const providerTaskId = String(raw || '').trim();
  if (!providerTaskId) return;
  if (!/^cgt[-_]/i.test(providerTaskId) && !providerTaskId.startsWith('task')) {
    const ok = await confirmBox('Task ID 格式可能不对', `你输入的是：${providerTaskId}\n通常 Ark Task 是 cgt- 开头。仍然继续查询吗？`);
    if (!ok) return;
  }

  segment.providerTaskId = providerTaskId;
  segment.status = 'recovering';
  segment.progress = Math.max(Number(segment.progress || 0), 18);
  segment.error = null;
  saveCurrentWorkspaceSelection();
  renderAll();
  await persist();

  await recoverSegmentOutput(segmentId);
}


async function recoverSegmentOutput(segmentId) {
  const segment = state.draft?.segments?.find(s => s.id === segmentId);
  if (!segment) {
    toast('无法找回', '当前工作区没有找到这个片段。');
    return;
  }
  if (!segment.remoteTaskId && !segment.providerTaskId) {
    toast('缺少 Ark Task ID', '本地没有保存 cgt-...，请点“输入Task找回”，把火山 Ark 任务记录里的 Task ID 粘贴进来。');
    return;
  }

  segment.status = segment.status || 'running';
  segment.error = null;
  renderAll();

  try {
    const payload = {
      task_id: segment.remoteTaskId || null,
      provider_task_id: segment.providerTaskId || null,
      force_recover: true,
    };
    const data = await invokeEdgeFunction('seedance-status', payload);

    const result = (data.results || []).find(item =>
      (segment.remoteTaskId && item.task_id === segment.remoteTaskId) ||
      (segment.providerTaskId && item.provider_task_id === segment.providerTaskId)
    ) || data;

    if (result.status) segment.status = result.status;
    if (result.progress !== undefined) segment.progress = Number(result.progress || segment.progress || 0);
    if (result.provider_task_id) segment.providerTaskId = result.provider_task_id;
    if (result.task_id) segment.remoteTaskId = result.task_id;
    if (result.error) segment.error = result.error;

    const recoveredVideoUrl = result.video_url || result.provider_video_url || result.output_url || result.download_url || null;

    if (recoveredVideoUrl) {
      state.outputs = state.outputs || [];
      const exists = state.outputs.some(output => output.url === recoveredVideoUrl || output.providerTaskId === segment.providerTaskId);
      if (!exists) {
        state.outputs.unshift({
          url: recoveredVideoUrl,
          storageMode: 'ark-temp-recovered',
          providerTaskId: segment.providerTaskId || result.provider_task_id,
          taskId: segment.remoteTaskId || result.task_id || null,
          segmentId: segment.id,
          index: segment.index,
          row: { created_at: new Date().toISOString(), task_id: segment.remoteTaskId || null },
        });
      }
      segment.status = 'completed';
      segment.progress = 100;
    }

    await loadOutputs();

    if (recoveredVideoUrl) {
      state.outputs = state.outputs || [];
      const existsAfterLoad = state.outputs.some(output => output.url === recoveredVideoUrl || output.providerTaskId === (segment.providerTaskId || result.provider_task_id));
      if (!existsAfterLoad) {
        state.outputs.unshift({
          url: recoveredVideoUrl,
          storageMode: 'ark-temp-recovered',
          providerTaskId: segment.providerTaskId || result.provider_task_id,
          taskId: segment.remoteTaskId || result.task_id || null,
          segmentId: segment.id,
          index: segment.index,
          row: { created_at: new Date().toISOString(), task_id: segment.remoteTaskId || null },
        });
      }
    }

    saveCurrentWorkspaceSelection();
    renderAll();

    const hasOutput = (state.outputs || []).some(output =>
      (segment.providerTaskId && output.providerTaskId === segment.providerTaskId) ||
      (segment.remoteTaskId && output.taskId === segment.remoteTaskId)
    );
    if (hasOutput) toast('已找回视频', '扣费生成的视频已经显示在右侧输出区。');
    else toast('已查询 Ark', '任务已同步；如果仍未显示，请稍等 20 秒后再点“找回视频”。');
  } catch (error) {
    segment.error = errorMessage(error);
    renderAll();
    toast('找回失败', errorMessage(error));
  } finally {
    await persist();
  }
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

  const segments = state.draft?.segments || [];
  const taskIds = segments.map(s => s.remoteTaskId).filter(Boolean);
  const segmentIds = segments.map(s => s.remoteSegmentId).filter(Boolean);
  const providerIds = new Set(segments.map(s => s.providerTaskId).filter(Boolean));
  const currentProjectId = state.draft?.remoteProjectId || null;
  const rowsById = new Map();

  if (!currentProjectId && !taskIds.length && !segmentIds.length && !providerIds.size) {
    state.outputs = [];
    return;
  }

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

  // 只查当前远程项目的输出，不再全局兜底最近 50 条，避免不同项目显示/下载同一个视频。
  if (currentProjectId) {
    await collect(
      supabase.from('video_outputs')
        .select('*')
        .eq('owner_id', state.user.id)
        .eq('project_id', currentProjectId)
        .order('created_at', { ascending: false })
        .limit(50)
    );
  }

  const rows = [...rowsById.values()];
  const bySegment = new Map();

  for (const row of rows) {
    const meta = row.metadata || {};
    const providerUrl = outputVideoUrlFromMetadata(meta);

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

    const providerTaskId = providerTaskIdFromOutputRow(row, meta);
    let segmentIndex = segments.findIndex(
      s =>
        (row.segment_id && s.remoteSegmentId === row.segment_id) ||
        (row.task_id && s.remoteTaskId === row.task_id) ||
        (providerTaskId && s.providerTaskId === providerTaskId)
    );

    // 如果数据库已经有当前项目的视频输出，但本地草稿因为回滚/刷新丢了 remoteSegmentId，
    // 单片段项目直接归到 Segment 01，避免“视频已生成但页面不显示”。
    if (segmentIndex < 0 && row.project_id && currentProjectId && row.project_id === currentProjectId && segments.length === 1) {
      segmentIndex = 0;
    }

    // 关键：不是当前项目当前片段的输出，不展示、不下载。
    if (segmentIndex < 0) continue;
    if (row.project_id && currentProjectId && row.project_id !== currentProjectId) continue;

    const segment = segments[segmentIndex];
    const output = {
      row,
      url,
      storageMode,
      providerTaskId,
      taskId: row.task_id || null,
      segmentId: segment?.id || null,
      remoteSegmentId: row.segment_id || null,
      index: segmentIndex,
      promptSnapshot: segment?.prompt || '',
    };

    // 只要 output 已经有真实视频 URL，就把本地片段状态改成完成，
    // 防止右侧一直显示“生成中/排队中”。
    if (segment && url) {
      segment.status = 'succeeded';
      segment.progress = 100;
      segment.error = null;
      if (providerTaskId) segment.providerTaskId = providerTaskId;
      if (row.task_id) segment.remoteTaskId = row.task_id;
      if (row.segment_id) segment.remoteSegmentId = row.segment_id;
    }

    const key = String(segmentIndex);
    const old = bySegment.get(key);

    // 当前输出只接受当前正在绑定的 task/provider；历史输出不抢占当前输出。
    const isCurrent =
      (segment?.providerTaskId && providerTaskId && providerTaskId === segment.providerTaskId) ||
      (segment?.remoteTaskId && row.task_id && row.task_id === segment.remoteTaskId) ||
      (!segment?.providerTaskId && !segment?.remoteTaskId);

    if (isCurrent && (!old || new Date(row.created_at || 0) > new Date(old.row.created_at || 0))) {
      bySegment.set(key, output);
    } else if (!isCurrent) {
      rememberHistoricalOutput(output, segment, '历史生成版本');
    }
  }

  state.outputs = [...bySegment.values()].sort((a,b)=>a.index-b.index);
  saveCurrentWorkspaceSelection();

  // 默认本地优先：只对当前项目当前片段的视频触发一次本地下载。
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
  if ($('reference-video-trigger')) $('reference-video-trigger').onclick = () => $('reference-video-input').click();
  if ($('reference-video-input')) $('reference-video-input').onchange = event => { addReferenceVideo(event.target.files); event.target.value=''; };
  if ($('text-mode-prompt')) $('text-mode-prompt').oninput = async event => {
    normalizeSegments(state.draft);
    const segment = state.draft.segments[0];
    if (!segment) return;
    segment.prompt = event.target.value;
    state.selectedSegmentId = segment.id;
    saveCurrentWorkspaceSelection();
    renderSummary();
    await persist();
  };

  const zone = $('upload-zone');
  ['dragenter','dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', event => addFiles(event.dataTransfer.files));

  qsa('.view-tab').forEach(btn => btn.onclick = () => setView(btn.dataset.view));
  qsa('#mode-switch button').forEach(btn => btn.onclick = async () => {
    saveCurrentWorkspaceSelection();
    state.draft.mode = btn.dataset.mode === 'first_last' ? 'first_last' : (btn.dataset.mode === 'text_only' ? 'text_only' : 'multi_frame');
    bindCurrentWorkspace();
    normalizeSegments(state.draft);
    saveCurrentWorkspaceSelection();
    renderAll();
    await persist();
    toast('已切换工作区', `${workspaceLabel()} 的图片、提示词、任务和输出独立保存。`);
  });

  $('project-name').oninput = async event => { state.draft.name = event.target.value; await persist(); };
  $('project-ratio').onchange = async event => {
    state.draft.ratio = event.target.value;
    const presets = {
      '21:9':[1920,822], '16:9':[1920,1080], '9:16':[1080,1920], '1:1':[1080,1080],
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
  if ($('segment-audio')) $('segment-audio').onchange = async event => { const s=state.draft.segments.find(x=>x.id===state.selectedSegmentId); if(s){s.generateAudio=event.target.value === 'true';renderAll();await persist();} };
  qsa('[data-prompt]').forEach(btn => btn.onclick = async () => {
    const s=state.draft.segments.find(x=>x.id===state.selectedSegmentId); if(!s)return;
    s.prompt = [s.prompt, btn.dataset.prompt].filter(Boolean).join('，');
    renderInspector(); await persist(); renderEditor();
  });

  $('preview-segment').onclick = () => {
    const s = state.draft.segments.find(x=>x.id===state.selectedSegmentId);
    if (!s) return;
    if (state.draft.mode === 'text_only') {
      toast('预检通过', `纯文字${(state.referenceAssets || []).length ? ` + ${state.referenceAssets.length} 个参考内容` : ''}；${s.duration}s；${s.model}；${s.resolution}；比例 ${state.draft.ratio}；声音${s.generateAudio ? '开' : '关'}`);
    } else {
      const from = state.draft.frames.find(f=>f.id===s.fromFrameId);
      const to = state.draft.frames.find(f=>f.id===s.toFrameId);
      toast('预检通过', `${from?.name} → ${to?.name}；${s.duration}s；${s.model}；${s.resolution}；比例 ${state.draft.ratio}；声音${s.generateAudio ? '开' : '关'}`);
    }
  };
  $('generate-segment').onclick = () => state.selectedSegmentId && generateSegments([state.selectedSegmentId]);
  $('generate-all').onclick = () => generateSegments(state.draft.segments.map(s=>s.id));
  $('refresh-jobs').onclick = refreshJobs;
  $('merge-all').onclick = mergeAll;
}

async function init() {
  if (!await initSession()) return;
  wireEvents();
  enhanceCustomSelects();
  document.body.dataset.seedanceBuild = APP_BUILD;
  state.drafts = await listDrafts();
  if (!state.drafts.length) {
    const draft = newDraft();
    await saveDraft(draft);
    state.drafts = [draft];
  }
  const lastSelectedId = localStorage.getItem(LAST_SELECTED_DRAFT_KEY);
  const initialDraft = state.drafts.find(d => d.id === lastSelectedId) || orderedDrafts()[0];
  await selectDraft(initialDraft.id);
  setView('quick');
}

init().catch(error => {
  console.error(error);
  toast('页面初始化失败', error.message || String(error));
});
