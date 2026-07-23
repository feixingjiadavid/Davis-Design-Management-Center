const PRODUCTION_BUILD = '20260723-mode-isolation-no-duplicate-r3';
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
        console.warn('[Seedance Studio R3] proxy video load failed', { key, status, error });
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
      console.warn('[Seedance Studio R3] strict drive recover failed', error);
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
        console.warn(`[Seedance Studio R3] video_tasks ${column} lookup failed`, error);
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
      if (error) console.warn('[Seedance Studio R3] project recovery lookup failed', error);
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
      console.warn('[Seedance Studio R3] current-project output query failed', outputError);
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

function r3ModeKey(mode) {
  return mode === 'first_last' ? 'first_last' : (mode === 'text_only' ? 'text_only' : 'multi_frame');
}

function r3MigrateDraftWorkspaces(draft) {
  if (!draft) return draft;
  const activeMode = r3ModeKey(draft.mode);
  const hadWorkspaces = Boolean(draft.workspaces);
  const oldFrames = Array.isArray(draft.frames) ? draft.frames : [];
  const oldSegments = Array.isArray(draft.segments) ? draft.segments : [];
  const oldRemoteProjectId = draft.remoteProjectId || null;
  const oldSelectedSegmentId = draft.selectedSegmentId || null;

  if (!draft.workspaces) {
    draft.workspaces = {
      first_last: createWorkspaceState(),
      multi_frame: createWorkspaceState(),
      text_only: createWorkspaceState(),
    };
  }

  for (const mode of ['first_last', 'multi_frame', 'text_only']) {
    if (!draft.workspaces[mode]) draft.workspaces[mode] = createWorkspaceState();
    const workspace = draft.workspaces[mode];
    if (!Array.isArray(workspace.frames)) workspace.frames = [];
    if (!Array.isArray(workspace.segments)) workspace.segments = [];
    if (!Array.isArray(workspace.outputs)) workspace.outputs = [];
    if (!Array.isArray(workspace.outputHistory)) workspace.outputHistory = [];
    if (!Array.isArray(workspace.jobs)) workspace.jobs = [];
    if (!Array.isArray(workspace.referenceAssets)) {
      workspace.referenceAssets = workspace.referenceVideo ? [workspace.referenceVideo] : [];
    }
    if (!('referenceVideo' in workspace)) workspace.referenceVideo = null;
    if (!('remoteProjectId' in workspace)) workspace.remoteProjectId = null;
  }

  const activeWorkspace = draft.workspaces[activeMode];
  if (!hadWorkspaces) {
    activeWorkspace.frames = oldFrames;
    activeWorkspace.segments = oldSegments;
    activeWorkspace.remoteProjectId = oldRemoteProjectId;
    activeWorkspace.selectedSegmentId = oldSelectedSegmentId;
  } else if (!activeWorkspace.remoteProjectId && oldRemoteProjectId) {
    // 只作为候选值保存；loadOutputs 会向 Supabase 校验项目 mode，错的会被自动换掉。
    activeWorkspace.remoteProjectId = oldRemoteProjectId;
  }

  draft.mode = activeMode;
  draft.frames = activeWorkspace.frames;
  draft.segments = activeWorkspace.segments;
  draft.remoteProjectId = activeWorkspace.remoteProjectId || null;
  draft.selectedSegmentId = activeWorkspace.selectedSegmentId || activeWorkspace.segments[0]?.id || null;
  return draft;
}

function r3BindCurrentWorkspace() {
  if (!state.draft) return;
  migrateDraftWorkspaces(state.draft);
  const mode = r3ModeKey(state.draft.mode);
  const workspace = state.draft.workspaces[mode];
  state.draft.frames = workspace.frames;
  state.draft.segments = workspace.segments;
  state.draft.remoteProjectId = workspace.remoteProjectId || null;
  state.outputs = Array.isArray(workspace.outputs) ? workspace.outputs : [];
  state.outputHistory = Array.isArray(workspace.outputHistory) ? workspace.outputHistory : [];
  state.jobs = Array.isArray(workspace.jobs) ? workspace.jobs : [];
  state.referenceAssets = Array.isArray(workspace.referenceAssets)
    ? workspace.referenceAssets
    : (workspace.referenceVideo ? [workspace.referenceVideo] : []);
  state.referenceVideo = workspace.referenceVideo || state.referenceAssets[0] || null;
  state.selectedSegmentId = workspace.selectedSegmentId || workspace.segments[0]?.id || null;
}

