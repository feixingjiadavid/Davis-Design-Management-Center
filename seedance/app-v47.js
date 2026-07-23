const V47_BUILD = '20260723-google-drive-strict-output-v47';
const ORIGINAL_BUILD = '20260723-google-drive-only-output-v46';
const ORIGINAL_FILE = './app-v46.js';

function v47FetchVideoBlobThroughProxy(output) {
  return (async () => {
    const outputId = output?.outputId || output?.row?.id || '';
    const providerTaskId = output?.providerTaskId || '';
    const taskId = output?.taskId || '';
    const driveFileId = output?.row?.metadata?.google_drive_file_id || output?.googleDriveFileId || '';

    if (!outputId && !driveFileId && !providerTaskId && !taskId) {
      throw new Error('缺少 output_id / Google Drive file_id，无法通过代理拉取视频');
    }

    const token = await getAccessToken();
    const params = new URLSearchParams();
    if (outputId) params.set('output_id', outputId);
    if (driveFileId) params.set('google_drive_file_id', driveFileId);
    if (providerTaskId) params.set('provider_task_id', providerTaskId);
    if (taskId) params.set('task_id', taskId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let response;
    try {
      response = await fetch(`${SEEDANCE_VIDEO_PROXY_URL}?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch (error) {
      const wrapped = new Error(error?.name === 'AbortError' ? '视频代理加载超时' : errorMessage(error, '视频代理请求失败'));
      wrapped.status = 0;
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      let detail = '';
      try {
        const json = await response.json();
        detail = json.message || json.error || JSON.stringify(json);
      } catch {
        detail = await response.text().catch(() => '');
      }
      const error = new Error(detail || `视频代理返回 HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    if (!contentType.includes('video') && !contentType.includes('octet-stream')) {
      let detail = '';
      try {
        const json = await response.json();
        detail = json.message || json.error || JSON.stringify(json);
      } catch {
        detail = await response.text().catch(() => '');
      }
      const error = new Error(detail || '视频代理没有返回 MP4 文件');
      error.status = response.status;
      throw error;
    }

    const blob = await response.blob();
    if (!blob.size) {
      const error = new Error('代理返回了空视频文件');
      error.status = response.status;
      throw error;
    }
    return blob;
  })();
}

function v47HydrateProxyVideoElements() {
  return (async () => {
    const videos = qsa('video[data-output-id], video[data-provider-task-id]');
    const proxyFailureCache = hydrateProxyVideoElements.proxyFailureCache || new Map();
    const proxyInflight = hydrateProxyVideoElements.proxyInflight || new Map();
    hydrateProxyVideoElements.proxyFailureCache = proxyFailureCache;
    hydrateProxyVideoElements.proxyInflight = proxyInflight;

    for (const video of videos) {
      if (video.dataset.proxyLoading === '1' || video.dataset.proxyLoaded === '1') continue;

      const outputId = video.dataset.outputId || '';
      const googleDriveFileId = video.dataset.googleDriveFileId || '';
      const providerTaskId = video.dataset.providerTaskId || '';
      const taskId = video.dataset.taskId || '';
      const key = outputId || googleDriveFileId || providerTaskId || taskId || video.dataset.outputKey || '';
      if (!key) continue;

      const statusEl = document.querySelector(`[data-output-load-status="${CSS.escape(key)}"]`);
      const downloadEl = document.querySelector(`[data-proxy-download="${CSS.escape(key)}"]`);

      if (state.outputBlobUrls.has(key)) {
        const cachedUrl = state.outputBlobUrls.get(key);
        if (video.src !== cachedUrl) video.src = cachedUrl;
        video.dataset.proxyLoaded = '1';
        video.dataset.proxyLoading = '0';
        if (downloadEl) {
          downloadEl.href = cachedUrl;
          downloadEl.download = `seedance-${providerTaskId || taskId || Date.now()}.mp4`;
        }
        if (statusEl) statusEl.textContent = '已通过 Google Drive 代理加载，可播放/下载';
        continue;
      }

      const failed = proxyFailureCache.get(key);
      if (failed && failed.retryAt > Date.now()) {
        if (statusEl) statusEl.textContent = `暂不重试：${failed.message}`;
        video.dataset.proxyLoading = '0';
        continue;
      }

      const output = [...(state.outputs || []), ...(state.outputHistory || [])].find(o => {
        return (outputId && (o.outputId === outputId || o.row?.id === outputId)) ||
          (googleDriveFileId && o.googleDriveFileId === googleDriveFileId) ||
          (providerTaskId && o.providerTaskId === providerTaskId) ||
          (taskId && o.taskId === taskId) ||
          outputKey(o) === key;
      });
      if (!output) continue;

      video.dataset.proxyLoading = '1';
      if (statusEl) statusEl.textContent = '正在通过 Google Drive 服务端代理拉取 MP4...';

      try {
        let request = proxyInflight.get(key);
        if (!request) {
          request = fetchVideoBlobThroughProxy(output).finally(() => proxyInflight.delete(key));
          proxyInflight.set(key, request);
        }
        const blob = await request;
        let objectUrl = state.outputBlobUrls.get(key);
        if (!objectUrl) {
          objectUrl = URL.createObjectURL(blob);
          state.outputBlobs.set(key, blob);
          state.outputBlobUrls.set(key, objectUrl);
        }
        proxyFailureCache.delete(key);

        video.src = objectUrl;
        video.dataset.proxyLoaded = '1';
        video.dataset.proxyLoading = '0';
        video.load();

        if (downloadEl) {
          downloadEl.href = objectUrl;
          downloadEl.download = `seedance-${providerTaskId || taskId || Date.now()}.mp4`;
        }
        if (statusEl) statusEl.textContent = `已通过 Google Drive 代理加载：${formatBytes(blob.size)}`;
      } catch (error) {
        video.dataset.proxyLoading = '0';
        const status = Number(error?.status || 0);
        const msg = errorMessage(error, '视频代理加载失败');
        const permanentLike = [404, 410, 502].includes(status) || /OUTPUT_HAS_NO_PLAYABLE_SOURCE|VIDEO_FETCH_FAILED|GOOGLE_DRIVE_FETCH_FAILED/i.test(msg);
        const retryMs = permanentLike ? 10 * 60 * 1000 : 60 * 1000;
        proxyFailureCache.set(key, { message: msg, retryAt: Date.now() + retryMs });
        if (statusEl) statusEl.textContent = `加载失败：${msg}`;
        console.warn('[Seedance Studio v47] proxy video load failed', { key, status, error });
      }
    }
  })();
}

function v47RecoverLatestDriveOutputWhenEmpty(force = false) {
  return (async () => {
    if (state.driveFallbackLoading) return;
    if (!state.user?.id || !state.draft?.id) return;
    if ((state.outputs || []).length) return;

    const recoveryKey = `${state.draft.id}:${state.draft.mode}`;
    if (!force && state.driveFallbackDoneForDraftId === recoveryKey) return;
    state.driveFallbackDoneForDraftId = recoveryKey;
    state.driveFallbackLoading = true;

    try {
      await loadOutputs();
      if ((state.outputs || []).length) {
        renderJobs();
        setTimeout(hydrateProxyVideoElements, 0);
        toast('已恢复当前项目视频', '只从当前工作区对应的 Supabase 项目与 Google Drive 输出中恢复。');
      } else if (force) {
        toast('当前项目暂无可播放视频', '没有找到属于当前工作区且已成功保存到 Google Drive 的视频。');
      }
    } catch (error) {
      console.warn('[Seedance Studio v47] strict drive recover failed', error);
      if (force) toast('拉取失败', errorMessage(error));
    } finally {
      state.driveFallbackLoading = false;
    }
  })();
}

function v47RenderJobs() {
  if (!state.draft) return;
  keepOnlyCurrentProjectOutputs();

  const strictProjectId = state.draft.remoteProjectId || getWorkspace()?.remoteProjectId || null;
  const belongsToStrictProject = output => {
    const rowProjectId = output?.row?.project_id || output?.projectId || null;
    return !strictProjectId || !rowProjectId || rowProjectId === strictProjectId;
  };
  state.outputs = (state.outputs || []).filter(belongsToStrictProject);
  state.outputHistory = (state.outputHistory || []).filter(belongsToStrictProject);

  const segments = state.draft.segments || [];
  $('jobs-list').innerHTML = segments.length ? segments.map(s => `
    <article class="job-card">
      <div class="job-head">
        <strong>Segment ${String(s.index + 1).padStart(2, '0')}</strong>
        <span>${statusText(s.status)}</span>
      </div>
      <p>${escapeHtml(s.prompt || '未填写提示词')}</p>
      ${jobStageMarkup(s)}
      ${s.providerTaskId ? '<p class="task-id">后台任务已记录</p>' : ''}
      ${s.error ? `<p style="color:#ff8090;white-space:pre-wrap">${escapeHtml(s.error)}</p>` : ''}
      <div class="job-actions">
        <button data-sync-output="${s.id}">刷新结果</button>
        <button data-edit-from-job="${s.id}">重新编辑</button>
      </div>
    </article>`).join('') : '<div class="empty-state">暂无生成任务</div>';

  const activeMarkup = renderActiveGenerationCards();
  const visibleOutputs = currentOutputRows();
  const historyOutputs = historicalOutputRows();
  const outputMarkup = [
    activeMarkup,
    visibleOutputs.map(o => outputCardMarkup(o, false)).join(''),
    historyOutputs.length ? `<div class="history-title">当前项目历史输出</div>${historyOutputs.map(o => outputCardMarkup(o, true)).join('')}` : '',
  ].filter(Boolean).join('');
  const nextMarkup = outputMarkup || '<div class="empty-state">暂无当前项目视频输出。正在检查 Google Drive 记录...</div>';
  const outputsList = $('outputs-list');

  if (renderJobs.lastOutputMarkup !== nextMarkup || !outputsList.childNodes.length) {
    outputsList.innerHTML = nextMarkup;
    renderJobs.lastOutputMarkup = nextMarkup;
  }
  setTimeout(hydrateProxyVideoElements, 0);
  if (!outputMarkup) setTimeout(() => recoverLatestDriveOutputWhenEmpty(false), 0);

  qsa('[data-sync-output]').forEach(btn => btn.onclick = async () => {
    const segmentId = btn.dataset.syncOutput;
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '刷新中...';
    try {
      await refreshJobs();
      await recoverSegmentOutput(segmentId);
      await loadOutputs();
      saveCurrentWorkspaceSelection();
      renderAll();
    } finally {
      btn.disabled = false;
      btn.textContent = oldText || '刷新结果';
    }
  });
  qsa('[data-edit-from-job]').forEach(btn => btn.onclick = () => reEditSegment(btn.dataset.editFromJob));
  qsa('[data-edit-output-segment]').forEach(btn => btn.onclick = () => reEditSegment(btn.dataset.editOutputSegment || findSegmentIdByOutputIndex(btn.dataset.outputIndex)));
  qsa('[data-download-output]').forEach(link => link.onclick = event => {
    if (!link.href || link.getAttribute('href') === '#' || link.href.endsWith('#')) {
      event.preventDefault();
      toast('视频还没加载完成', '等右侧显示“已通过 Google Drive 代理加载：xx MB”后，再点下载到本地。');
      return;
    }
    const set = downloadedSet();
    set.add(link.dataset.downloadOutput);
    saveDownloadedSet(set);
  });
}

function v47LoadOutputs() {
  return (async () => {
    if (!state.user?.id || !state.draft) {
      state.outputs = [];
      state.outputHistory = [];
      return;
    }

    const segments = state.draft.segments || [];
    const workspace = getWorkspace();
    const providerIds = [...new Set(segments.map(s => s.providerTaskId).filter(Boolean))];
    const taskIds = [...new Set(segments.map(s => s.remoteTaskId).filter(Boolean))];
    const segmentIds = [...new Set(segments.map(s => s.remoteSegmentId).filter(Boolean))];
    const taskRowsById = new Map();

    async function collectTasks(column, values) {
      if (!values.length) return;
      const { data, error } = await supabase
        .from('video_tasks')
        .select('id, segment_id, project_id, provider_task_id, status, progress, error_message, created_at, updated_at')
        .eq('owner_id', state.user.id)
        .in(column, values)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn(`[Seedance Studio v47] video_tasks ${column} lookup failed`, error);
        return;
      }
      for (const row of data || []) taskRowsById.set(row.id, row);
    }

    await collectTasks('provider_task_id', providerIds);
    await collectTasks('id', taskIds);
    await collectTasks('segment_id', segmentIds);
    const taskRows = [...taskRowsById.values()];

    for (const task of taskRows) {
      const local = segments.find(s =>
        (task.provider_task_id && s.providerTaskId === task.provider_task_id) ||
        (task.id && s.remoteTaskId === task.id) ||
        (task.segment_id && s.remoteSegmentId === task.segment_id)
      ) || (segments.length === 1 ? segments[0] : null);
      if (!local) continue;
      if (task.provider_task_id) local.providerTaskId = task.provider_task_id;
      if (task.id) local.remoteTaskId = task.id;
      if (task.segment_id) local.remoteSegmentId = task.segment_id;
      if (task.status) local.status = task.status;
      if (task.progress !== null && task.progress !== undefined) local.progress = Number(task.progress || 0);
      local.error = task.error_message || null;
    }

    let currentProjectId = null;
    if (taskRows.length) {
      const projectScore = new Map();
      for (const task of taskRows) {
        if (!task.project_id) continue;
        let score = 1;
        if (providerIds.includes(task.provider_task_id)) score += 100;
        if (taskIds.includes(task.id)) score += 100;
        if (segmentIds.includes(task.segment_id)) score += 50;
        projectScore.set(task.project_id, (projectScore.get(task.project_id) || 0) + score);
      }
      currentProjectId = [...projectScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }

    const localProjectId = workspace.remoteProjectId || state.draft.remoteProjectId || null;
    if (!currentProjectId && localProjectId) {
      const { data: project } = await supabase
        .from('video_projects')
        .select('id, name, mode, created_at')
        .eq('owner_id', state.user.id)
        .eq('id', localProjectId)
        .maybeSingle();
      if (project && project.mode === state.draft.mode) currentProjectId = project.id;
    }

    if (!currentProjectId) {
      const { data: projects, error } = await supabase
        .from('video_projects')
        .select('id, name, mode, created_at')
        .eq('owner_id', state.user.id)
        .eq('mode', state.draft.mode)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) console.warn('[Seedance Studio v47] project recovery lookup failed', error);
      const all = projects || [];
      const sameName = all.filter(project => project.name === state.draft.name);
      const candidates = sameName.length ? sameName : all;
      const targetTime = Number(state.draft.createdAt || state.draft.updatedAt || Date.now());
      candidates.sort((a, b) => {
        const da = Math.abs((new Date(a.created_at || 0).getTime() || 0) - targetTime);
        const db = Math.abs((new Date(b.created_at || 0).getTime() || 0) - targetTime);
        return da - db;
      });
      currentProjectId = candidates[0]?.id || null;
    }

    if (!currentProjectId) {
      state.outputs = [];
      state.outputHistory = [];
      workspace.outputs = [];
      workspace.outputHistory = [];
      saveCurrentWorkspaceSelection();
      return;
    }

    workspace.remoteProjectId = currentProjectId;
    state.draft.remoteProjectId = currentProjectId;

    const { data: rows, error: outputError } = await supabase
      .from('video_outputs')
      .select('*')
      .eq('owner_id', state.user.id)
      .eq('project_id', currentProjectId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (outputError) {
      console.warn('[Seedance Studio v47] current-project output query failed', outputError);
      state.outputs = [];
      state.outputHistory = [];
      return;
    }

    const candidatesBySegment = new Map();
    const now = Date.now();

    for (const row of rows || []) {
      const meta = row.metadata || {};
      const providerTaskId = providerTaskIdFromOutputRow(row, meta);
      const googleDriveFileId = meta.google_drive_file_id || meta.googleDriveFileId || meta.drive_file_id || meta.driveFileId || null;
      const driveStatus = String(meta.google_drive_backup_status || '').toLowerCase();
      const providerUrl = outputVideoUrlFromMetadata(meta);
      const providerExpiry = Date.parse(meta.provider_video_url_expires_at || '');
      const providerStillValid = Boolean(providerUrl) && (!Number.isFinite(providerExpiry) || providerExpiry > now + 60000);

      let url = '';
      let storageMode = '';
      if (googleDriveFileId && driveStatus !== 'failed') {
        url = `seedance-proxy://${row.id || googleDriveFileId}`;
        storageMode = 'google-drive-proxy';
      } else if (providerStillValid) {
        url = `seedance-proxy://${row.id || providerTaskId}`;
        storageMode = 'ark-proxy';
      } else if (row.storage_path && row.bucket_id && row.bucket_id !== 'ark-url') {
        const signed = await supabase.storage.from(row.bucket_id).createSignedUrl(row.storage_path, 3600);
        if (!signed.error && signed.data?.signedUrl) {
          url = signed.data.signedUrl;
          storageMode = 'supabase';
        }
      }
      if (!url) continue;

      let segmentIndex = segments.findIndex(s =>
        (row.segment_id && s.remoteSegmentId === row.segment_id) ||
        (row.task_id && s.remoteTaskId === row.task_id) ||
        (providerTaskId && s.providerTaskId === providerTaskId)
      );
      if (segmentIndex < 0 && segments.length === 1) segmentIndex = 0;
      if (segmentIndex < 0) continue;

      const segment = segments[segmentIndex];
      let matchScore = 0;
      if (segment?.providerTaskId && providerTaskId === segment.providerTaskId) matchScore += 1000;
      if (segment?.remoteTaskId && row.task_id === segment.remoteTaskId) matchScore += 1000;
      if (segment?.remoteSegmentId && row.segment_id === segment.remoteSegmentId) matchScore += 500;
      if (googleDriveFileId) matchScore += 100;

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
        forceRecovered: false,
        googleDriveFileId,
        outputId: row.id || null,
        matchScore,
      };
      if (!candidatesBySegment.has(segmentIndex)) candidatesBySegment.set(segmentIndex, []);
      candidatesBySegment.get(segmentIndex).push(output);
    }

    const current = [];
    const history = [];
    for (const [segmentIndex, list] of candidatesBySegment.entries()) {
      list.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return new Date(b.row?.created_at || 0) - new Date(a.row?.created_at || 0);
      });
      const chosen = list[0];
      if (!chosen) continue;
      current.push(chosen);
      for (const old of list.slice(1)) {
        history.push({
          ...old,
          historical: true,
          historyId: `${old.outputId || old.providerTaskId || old.taskId}-v47`,
          reason: '当前项目历史生成版本',
          index: segmentIndex,
        });
      }

      const segment = segments[segmentIndex];
      if (segment) {
        segment.status = 'succeeded';
        segment.progress = 100;
        segment.error = null;
        if (chosen.providerTaskId) segment.providerTaskId = chosen.providerTaskId;
        if (chosen.taskId) segment.remoteTaskId = chosen.taskId;
        if (chosen.remoteSegmentId) segment.remoteSegmentId = chosen.remoteSegmentId;
      }
    }

    state.outputs = current.sort((a, b) => a.index - b.index);
    state.outputHistory = history
      .sort((a, b) => new Date(b.row?.created_at || 0) - new Date(a.row?.created_at || 0))
      .slice(0, 30);
    workspace.outputs = state.outputs;
    workspace.outputHistory = state.outputHistory;
    saveCurrentWorkspaceSelection();
  })();
}