function r3SaveCurrentWorkspaceSelection() {
  if (!state.draft) return;
  const mode = r3ModeKey(state.draft.mode);
  if (!state.draft.workspaces) migrateDraftWorkspaces(state.draft);
  const workspace = state.draft.workspaces[mode] || createWorkspaceState();
  state.draft.workspaces[mode] = workspace;
  workspace.frames = state.draft.frames || [];
  workspace.segments = state.draft.segments || [];
  workspace.outputs = state.outputs || [];
  workspace.outputHistory = state.outputHistory || [];
  workspace.jobs = state.jobs || [];
  workspace.selectedSegmentId = state.selectedSegmentId || null;
  workspace.remoteProjectId = state.draft.remoteProjectId || workspace.remoteProjectId || null;
  if (mode === 'text_only') {
    workspace.referenceAssets = state.referenceAssets || [];
    workspace.referenceVideo = state.referenceVideo || workspace.referenceAssets[0] || null;
  }
  // 顶层字段仅作为当前工作区兼容别名，不允许反向覆盖其他模式。
  state.draft.remoteProjectId = workspace.remoteProjectId || null;
  state.draft.selectedSegmentId = workspace.selectedSegmentId;
}

async function r3ResolveCurrentProject() {
  if (!state.user?.id || !state.draft) return null;
  migrateDraftWorkspaces(state.draft);
  const mode = r3ModeKey(state.draft.mode);
  const workspace = getWorkspace(state.draft, mode);
  const localProjectIds = [...new Set([workspace.remoteProjectId, state.draft.remoteProjectId].filter(Boolean))];
  const localSegments = Array.isArray(workspace.segments) ? workspace.segments : [];
  const providerIds = [...new Set(localSegments.map(item => item.providerTaskId).filter(Boolean))];
  const taskIds = [...new Set(localSegments.map(item => item.remoteTaskId).filter(Boolean))];
  const segmentIds = [...new Set(localSegments.map(item => item.remoteSegmentId).filter(Boolean))];
  const taskProjectIds = new Set();

  async function collectTaskProjects(column, values) {
    if (!values.length) return;
    const { data, error } = await supabase
      .from('video_tasks')
      .select('project_id')
      .eq('owner_id', state.user.id)
      .in(column, values);
    if (error) {
      console.warn(`[Seedance Studio R3] task project lookup failed: ${column}`, error);
      return;
    }
    for (const row of data || []) if (row.project_id) taskProjectIds.add(row.project_id);
  }

  await collectTaskProjects('provider_task_id', providerIds);
  await collectTaskProjects('id', taskIds);
  await collectTaskProjects('segment_id', segmentIds);

  const preferredIds = [...new Set([...localProjectIds, ...taskProjectIds])];
  const projectsById = new Map();
  if (preferredIds.length) {
    const { data, error } = await supabase
      .from('video_projects')
      .select('id,name,mode,status,created_at,updated_at')
      .eq('owner_id', state.user.id)
      .in('id', preferredIds);
    if (!error) for (const project of data || []) projectsById.set(project.id, project);
  }

  const { data: modeProjects, error: modeError } = await supabase
    .from('video_projects')
    .select('id,name,mode,status,created_at,updated_at')
    .eq('owner_id', state.user.id)
    .eq('mode', mode)
    .order('created_at', { ascending: false })
    .limit(100);
  if (modeError) throw new Error(`读取 ${mode} 项目失败：${errorMessage(modeError)}`);
  for (const project of modeProjects || []) projectsById.set(project.id, project);

  const targetTime = Number(state.draft.createdAt || state.draft.updatedAt || Date.now());
  const candidates = [...projectsById.values()].filter(project => r3ModeKey(project.mode) === mode);
  let best = null;
  let bestScore = -Infinity;
  for (const project of candidates) {
    let score = 0;
    if (project.id === workspace.remoteProjectId) score += 1_000_000;
    if (project.id === state.draft.remoteProjectId) score += 500_000;
    if (taskProjectIds.has(project.id)) score += 250_000;
    if (String(project.name || '') === String(state.draft.name || '')) score += 100_000;
    const createdMs = new Date(project.created_at || 0).getTime() || 0;
    score -= Math.min(Math.abs(createdMs - targetTime) / 1000, 50_000);
    if (score > bestScore) {
      bestScore = score;
      best = project;
    }
  }

  if (!best) {
    workspace.remoteProjectId = null;
    state.draft.remoteProjectId = null;
    return null;
  }

  workspace.remoteProjectId = best.id;
  state.draft.remoteProjectId = best.id;
  return best;
}