function renamedFunction(fn, targetName) {
  const source = fn.toString();
  return source.replace(/^(async\s+)?function\s+[^(]+/, (_, asyncPrefix = '') => `${asyncPrefix}function ${targetName}`);
}

function replaceSection(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`v47 补丁无法定位代码区段：${startMarker} → ${endMarker}`);
  }
  return `${source.slice(0, start)}${replacement}\n\n${source.slice(end)}`;
}

export function patchV46Source(source, { supabaseUrl, dbUrl }) {
  let patched = String(source || '');
  if (!patched.includes(ORIGINAL_BUILD)) {
    throw new Error(`只支持 ${ORIGINAL_BUILD}，当前 app-v46.js 版本不匹配`);
  }

  patched = patched
    .replace("from '../supabase-config.js'", `from '${supabaseUrl}'`)
    .replace("from './db.js'", `from '${dbUrl}'`)
    .replace(ORIGINAL_BUILD, V47_BUILD);

  patched = replaceSection(
    patched,
    'async function fetchVideoBlobThroughProxy(output) {',
    'async function hydrateProxyVideoElements() {',
    renamedFunction(v47FetchVideoBlobThroughProxy, 'fetchVideoBlobThroughProxy'),
  );
  patched = replaceSection(
    patched,
    'async function hydrateProxyVideoElements() {',
    'function outputCardMarkup(',
    renamedFunction(v47HydrateProxyVideoElements, 'hydrateProxyVideoElements'),
  );
  patched = replaceSection(
    patched,
    'async function recoverLatestDriveOutputWhenEmpty(force = false) {',
    'function renderJobs() {',
    renamedFunction(v47RecoverLatestDriveOutputWhenEmpty, 'recoverLatestDriveOutputWhenEmpty'),
  );
  patched = replaceSection(
    patched,
    'function renderJobs() {',
    'function findSegmentIdByOutputIndex(',
    renamedFunction(v47RenderJobs, 'renderJobs'),
  );
  patched = replaceSection(
    patched,
    'async function loadOutputs() {',
    'function startPolling() {',
    renamedFunction(v47LoadOutputs, 'loadOutputs'),
  );

  return `${patched}\n//# sourceURL=seedance/app-v47-runtime.js\n`;
}

export async function bootV47() {
  const originalUrl = new URL(`${ORIGINAL_FILE}?v=${ORIGINAL_BUILD}`, import.meta.url);
  const supabaseUrl = new URL('../supabase-config.js', import.meta.url).href;
  const dbUrl = new URL('./db.js', import.meta.url).href;
  const response = await fetch(originalUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`读取 app-v46.js 失败：HTTP ${response.status}`);
  const source = await response.text();
  const patched = patchV46Source(source, { supabaseUrl, dbUrl });
  const blobUrl = URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }));
  try {
    await import(blobUrl);
    document.body.dataset.seedanceLoaderBuild = V47_BUILD;
    console.log('[Seedance Studio loader]', V47_BUILD);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  bootV47().catch(error => {
    console.error('[Seedance Studio v47] boot failed', error);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:20px;z-index:99999;background:#220b12;color:#fff;border:1px solid #ff6075;border-radius:14px;padding:20px;font:14px/1.6 system-ui;overflow:auto';
    box.innerHTML = `<strong>Seedance v47 启动失败</strong><br>${String(error?.message || error).replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}<br><br>请确认 seedance/app-v46.js 仍保留原文件，并且 ai-assistant.html 加载的是 seedance/app-v47.js。`;
    document.body.appendChild(box);
  });
}