function r3TaskScore(task, outputTaskIds, exactIds) {
  const status = String(task?.status || '').toLowerCase();
  let score = new Date(task?.created_at || 0).getTime() || 0;
  if (outputTaskIds.has(task.id)) score += 10_000_000_000_000;
  if (['succeeded', 'completed', 'success'].includes(status)) score += 1_000_000_000_000;
  if (['running', 'processing', 'queued', 'submitted', 'submitting'].includes(status)) score += 10_000_000_000;
  if (exactIds.has(task.id) || exactIds.has(task.provider_task_id) || exactIds.has(task.segment_id)) score += 1_000_000_000;
  if (['failed', 'error', 'cancelled'].includes(status)) score -= 1_000_000_000_000;
  return score;
}

async function r3SyncRemoteTasks() {
  // 单一严格入口：任务同步与输出恢复共用同一个按 mode 校验后的 project_id。
  await loadOutputs();
}

function r3LoadOutputs() {
  return (async () => {
    if (!state.user?.id || !state.draft) {
      state.outputs = [];
      state.outputHistory = [];
      return;
    }

    migrateDraftWorkspaces(state.draft);
    bindCurrentWorkspace();
    normalizeSegments(state.draft);
    const mode = r3ModeKey(state.draft.mode);
    const workspace = getWorkspace(state.draft, mode);
    const project = await r3ResolveCurrentProject();
    if (!project) {
      state.outputs = [];
      state.outputHistory = [];
      workspace.outputs = [];
      workspace.outputHistory = [];
      saveCurrentWorkspaceSelection();
      return;
    }

    const projectId = project.id;
    const [segmentResult, taskResult, outputResult] = await Promise.all([
      supabase.from('video_segments')
        .select('id,project_id,position,status,created_at,updated_at')
        .eq('owner_id', state.user.id)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.from('video_tasks')
        .select('id,segment_id,project_id,provider_task_id,status,progress,error_message,created_at,updated_at')
        .eq('owner_id', state.user.id)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.from('video_outputs')
        .select('*')
        .eq('owner_id', state.user.id)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (segmentResult.error) throw new Error(`读取当前模式片段失败：${errorMessage(segmentResult.error)}`);
    if (taskResult.error) throw new Error(`读取当前模式任务失败：${errorMessage(taskResult.error)}`);
    if (outputResult.error) throw new Error(`读取当前模式输出失败：${errorMessage(outputResult.error)}`);

    const localSegments = state.draft.segments || [];
    const remoteSegments = segmentResult.data || [];
    const tasks = taskResult.data || [];
    const rows = outputResult.data || [];
    const remotePosition = new Map(remoteSegments.map(item => [item.id, Number(item.position || 0)]));
    const remoteIdsByPosition = new Map();
    for (const item of remoteSegments) {
      const position = Number(item.position || 0);
      if (!remoteIdsByPosition.has(position)) remoteIdsByPosition.set(position, new Set());
      remoteIdsByPosition.get(position).add(item.id);
    }
    const outputTaskIds = new Set(rows.map(row => row.task_id).filter(Boolean));

    for (const local of localSegments) {
      const position = Number(local.index || 0);
      const candidateSegmentIds = remoteIdsByPosition.get(position) || new Set();
      const exactIds = new Set([local.remoteTaskId, local.providerTaskId, local.remoteSegmentId].filter(Boolean));
      const candidates = tasks.filter(task =>
        candidateSegmentIds.has(task.segment_id) ||
        exactIds.has(task.id) || exactIds.has(task.provider_task_id) || exactIds.has(task.segment_id)
      );
      candidates.sort((a, b) => r3TaskScore(b, outputTaskIds, exactIds) - r3TaskScore(a, outputTaskIds, exactIds));
      const chosenTask = candidates[0];
      if (!chosenTask) continue;
      local.remoteSegmentId = chosenTask.segment_id || local.remoteSegmentId;
      local.remoteTaskId = chosenTask.id || local.remoteTaskId;
      local.providerTaskId = chosenTask.provider_task_id || local.providerTaskId;
      local.status = chosenTask.status || local.status;
      local.progress = Number(chosenTask.progress ?? local.progress ?? 0);
      local.error = chosenTask.error_message || null;
    }

    const now = Date.now();
    const candidatesBySegment = new Map();
    for (const row of rows) {
      if (row.project_id && row.project_id !== projectId) continue;
      const meta = row.metadata || {};
      const providerTaskId = providerTaskIdFromOutputRow(row, meta);
      const googleDriveFileId = meta.google_drive_file_id || meta.googleDriveFileId || meta.drive_file_id || meta.driveFileId || null;
      const driveStatus = String(meta.google_drive_backup_status || '').toLowerCase();
      const providerUrl = outputVideoUrlFromMetadata(meta);
      const providerExpiry = Date.parse(meta.provider_video_url_expires_at || '');
      const providerStillValid = Boolean(providerUrl) && (!Number.isFinite(providerExpiry) || providerExpiry > now + 60_000);

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

      let segmentIndex = localSegments.findIndex(local =>
        (row.segment_id && local.remoteSegmentId === row.segment_id) ||
        (row.task_id && local.remoteTaskId === row.task_id) ||
        (providerTaskId && local.providerTaskId === providerTaskId)
      );
      if (segmentIndex < 0 && row.segment_id && remotePosition.has(row.segment_id)) {
        const position = remotePosition.get(row.segment_id);
        segmentIndex = localSegments.findIndex(local => Number(local.index || 0) === position);
      }
      if (segmentIndex < 0 && localSegments.length === 1) segmentIndex = 0;
      if (segmentIndex < 0) continue;

      const local = localSegments[segmentIndex];
      let matchScore = new Date(row.created_at || 0).getTime() || 0;
      if (row.task_id && local?.remoteTaskId === row.task_id) matchScore += 10_000_000_000_000;
      if (providerTaskId && local?.providerTaskId === providerTaskId) matchScore += 10_000_000_000_000;
      if (googleDriveFileId) matchScore += 1_000_000_000_000;

      const output = {
        row,
        projectId,
        url,
        storageMode,
        providerTaskId,
        taskId: row.task_id || null,
        segmentId: local?.id || null,
        remoteSegmentId: row.segment_id || null,
        index: segmentIndex,
        promptSnapshot: local?.prompt || '',
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
      list.sort((a, b) => b.matchScore - a.matchScore);
      const chosen = list[0];
      if (!chosen) continue;
      current.push(chosen);
      for (const old of list.slice(1)) {
        history.push({
          ...old,
          historical: true,
          historyId: `${old.outputId || old.providerTaskId || old.taskId}-r3`,
          reason: `${workspaceLabel(mode)}历史生成版本`,
        });
      }
      const local = localSegments[segmentIndex];
      if (local) {
        local.status = 'succeeded';
        local.progress = 100;
        local.error = null;
        if (chosen.providerTaskId) local.providerTaskId = chosen.providerTaskId;
        if (chosen.taskId) local.remoteTaskId = chosen.taskId;
        if (chosen.remoteSegmentId) local.remoteSegmentId = chosen.remoteSegmentId;
      }
    }

    state.outputs = current.sort((a, b) => a.index - b.index);
    state.outputHistory = history
      .sort((a, b) => new Date(b.row?.created_at || 0) - new Date(a.row?.created_at || 0))
      .slice(0, 50);
    workspace.remoteProjectId = projectId;
    workspace.outputs = state.outputs;
    workspace.outputHistory = state.outputHistory;
    workspace.segments = localSegments;
    state.draft.remoteProjectId = projectId;
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
    .replace(ORIGINAL_BUILD, PRODUCTION_BUILD);

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
    renamedFunction(r3LoadOutputs, 'loadOutputs'),
  );

  const r3Support = [
    r3ModeKey,
    r3ResolveCurrentProject,
    r3TaskScore,
  ].map(fn => fn.toString()).join('\n\n');

  patched = replaceSection(
    patched,
    'function migrateDraftWorkspaces(draft) {',
    'function getWorkspace(',
    `${r3Support}\n\n${renamedFunction(r3MigrateDraftWorkspaces, 'migrateDraftWorkspaces')}`,
  );
  patched = replaceSection(
    patched,
    'function bindCurrentWorkspace() {',
    'function saveCurrentWorkspaceSelection() {',
    renamedFunction(r3BindCurrentWorkspace, 'bindCurrentWorkspace'),
  );
  patched = replaceSection(
    patched,
    'function saveCurrentWorkspaceSelection() {',
    'function workspaceLabel(',
    renamedFunction(r3SaveCurrentWorkspaceSelection, 'saveCurrentWorkspaceSelection'),
  );
  patched = replaceSection(
    patched,
    'async function syncRemoteTasks() {',
    'async function bindProviderTaskAndRecover(',
    renamedFunction(r3SyncRemoteTasks, 'syncRemoteTasks'),
  );

  const originalGenerateSignature = 'async function generateSegments(segmentIds) {';
  if (!patched.includes(originalGenerateSignature)) throw new Error('无法定位 generateSegments');
  patched = patched.replace(originalGenerateSignature, 'async function generateSegments(segmentIds, options = {}) {');

  const automaticResetBlock = `  let resetCount = 0;
  segments.forEach(segment => {
    if (prepareSegmentForEditorSubmit(segment)) resetCount += 1;
  });
  if (resetCount) {
    state.outputs = (state.outputs || []).filter(isOutputCurrentForSegment);
    saveCurrentWorkspaceSelection();
    renderAll();
    await persist();
  }
`;
  const duplicateGuardBlock = `  if (!options.allowResubmit) {
    try {
      await loadOutputs();
      renderAll();
    } catch (error) {
      console.warn('[Seedance Studio R3] pre-submit strict sync failed', error);
    }
    const existingTasks = segments.filter(segment =>
      segmentHasExistingTask(segment) ||
      (state.outputs || []).some(output => Number(output.index) === Number(segment.index))
    );
    if (existingTasks.length) {
      const labels = existingTasks.map(segment => \`Segment \${Number(segment.index || 0) + 1}\`).join('、');
      return toast('已阻止重复提交', \`\${labels} 已存在任务或视频。普通生成不会再次扣费提交；需要新版本时，请先进入“重新编辑”，再明确点击重新提交。\`);
    }
  }
`;
  if (!patched.includes(automaticResetBlock)) throw new Error('无法定位自动重置任务代码');
  patched = patched.replace(automaticResetBlock, duplicateGuardBlock);

  const prepareLine = "    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; });";
  const safePrepareLine = "    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; if (options.allowResubmit) { s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; } });";
  if (!patched.includes(prepareLine)) throw new Error('无法定位提交前任务清空代码');
  patched = patched.replace(prepareLine, safePrepareLine);

  const resubmitCall = '  await generateSegments([segment.id]);';
  if (!patched.includes(resubmitCall)) throw new Error('无法定位明确重新提交入口');
  patched = patched.replace(resubmitCall, '  await generateSegments([segment.id], { allowResubmit: true });');

  return `${patched}\n//# sourceURL=seedance/app-production-runtime.js\n`;
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
    document.body.dataset.seedanceLoaderBuild = PRODUCTION_BUILD;
    console.log('[Seedance Studio loader]', PRODUCTION_BUILD);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  bootV47().catch(error => {
    console.error('[Seedance Studio R3] boot failed', error);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:20px;z-index:99999;background:#220b12;color:#fff;border:1px solid #ff6075;border-radius:14px;padding:20px;font:14px/1.6 system-ui;overflow:auto';
    box.innerHTML = `<strong>Seedance 正式修复版启动失败</strong><br>${String(error?.message || error).replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}<br><br>请确认 seedance/app-v46.js 仍保留原文件，并且 ai-assistant.html 加载的是 seedance/app.js。`;
    document.body.appendChild(box);
  });
}
