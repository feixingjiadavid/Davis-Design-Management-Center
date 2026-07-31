const PRODUCTION_BUILD = '20260731-multi-person-diagnostics-r23';
const ORIGINAL_BUILD = '20260728-blob-persistence-recovery-r8';
const ORIGINAL_FILE = './app-v46.js';

function r14NormalizeProjectName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('zh-CN');
}

function r14ProjectNameExists(name, existingNames) {
  const normalized = r14NormalizeProjectName(name);
  if (!normalized) return false;
  return (existingNames || []).some(existing => r14NormalizeProjectName(existing) === normalized);
}

function r15HasFilePayload(event) {
  const transfer = event?.dataTransfer;
  if (!transfer) return false;
  const types = Array.from(transfer.types || []);
  if (types.includes('Files')) return true;
  return Array.from(transfer.items || []).some(item => item?.kind === 'file');
}

function r15WireFileDropzone(zone, onFiles) {
  if (!zone || typeof onFiles !== 'function') return;

  const hold = event => {
    if (!r15HasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('drag');
  };
  const release = event => {
    if (!r15HasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove('drag');
  };

  zone.addEventListener('dragenter', hold);
  zone.addEventListener('dragover', hold);
  zone.addEventListener('dragleave', event => {
    if (event.relatedTarget && zone.contains(event.relatedTarget)) return;
    release(event);
  });
  zone.addEventListener('drop', event => {
    release(event);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) void onFiles(files);
  });
}

function r15PreventDocumentFileNavigation() {
  const prevent = event => {
    if (!r15HasFilePayload(event)) return;
    event.preventDefault();
  };
  document.addEventListener('dragover', prevent);
  document.addEventListener('drop', prevent);
}



function r16ProjectOwnerId(draft = state.draft) {
  if (!draft) return '';
  const mode = r5ModeKey(draft.lockedMode || draft.mode);
  const workspace = draft.workspaces?.[mode] || draft;
  return String(workspace.remoteOwnerId || draft.remoteOwnerId || draft.ownerId || '').trim();
}

function r16ScopeProjectRead(query, draft = state.draft) {
  const ownerId = r16ProjectOwnerId(draft);
  return ownerId ? query.eq('owner_id', ownerId) : scopeVideoRead(query, state.user);
}

function r16CurrentProjectWritable(draft = state.draft) {
  return canMutateVideoOwner(state.user, r16ProjectOwnerId(draft));
}

function r16AssertCurrentProjectWritable(actionLabel = '修改这个项目') {
  if (r16CurrentProjectWritable()) return true;
  toast('只读项目', `这是其他用户的项目，不能${actionLabel}。`);
  return false;
}

function r16ApplyReadOnlyControls() {
  const readOnly = Boolean(state.draft) && !r16CurrentProjectWritable();
  document.body.dataset.videoProjectReadonly = readOnly ? 'true' : 'false';
  const selectors = [
    '#delete-project',
    '#ai-optimize-text-prompt',
    '#text-mode-prompt',
    '#reference-video-input',
    '#reference-video-trigger',
    '#file-input',
    '#project-ratio',
    '#final-width',
    '#final-height',
    '#fit-mode',
    '#project-name',
    '#generate-all',
    '#editor-add-image',
    '#ai-optimize-segment-prompt',
    '#segment-prompt',
    '#segment-duration',
    '#segment-model',
    '#segment-resolution',
    '#segment-audio',
    '#segment-ratio',
    '#generate-segment',
    '#refresh-jobs',
    '#merge-all',
    '#ai-optimize-quick-segment-prompt',
    '#quick-segment-prompt',
    '#quick-segment-save',
    '[data-sync-output]',
    '[data-edit-from-job]',
    '[data-edit-output-segment]'
  ];
  document.querySelectorAll(selectors.join(',')).forEach(element => {
    if (readOnly) {
      element.dataset.videoReadonlyDisabled = '1';
      element.disabled = true;
      element.setAttribute('aria-disabled', 'true');
      element.title = '其他用户的项目仅允许查看';
    } else if (element.dataset.videoReadonlyDisabled === '1') {
      delete element.dataset.videoReadonlyDisabled;
      element.disabled = false;
      element.removeAttribute('aria-disabled');
      if (element.title === '其他用户的项目仅允许查看') element.removeAttribute('title');
    }
  });
  for (const id of ['upload-zone', 'reference-video-card']) {
    const zone = document.getElementById(id);
    if (!zone) continue;
    zone.dataset.videoReadonly = readOnly ? '1' : '0';
    zone.style.pointerEvents = readOnly ? 'none' : '';
    zone.setAttribute('aria-disabled', readOnly ? 'true' : 'false');
  }
}

function r16GuardPatchedFunction(source, functionName, actionLabel, throwOnDeny = false) {
  const expression = new RegExp(`((?:async\\s+)?function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{)`);
  if (!expression.test(source)) throw new Error(`无法定位只读守卫函数：${functionName}`);
  const denied = throwOnDeny
    ? `throw new Error('只读项目：不能${actionLabel}')`
    : 'return';
  return source.replace(expression, `$1\n  if (!r16AssertCurrentProjectWritable('${actionLabel}')) ${denied};`);
}

function r13MarkVersionForkForSubmit(segmentIds) {
  const draft = state.draft;
  if (!draft) return false;
  const requestedIds = Array.isArray(segmentIds) ? segmentIds.filter(Boolean) : [];
  const sourceSnapshot = r5Clone(draft);
  sourceSnapshot.pendingVersionFork = null;
  const segmentId = requestedIds.find(id => draft.segments?.some(segment => segment.id === id))
    || draft.segments?.[0]?.id
    || null;

  draft.pendingVersionFork = {
    sourceDraftId: draft.id,
    segmentId,
    requestedSegmentIds: requestedIds,
    requestedAt: Date.now(),
    initiatedBy: 'generate-submit',
    sourceSnapshot,
  };
  return true;
}

async function r6ExistingProjectNames() {
  if (!state.user?.id) throw new Error('用户会话已失效，无法分配新版本名称');
  const { data, error } = await supabase
    .from('video_projects')
    .select('name')
    .eq('owner_id', state.user.id)
    .limit(2000);
  if (error) throw new Error(`读取云端项目版本失败：${errorMessage(error)}`);
  return (data || []).map(row => String(row?.name || '').trim()).filter(Boolean);
}

async function r6ForkCurrentDraftForSubmit(segmentIds) {
  const source = state.draft;
  const marker = source?.pendingVersionFork;
  if (!source || !marker || marker.sourceDraftId !== source.id) return null;

  const remoteNames = await r6ExistingProjectNames();
  const localNames = (state.drafts || []).map(draft => draft?.name).filter(Boolean);
  const nextName = nextProjectVersionName(source.name, [...localNames, ...remoteNames]);
  const fork = migrateDraftWorkspaces(cloneDraftAsVersion(source, nextName, uid, Date.now()));
  const sourceRemoteProjectId = source.remoteProjectId || getWorkspace(source)?.remoteProjectId || null;
  fork.versionSourceProjectId = sourceRemoteProjectId;
  fork.versionRootProjectId = source.versionRootProjectId || sourceRemoteProjectId || null;
  const original = marker.sourceSnapshot
    ? migrateDraftWorkspaces(r5Clone(marker.sourceSnapshot))
    : source;
  original.pendingVersionFork = null;
  await saveDraft(original);
  const sourceIndex = state.drafts.findIndex(item => item.id === source.id);
  if (sourceIndex >= 0) state.drafts[sourceIndex] = original;

  await saveDraft(fork);
  state.drafts = [fork, ...state.drafts.filter(item => item.id !== fork.id)];
  state.draft = fork;
  bindCurrentWorkspace();
  normalizeSegments(state.draft);

  const requestedIds = Array.isArray(segmentIds) ? segmentIds : [];
  const selectedIds = requestedIds.filter(id => state.draft.segments.some(segment => segment.id === id));
  const fallbackId = marker.segmentId && state.draft.segments.some(segment => segment.id === marker.segmentId)
    ? marker.segmentId
    : state.draft.segments[0]?.id;
  state.selectedSegmentId = selectedIds[0] || fallbackId || null;
  saveCurrentWorkspaceSelection();
  localStorage.setItem(LAST_SELECTED_DRAFT_KEY, fork.id);
  await persist();
  renderAll();
  toast('已创建新版本', `${nextName} 已作为独立项目创建，原项目及历史视频保持不变。`);

  return {
    name: nextName,
    segmentIds: selectedIds.length ? selectedIds : (fallbackId ? [fallbackId] : []),
  };
}

async function r6ReEditSegment(segmentId) {
  if (!r16AssertCurrentProjectWritable('重新编辑或创建新版本')) return;
  if (!segmentId) {
    toast('无法定位片段', '这个输出没有找到对应片段，请在高级 Storyboard 中手动选择。');
    setView('editor');
    return;
  }
  const segment = state.draft.segments.find(item => item.id === segmentId || item.remoteTaskId === segmentId);
  if (!segment) {
    toast('无法定位片段', '当前工作区没有找到对应片段，请确认是否切换到了正确模式。');
    setView('editor');
    return;
  }

  const sourceSnapshot = r5Clone(state.draft);
  sourceSnapshot.pendingVersionFork = null;
  state.draft.pendingVersionFork = {
    sourceDraftId: state.draft.id,
    segmentId: segment.id,
    requestedAt: Date.now(),
    sourceSnapshot,
  };
  state.selectedSegmentId = segment.id;
  saveCurrentWorkspaceSelection();
  await persist();
  setView('editor');
  renderEditor();
  toast('已回到编辑页', `调整完成后提交将自动创建 ${parseProjectVersion(state.draft.name).baseName} 的下一个 V-N 独立项目。`);
}

function r5FetchVideoBlobThroughProxy(output) {
  return (async () => {
    const outputId = output?.outputId || output?.row?.id || '';
    const driveFileId = output?.row?.google_drive_file_id || output?.row?.metadata?.google_drive_file_id || output?.googleDriveFileId || '';

    if (!outputId && !driveFileId) {
      throw new Error('缺少 output_id / Google Drive file_id，无法通过代理拉取视频');
    }

    const token = await getAccessToken();
    const params = new URLSearchParams();
    if (outputId) params.set('output_id', outputId);
    if (driveFileId) params.set('google_drive_file_id', driveFileId);

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

function r5ModeKey(mode) {
  return mode === 'first_last' ? 'first_last' : (mode === 'text_only' ? 'text_only' : 'multi_frame');
}

function r5ModeLabel(mode) {
  const key = r5ModeKey(mode);
  if (key === 'first_last') return '首尾帧';
  if (key === 'text_only') return '纯文字生成';
  return '多帧 Storyboard';
}

function r5ModeSuffix(mode) {
  const key = r5ModeKey(mode);
  if (key === 'first_last') return '首尾帧';
  if (key === 'text_only') return '纯文字';
  return '多帧';
}

function r5BaseProjectName(name) {
  return String(name || '未命名 Seedance 项目')
    .replace(/\s*[－—-]\s*(首尾帧|多帧(?: Storyboard)?|纯文字(?:生成)?)\s*$/u, '')
    .trim() || '未命名 Seedance 项目';
}

function r5Clone(value) {
  try { return structuredClone(value); } catch { return value; }
}

function r5WorkspaceHasContent(workspace) {
  if (!workspace) return false;
  if (workspace.remoteProjectId) return true;
  if ((workspace.frames || []).length) return true;
  if ((workspace.outputs || []).length || (workspace.outputHistory || []).length) return true;
  if ((workspace.referenceAssets || []).length || workspace.referenceVideo) return true;
  if ((workspace.jobs || []).length) return true;
  return (workspace.segments || []).some(segment =>
    String(segment?.prompt || '').trim() ||
    segment?.providerTaskId || segment?.remoteTaskId || segment?.remoteSegmentId ||
    !['draft', ''].includes(String(segment?.status || '').toLowerCase())
  );
}

function r5CreateWorkspaceClone(workspace) {
  const next = r5Clone(workspace || {}) || {};
  if (!Array.isArray(next.frames)) next.frames = [];
  if (!Array.isArray(next.segments)) next.segments = [];
  if (!Array.isArray(next.outputs)) next.outputs = [];
  if (!Array.isArray(next.outputHistory)) next.outputHistory = [];
  if (!Array.isArray(next.jobs)) next.jobs = [];
  if (!Array.isArray(next.referenceAssets)) next.referenceAssets = next.referenceVideo ? [next.referenceVideo] : [];
  if (!('referenceVideo' in next)) next.referenceVideo = null;
  if (!('remoteProjectId' in next)) next.remoteProjectId = null;
  if (!('selectedSegmentId' in next)) next.selectedSegmentId = null;
  if (!('cloudSyncedAt' in next)) next.cloudSyncedAt = 0;
  return next;
}

function r5NewDraft(mode = 'multi_frame', name = '') {
  const key = r5ModeKey(mode);
  const id = uid();
  const workspace = createWorkspaceState();
  workspace.ownerId = state.user?.id || null;
  workspace.remoteOwnerId = null;
  const displayName = String(name || '').trim() || `未命名 ${r5ModeSuffix(key)}项目`;
  return {
    id,
    name: displayName,
    remoteProjectName: displayName,
    mode: key,
    lockedMode: key,
    projectModeLocked: true,
    singleModeVersion: 'r5',
    ratio: '16:9',
    finalWidth: 1920,
    finalHeight: 1080,
    fitMode: 'contain',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ownerId: state.user?.id || null,
    remoteOwnerId: null,
    remoteProjectId: null,
    workspaces: { [key]: workspace },
    frames: workspace.frames,
    segments: workspace.segments,
    selectedSegmentId: null,
  };
}

function r5GetWorkspace(draft = state.draft) {
  if (!draft) return createWorkspaceState();
  const key = r5ModeKey(draft.lockedMode || draft.mode);
  draft.mode = key;
  draft.lockedMode = key;
  draft.projectModeLocked = true;
  if (!draft.workspaces || typeof draft.workspaces !== 'object') draft.workspaces = {};
  if (!draft.workspaces[key]) draft.workspaces[key] = createWorkspaceState();
  const workspace = draft.workspaces[key];
  if (!Array.isArray(workspace.frames)) workspace.frames = [];
  if (!Array.isArray(workspace.segments)) workspace.segments = [];
  if (!Array.isArray(workspace.outputs)) workspace.outputs = [];
  if (!Array.isArray(workspace.outputHistory)) workspace.outputHistory = [];
  if (!Array.isArray(workspace.jobs)) workspace.jobs = [];
  if (!Array.isArray(workspace.referenceAssets)) workspace.referenceAssets = workspace.referenceVideo ? [workspace.referenceVideo] : [];
  if (!('referenceVideo' in workspace)) workspace.referenceVideo = null;
  if (!('remoteProjectId' in workspace)) workspace.remoteProjectId = null;
  if (!('cloudSyncedAt' in workspace)) workspace.cloudSyncedAt = 0;
  return workspace;
}

function r5MigrateDraftWorkspaces(draft) {
  if (!draft) return draft;
  const key = r5ModeKey(draft.lockedMode || draft.mode);
  const workspace = getWorkspace(draft);
  draft.mode = key;
  draft.lockedMode = key;
  draft.projectModeLocked = true;
  draft.singleModeVersion = 'r5';
  draft.frames = workspace.frames;
  draft.segments = workspace.segments;
  draft.remoteProjectId = workspace.remoteProjectId || draft.remoteProjectId || null;
  workspace.remoteProjectId = draft.remoteProjectId || workspace.remoteProjectId || null;
  draft.remoteOwnerId = workspace.remoteOwnerId || draft.remoteOwnerId || null;
  workspace.remoteOwnerId = draft.remoteOwnerId || workspace.remoteOwnerId || null;
  draft.ownerId = draft.remoteOwnerId || draft.ownerId || state.user?.id || null;
  workspace.ownerId = draft.ownerId;
  draft.selectedSegmentId = workspace.selectedSegmentId || draft.selectedSegmentId || workspace.segments[0]?.id || null;
  workspace.selectedSegmentId = draft.selectedSegmentId;

  const baseName = r5BaseProjectName(draft.name);
  if (baseName) draft.remoteProjectName = baseName;

  if (workspace.remoteBindingSchema !== 'r5.3') {
    workspace.bindingCandidateProjectId = workspace.remoteProjectId || draft.remoteProjectId || null;
    workspace.remoteBindingSchema = 'r5.3';
    workspace.remoteBindingLocked = false;
    workspace.remoteBindingVersion = null;
    workspace.cloudSyncedAt = 0;
    workspace.lastEmptySyncAt = 0;
  }
  return draft;
}

function r5BuildSplitDraft(source, mode, workspace, id, multiple) {
  const key = r5ModeKey(mode);
  const baseName = r5BaseProjectName(source.name);
  const active = r5CreateWorkspaceClone(workspace);
  const draft = r5Clone(source) || {};
  draft.id = id;
  draft.name = multiple ? `${baseName}－${r5ModeSuffix(key)}` : baseName;
  draft.remoteProjectName = baseName;
  draft.mode = key;
  draft.lockedMode = key;
  draft.projectModeLocked = true;
  draft.singleModeVersion = 'r5';
  draft.migrationSourceDraftId = source.id;
  draft.workspaces = { [key]: active };
  draft.frames = active.frames;
  draft.segments = active.segments;
  draft.remoteProjectId = active.remoteProjectId || null;
  draft.selectedSegmentId = active.selectedSegmentId || active.segments[0]?.id || null;
  draft.createdAt = Number(source.createdAt || Date.now());
  draft.updatedAt = Date.now();

  active.bindingCandidateProjectId = active.remoteProjectId || null;
  active.remoteBindingSchema = 'r5.3';
  active.remoteBindingLocked = false;
  active.remoteBindingVersion = null;
  active.cloudSyncedAt = 0;
  active.lastEmptySyncAt = 0;
  return draft;
}

async function r5MigrateDraftCollection(drafts) {
  const result = [];
  const seenIds = new Set();
  for (const raw of drafts || []) {
    if (!raw) continue;
    if (raw.projectModeLocked && raw.singleModeVersion === 'r5') {
      const locked = migrateDraftWorkspaces(raw);
      if (!seenIds.has(locked.id)) { result.push(locked); seenIds.add(locked.id); }
      continue;
    }

    const fallbackMode = r5ModeKey(raw.mode);
    const oldWorkspaces = raw.workspaces && typeof raw.workspaces === 'object'
      ? raw.workspaces
      : {
          [fallbackMode]: {
            frames: raw.frames || [],
            segments: raw.segments || [],
            outputs: raw.outputs || [],
            outputHistory: raw.outputHistory || [],
            referenceVideo: raw.referenceVideo || null,
            referenceAssets: raw.referenceAssets || [],
            jobs: raw.jobs || [],
            selectedSegmentId: raw.selectedSegmentId || null,
            remoteProjectId: raw.remoteProjectId || null,
          },
        };

    let modes = ['first_last', 'multi_frame', 'text_only'].filter(mode => r5WorkspaceHasContent(oldWorkspaces[mode]));
    if (!modes.length) modes = [fallbackMode];
    const multiple = modes.length > 1;
    const reuseMode = modes.includes(fallbackMode) ? fallbackMode : modes[0];

    for (const mode of modes) {
      const id = mode === reuseMode ? raw.id : uid();
      const split = r5BuildSplitDraft(raw, mode, oldWorkspaces[mode], id, multiple);
      await saveDraft(split);
      if (!seenIds.has(split.id)) { result.push(split); seenIds.add(split.id); }
    }
  }
  return result.sort((a, b) => Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0));
}

function r5BindCurrentWorkspace() {
  if (!state.draft) return;
  migrateDraftWorkspaces(state.draft);
  const workspace = getWorkspace();
  const contextKey = `${state.draft.id}:${r5ModeKey(state.draft.mode)}`;
  if (state.r5BoundContextKey !== contextKey) {
    state.r5BoundContextKey = contextKey;
    state.r5ContextEpoch = Number(state.r5ContextEpoch || 0) + 1;
    if (typeof renderJobs === 'function') {
      renderJobs.lastContextKey = null;
      renderJobs.lastOutputSignature = null;
    }
  }
  state.draft.frames = workspace.frames;
  state.draft.segments = workspace.segments;
  state.draft.remoteProjectId = workspace.remoteProjectId || null;
  state.outputs = Array.isArray(workspace.outputs) ? workspace.outputs : [];
  state.outputHistory = Array.isArray(workspace.outputHistory) ? workspace.outputHistory : [];
  state.jobs = Array.isArray(workspace.jobs) ? workspace.jobs : [];
  state.referenceAssets = Array.isArray(workspace.referenceAssets) ? workspace.referenceAssets : [];
  state.referenceVideo = workspace.referenceVideo || state.referenceAssets[0] || null;
  state.selectedSegmentId = workspace.selectedSegmentId || workspace.segments[0]?.id || null;
  state.driveFallbackDoneForDraftId = null;
}

function r5SaveCurrentWorkspaceSelection() {
  if (!state.draft) return;
  const workspace = getWorkspace();
  workspace.frames = state.draft.frames || [];
  workspace.segments = state.draft.segments || [];
  workspace.outputs = state.outputs || [];
  workspace.outputHistory = state.outputHistory || [];
  workspace.jobs = state.jobs || [];
  workspace.referenceAssets = state.referenceAssets || [];
  workspace.referenceVideo = state.referenceVideo || workspace.referenceAssets[0] || null;
  workspace.remoteProjectId = state.draft.remoteProjectId || workspace.remoteProjectId || null;
  workspace.selectedSegmentId = state.selectedSegmentId || null;
  state.draft.mode = r5ModeKey(state.draft.lockedMode || state.draft.mode);
  state.draft.lockedMode = state.draft.mode;
  state.draft.projectModeLocked = true;
  state.draft.remoteProjectId = workspace.remoteProjectId;
  state.draft.selectedSegmentId = workspace.selectedSegmentId;
}

function r5ContextSnapshot() {
  return {
    draftId: state.draft?.id || null,
    mode: r5ModeKey(state.draft?.lockedMode || state.draft?.mode),
    epoch: Number(state.r5ContextEpoch || 0),
  };
}

function r5ContextIsCurrent(snapshot) {
  return Boolean(snapshot && state.draft?.id === snapshot.draftId &&
    r5ModeKey(state.draft?.lockedMode || state.draft?.mode) === snapshot.mode &&
    Number(state.r5ContextEpoch || 0) === Number(snapshot.epoch || 0));
}

function r5ExactTaskIds(workspace) {
  const segments = workspace?.segments || [];
  return {
    providerIds: [...new Set(segments.map(s => s.providerTaskId).filter(Boolean))],
    taskIds: [...new Set(segments.map(s => s.remoteTaskId).filter(Boolean))],
    segmentIds: [...new Set(segments.map(s => s.remoteSegmentId).filter(Boolean))],
  };
}

function r53IsGenericProjectName(name) {
  const value = String(name || '').replace(/\s+/g, ' ').trim();
  return !value || /^未命名(?:\s+Seedance)?(?:\s+项目)?$/u.test(value) || value === '未命名 Seedance 项目';
}

function r53NormalizePrompt(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?;:'"“”‘’（）()\[\]{}<>《》\-—_]/g, '')
    .slice(0, 600);
}

function r53PromptOverlap(localPrompts, remotePrompts) {
  const locals = (localPrompts || []).map(r53NormalizePrompt).filter(Boolean);
  const remotes = (remotePrompts || []).map(r53NormalizePrompt).filter(Boolean);
  if (!locals.length || !remotes.length) return 0;
  let best = 0;
  for (const local of locals) {
    for (const remote of remotes) {
      if (local === remote) best = Math.max(best, 1);
      else if (local.includes(remote) || remote.includes(local)) {
        best = Math.max(best, Math.min(local.length, remote.length) / Math.max(local.length, remote.length));
      } else {
        const limit = Math.min(120, local.length, remote.length);
        let same = 0;
        for (let i = 0; i < limit; i++) if (local[i] === remote[i]) same += 1;
        best = Math.max(best, limit ? same / limit : 0);
      }
    }
  }
  return best;
}

function r53ProjectCandidateScore(project, stats, context) {
  let score = 0;
  if (context.exactProjectIds.has(project.id)) score += 1_000_000_000_000_000;
  if (context.baseName && String(project.name || '') === context.baseName) score += 10_000_000_000_000;
  if (context.existingProjectId && project.id === context.existingProjectId) score += 100_000_000_000;
  score += Number(stats.driveOutputCount || 0) * 1_000_000_000_000;
  score += Number(stats.outputCount || 0) * 10_000_000_000;
  score += Number(stats.succeededTaskCount || 0) * 1_000_000_000;
  score += Math.round(Number(stats.promptOverlap || 0) * 500_000_000);

  const localCount = Number(context.localSegmentCount || 0);
  const remoteCount = Number(stats.positionCount || 0);
  if (localCount && remoteCount) {
    score += Math.max(0, 300_000_000 - Math.abs(localCount - remoteCount) * 100_000_000);
  }

  const projectTime = new Date(project.created_at || 0).getTime() || 0;
  const localTime = Number(context.localCreatedAt || 0);
  if (projectTime && localTime) {
    score -= Math.min(Math.abs(projectTime - localTime) / 1000, 200_000_000);
  }
  return score;
}

async function r5VerifyProjectId(projectId, mode, snapshot) {
  if (!projectId || !r5ContextIsCurrent(snapshot)) return null;
  const { data, error } = await supabase.from('video_projects')
    .select('id,name,mode,owner_id,created_at,updated_at')
    .eq('owner_id', r16ProjectOwnerId())
    .eq('id', projectId)
    .maybeSingle();
  if (!r5ContextIsCurrent(snapshot)) return null;
  if (error || !data || r5ModeKey(data.mode) !== mode) return null;
  return data;
}

async function r5ResolveFixedProject(snapshot) {
  if (!state.user?.id || !state.draft || !r5ContextIsCurrent(snapshot)) return null;
  const workspace = getWorkspace();
  const mode = snapshot.mode;
  const baseName = r5BaseProjectName(state.draft.name);
  const existingProjectId = workspace.remoteProjectId || state.draft.remoteProjectId || workspace.bindingCandidateProjectId || null;

  if (workspace.remoteBindingLocked && workspace.remoteBindingVersion === 'r5.3') {
    const locked = await r5VerifyProjectId(existingProjectId, mode, snapshot);
    if (locked) return locked;
  }

  const { providerIds, taskIds, segmentIds } = r5ExactTaskIds(workspace);
  const exactProjectIds = new Set();

  async function collectExact(column, values) {
    if (!values.length || !r5ContextIsCurrent(snapshot)) return;
    const { data, error } = await supabase.from('video_tasks')
      .select('project_id')
      .eq('owner_id', r16ProjectOwnerId())
      .in(column, values);
    if (!r5ContextIsCurrent(snapshot) || error) return;
    for (const row of data || []) if (row.project_id) exactProjectIds.add(row.project_id);
  }

  await collectExact('provider_task_id', providerIds);
  await collectExact('id', taskIds);
  await collectExact('segment_id', segmentIds);
  if (!r5ContextIsCurrent(snapshot)) return null;

  const candidateMap = new Map();
  async function addProjectsByIds(ids) {
    const list = [...new Set((ids || []).filter(Boolean))];
    if (!list.length || !r5ContextIsCurrent(snapshot)) return;
    const { data, error } = await supabase.from('video_projects')
      .select('id,name,mode,owner_id,created_at,updated_at,status')
      .eq('owner_id', r16ProjectOwnerId())
      .in('id', list);
    if (!r5ContextIsCurrent(snapshot) || error) return;
    for (const project of data || []) {
      if (r5ModeKey(project.mode) === mode) candidateMap.set(project.id, project);
    }
  }

  await addProjectsByIds([...exactProjectIds, existingProjectId]);

  if (baseName) {
    const { data, error } = await supabase.from('video_projects')
      .select('id,name,mode,owner_id,created_at,updated_at,status')
      .eq('owner_id', r16ProjectOwnerId())
      .eq('mode', mode)
      .eq('name', baseName)
      .order('created_at', { ascending: false });
    if (!r5ContextIsCurrent(snapshot)) return null;
    if (!error) for (const project of data || []) candidateMap.set(project.id, project);
  }

  if (!candidateMap.size) {
    const fallbackName = String(state.draft.remoteProjectName || '').trim();
    if (fallbackName && fallbackName !== baseName) {
      const { data, error } = await supabase.from('video_projects')
        .select('id,name,mode,owner_id,created_at,updated_at,status')
        .eq('owner_id', r16ProjectOwnerId())
        .eq('mode', mode)
        .eq('name', fallbackName)
        .order('created_at', { ascending: false });
      if (!r5ContextIsCurrent(snapshot)) return null;
      if (!error) for (const project of data || []) candidateMap.set(project.id, project);
    }
  }

  const candidates = [...candidateMap.values()];
  if (!candidates.length) return null;

  const candidateIds = candidates.map(project => project.id);
  const [segmentResult, taskResult, outputResult] = await Promise.all([
    supabase.from('video_segments')
      .select('id,project_id,position,prompt,status,created_at')
      .eq('owner_id', r16ProjectOwnerId())
      .in('project_id', candidateIds),
    supabase.from('video_tasks')
      .select('id,project_id,segment_id,provider_task_id,status,created_at')
      .eq('owner_id', r16ProjectOwnerId())
      .in('project_id', candidateIds),
    supabase.from('video_outputs')
      .select('id,project_id,task_id,segment_id,metadata,google_drive_file_id,google_drive_url,google_drive_thumbnail_url,storage_status,status,created_at')
      .eq('owner_id', r16ProjectOwnerId())
      .in('project_id', candidateIds),
  ]);
  if (!r5ContextIsCurrent(snapshot)) return null;

  const remoteSegments = segmentResult.error ? [] : (segmentResult.data || []);
  const remoteTasks = taskResult.error ? [] : (taskResult.data || []);
  const remoteOutputs = outputResult.error ? [] : (outputResult.data || []);
  const localPrompts = (workspace.segments || []).map(segment => segment.prompt).filter(Boolean);
  const context = {
    exactProjectIds,
    baseName,
    existingProjectId,
    localCreatedAt: Number(state.draft.createdAt || 0),
    localSegmentCount: (workspace.segments || []).length,
  };

  const scored = candidates.map(project => {
    const projectSegments = remoteSegments.filter(row => row.project_id === project.id);
    const projectTasks = remoteTasks.filter(row => row.project_id === project.id);
    const projectOutputs = remoteOutputs.filter(row => row.project_id === project.id);
    const driveOutputCount = projectOutputs.filter(row => {
      const meta = row.metadata || {};
      const driveId = meta.google_drive_file_id || meta.googleDriveFileId || meta.drive_file_id || meta.driveFileId;
      const status = String(meta.google_drive_backup_status || '').toLowerCase();
      return Boolean(driveId) && status !== 'failed';
    }).length;
    const stats = {
      outputCount: projectOutputs.length,
      driveOutputCount,
      succeededTaskCount: projectTasks.filter(row => ['succeeded','completed','success'].includes(String(row.status || '').toLowerCase())).length,
      positionCount: new Set(projectSegments.map(row => Number(row.position || 0))).size,
      promptOverlap: r53PromptOverlap(localPrompts, projectSegments.map(row => row.prompt)),
    };
    return { project, stats, score: r53ProjectCandidateScore(project, stats, context) };
  }).sort((a, b) => b.score - a.score);

  let selected = scored[0] || null;
  const second = scored[1] || null;
  if (selected && second && !exactProjectIds.has(selected.project.id)) {
    const decisive =
      selected.project.name === baseName && second.project.name !== baseName ||
      selected.stats.driveOutputCount !== second.stats.driveOutputCount ||
      selected.stats.outputCount !== second.stats.outputCount ||
      selected.stats.succeededTaskCount !== second.stats.succeededTaskCount ||
      selected.stats.positionCount !== second.stats.positionCount ||
      Math.abs(selected.score - second.score) > 50_000_000;
    if (!decisive) selected = null;
  }
  if (!selected) return null;

  const project = selected.project;
  const changed = workspace.remoteProjectId !== project.id ||
    workspace.remoteBindingVersion !== 'r5.3' ||
    !workspace.remoteBindingLocked;

  workspace.remoteProjectId = project.id;
  workspace.bindingCandidateProjectId = project.id;
  workspace.remoteBindingSchema = 'r5.3';
  workspace.remoteBindingVersion = 'r5.3';
  workspace.remoteBindingLocked = true;
  workspace.cloudSyncedAt = 0;
  workspace.lastEmptySyncAt = 0;
  state.draft.remoteProjectId = project.id;
  state.draft.remoteOwnerId = project.owner_id || r16ProjectOwnerId();
  state.draft.ownerId = state.draft.remoteOwnerId || state.draft.ownerId;
  state.draft.remoteProjectName = project.name || baseName || state.draft.remoteProjectName;

  if (changed) await saveDraft(state.draft);
  return project;
}

function r5TaskScore(task, outputTaskIds, exactIds) {
  const status = String(task?.status || '').toLowerCase();
  let score = new Date(task?.created_at || 0).getTime() || 0;
  if (outputTaskIds.has(task.id)) score += 10_000_000_000_000;
  if (['succeeded','completed','success'].includes(status)) score += 1_000_000_000_000;
  if (exactIds.has(task.id) || exactIds.has(task.provider_task_id) || exactIds.has(task.segment_id)) score += 100_000_000_000;
  if (['running','processing','queued','submitted','submitting'].includes(status)) score += 10_000_000_000;
  if (['failed','error','cancelled'].includes(status)) score -= 1_000_000_000_000;
  return score;
}

function r5OutputStableKey(output) {
  return String(output?.outputId || output?.row?.id || output?.googleDriveFileId || output?.providerTaskId || output?.taskId || '');
}

function r5CacheRequestUrl(key) {
  return `https://seedance-cache.local/video/${encodeURIComponent(String(key || ''))}`;
}

async function r5ReadPersistentVideo(key) {
  if (!key || !('caches' in globalThis)) return null;
  try {
    const cache = await caches.open('seedance-video-cache-r5');
    const response = await cache.match(r5CacheRequestUrl(key));
    if (!response) return null;
    const blob = await response.blob();
    return blob?.size ? blob : null;
  } catch (error) {
    console.warn('[Davis Video Studio R5] read persistent video cache failed', error);
    return null;
  }
}

async function r5PrunePersistentVideoCache(cache, keep = 36) {
  try {
    const requests = await cache.keys();
    if (requests.length <= keep) return;
    const items = [];
    for (const request of requests) {
      const response = await cache.match(request);
      items.push({ request, at: Number(response?.headers?.get('x-seedance-cached-at') || 0) });
    }
    items.sort((a, b) => a.at - b.at);
    for (const item of items.slice(0, Math.max(0, items.length - keep))) await cache.delete(item.request);
  } catch {}
}

async function r5WritePersistentVideo(key, blob) {
  if (!key || !blob?.size || !('caches' in globalThis)) return;
  try {
    const cache = await caches.open('seedance-video-cache-r5');
    await cache.put(r5CacheRequestUrl(key), new Response(blob, {
      headers: {
        'content-type': blob.type || 'video/mp4',
        'x-seedance-cached-at': String(Date.now()),
      },
    }));
    await r5PrunePersistentVideoCache(cache, 36);
  } catch (error) {
    console.warn('[Davis Video Studio R5] write persistent video cache failed', error);
  }
}

function r5HydrateProxyVideoElements() {
  return (async () => {
    const videos = qsa('video[data-output-id], video[data-provider-task-id]');
    const inflight = hydrateProxyVideoElements.inflight || new Map();
    const failures = hydrateProxyVideoElements.failures || new Map();
    hydrateProxyVideoElements.inflight = inflight;
    hydrateProxyVideoElements.failures = failures;

    for (const video of videos) {
      if (video.dataset.proxyLoading === '1' || video.dataset.proxyLoaded === '1') continue;
      const outputId = video.dataset.outputId || '';
      const driveFileId = video.dataset.googleDriveFileId || '';
      const providerTaskId = video.dataset.providerTaskId || '';
      const taskId = video.dataset.taskId || '';
      const key = outputId || driveFileId || providerTaskId || taskId || video.dataset.outputKey || '';
      if (!key) continue;
      const statusEl = document.querySelector(`[data-output-load-status="${CSS.escape(key)}"]`);
      const downloadEl = document.querySelector(`[data-proxy-download="${CSS.escape(key)}"]`);

      let blob = state.outputBlobs.get(key) || null;
      let objectUrl = state.outputBlobUrls.get(key) || null;
      if (!blob && !objectUrl) {
        blob = await r5ReadPersistentVideo(key);
        if (blob) {
          state.outputBlobs.set(key, blob);
          objectUrl = URL.createObjectURL(blob);
          state.outputBlobUrls.set(key, objectUrl);
        }
      }
      if (objectUrl) {
        if (video.src !== objectUrl) video.src = objectUrl;
        video.dataset.proxyLoaded = '1';
        if (downloadEl) { downloadEl.href = objectUrl; downloadEl.download = `seedance-${providerTaskId || taskId || key}.mp4`; }
        if (statusEl) statusEl.textContent = blob ? `已从浏览器视频缓存加载：${formatBytes(blob.size)}` : '已从浏览器视频缓存加载';
        continue;
      }

      const failed = failures.get(key);
      if (failed && failed.retryAt > Date.now()) {
        if (statusEl) statusEl.textContent = `暂不重复拉取：${failed.message}`;
        continue;
      }

      const output = [...(state.outputs || []), ...(state.outputHistory || [])].find(item => r5OutputStableKey(item) === key ||
        (outputId && item.outputId === outputId) || (driveFileId && item.googleDriveFileId === driveFileId) ||
        (providerTaskId && item.providerTaskId === providerTaskId) || (taskId && item.taskId === taskId));
      if (!output) continue;

      video.dataset.proxyLoading = '1';
      if (statusEl) statusEl.textContent = '首次读取 Google Drive 视频并写入浏览器缓存...';
      try {
        let request = inflight.get(key);
        if (!request) {
          request = fetchVideoBlobThroughProxy(output).finally(() => inflight.delete(key));
          inflight.set(key, request);
        }
        blob = await request;
        objectUrl = URL.createObjectURL(blob);
        state.outputBlobs.set(key, blob);
        state.outputBlobUrls.set(key, objectUrl);
        await r5WritePersistentVideo(key, blob);
        failures.delete(key);
        video.src = objectUrl;
        video.dataset.proxyLoaded = '1';
        video.dataset.proxyLoading = '0';
        video.load();
        if (downloadEl) { downloadEl.href = objectUrl; downloadEl.download = `seedance-${providerTaskId || taskId || key}.mp4`; }
        if (statusEl) statusEl.textContent = `已缓存到浏览器：${formatBytes(blob.size)}，切换项目无需重新拉取`;
      } catch (error) {
        video.dataset.proxyLoading = '0';
        const status = Number(error?.status || 0);
        const message = errorMessage(error, '视频加载失败');
        failures.set(key, { message, retryAt: Date.now() + ([404,410,502].includes(status) ? 10 * 60_000 : 60_000) });
        if (statusEl) statusEl.textContent = `加载失败：${message}`;
      }
    }
  })();
}

function r5LoadOutputs(force = false) {
  return (async () => {
    if (!state.user?.id || !state.draft) return;
    migrateDraftWorkspaces(state.draft);
    normalizeSegments(state.draft);
    const snapshot = r5ContextSnapshot();
    const workspace = getWorkspace();
    const nowMs = Date.now();
    const ttl = 5 * 60_000;

    if (!force &&
        workspace.remoteBindingLocked &&
        workspace.remoteBindingVersion === 'r5.3' &&
        (workspace.outputs || []).length &&
        nowMs - Number(workspace.cloudSyncedAt || 0) < ttl) {
      state.outputs = workspace.outputs || [];
      state.outputHistory = workspace.outputHistory || [];
      return;
    }

    if (!force &&
        workspace.remoteBindingLocked &&
        !(workspace.outputs || []).length &&
        nowMs - Number(workspace.lastEmptySyncAt || 0) < 30_000) {
      state.outputs = workspace.outputs || [];
      state.outputHistory = workspace.outputHistory || [];
      return;
    }

    state.r5LoadSeq = Number(state.r5LoadSeq || 0) + 1;
    const seq = state.r5LoadSeq;
    const current = () => r5ContextIsCurrent(snapshot) && Number(state.r5LoadSeq || 0) === seq;
    const project = await r5ResolveFixedProject(snapshot);
    if (!current()) return;

    if (!project) {
      workspace.lastEmptySyncAt = Date.now();
      state.outputs = workspace.outputs || [];
      state.outputHistory = workspace.outputHistory || [];
      saveCurrentWorkspaceSelection();
      await saveDraft(state.draft);
      return;
    }

    workspace.remoteProjectId = project.id;
    workspace.remoteOwnerId = project.owner_id || r16ProjectOwnerId();
    workspace.remoteBindingSchema = 'r5.3';
    workspace.remoteBindingVersion = 'r5.3';
    workspace.remoteBindingLocked = true;
    state.draft.remoteProjectId = project.id;
    state.draft.remoteOwnerId = project.owner_id || r16ProjectOwnerId();
    state.draft.ownerId = state.draft.remoteOwnerId || state.draft.ownerId;
    const projectId = project.id;

    const [segmentResult, taskResult, outputResult] = await Promise.all([
      supabase.from('video_segments')
        .select('id,project_id,position,prompt,model_alias,duration,resolution,ratio,status,mode,generate_audio,created_at,updated_at')
        .eq('owner_id', r16ProjectOwnerId())
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.from('video_tasks')
        .select('id,segment_id,project_id,provider_task_id,status,progress,error_message,model_alias,provider_response,request_payload,created_at,updated_at')
        .eq('owner_id', r16ProjectOwnerId())
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.from('video_outputs')
        .select('*')
        .eq('owner_id', r16ProjectOwnerId())
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (!current()) return;
    if (segmentResult.error) throw new Error(`读取项目片段失败：${errorMessage(segmentResult.error)}`);
    if (taskResult.error) throw new Error(`读取项目任务失败：${errorMessage(taskResult.error)}`);
    if (outputResult.error) throw new Error(`读取项目视频失败：${errorMessage(outputResult.error)}`);

    const remoteSegments = segmentResult.data || [];
    const tasks = taskResult.data || [];
    const rows = outputResult.data || [];
    const originalLocalSegments = Array.isArray(state.draft.segments) ? state.draft.segments : [];
    const outputTaskIds = new Set(rows.map(row => row.task_id).filter(Boolean));

    const remoteByPosition = new Map();
    const positionByRemoteSegment = new Map();
    for (const remote of remoteSegments) {
      const position = Number(remote.position || 0);
      positionByRemoteSegment.set(remote.id, position);
      if (!remoteByPosition.has(position)) remoteByPosition.set(position, []);
      remoteByPosition.get(position).push(remote);
    }

    const tasksByPosition = new Map();
    for (const task of tasks) {
      const position = positionByRemoteSegment.has(task.segment_id)
        ? positionByRemoteSegment.get(task.segment_id)
        : 0;
      if (!tasksByPosition.has(position)) tasksByPosition.set(position, []);
      tasksByPosition.get(position).push(task);
    }

    const localByPosition = new Map(originalLocalSegments.map(segment => [Number(segment.index || 0), segment]));
    const positions = [...new Set([
      ...remoteByPosition.keys(),
      ...localByPosition.keys(),
    ])].sort((a, b) => a - b);

    const chosenTaskByPosition = new Map();
    const rebuiltSegments = [];

    for (const position of positions) {
      const existing = localByPosition.get(position) || null;
      const exact = new Set([
        existing?.remoteTaskId,
        existing?.providerTaskId,
        existing?.remoteSegmentId,
      ].filter(Boolean));
      const taskCandidates = [...(tasksByPosition.get(position) || [])]
        .sort((a, b) => r5TaskScore(b, outputTaskIds, exact) - r5TaskScore(a, outputTaskIds, exact));
      const chosenTask = taskCandidates[0] || null;
      if (chosenTask) chosenTaskByPosition.set(position, chosenTask);

      const segmentCandidates = remoteByPosition.get(position) || [];
      const representative = segmentCandidates.find(row => row.id === chosenTask?.segment_id) ||
        segmentCandidates.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] ||
        null;

      const segment = {
        ...(existing || {}),
        id: existing?.id || uid(),
        fromFrameId: existing?.fromFrameId || null,
        toFrameId: existing?.toFrameId || null,
        prompt: String(existing?.prompt || '').trim() ? existing.prompt : (representative?.prompt || ''),
        duration: Number(existing?.duration || representative?.duration || 4),
        model: existing?.model || representative?.model_alias || chosenTask?.model_alias || 'mini',
        resolution: existing?.resolution || representative?.resolution || '720p',
        status: chosenTask?.status || representative?.status || existing?.status || 'draft',
        progress: Number(chosenTask?.progress ?? existing?.progress ?? (
          ['succeeded','completed','success'].includes(String(chosenTask?.status || representative?.status || '').toLowerCase()) ? 100 : 0
        )),
        providerTaskId: chosenTask?.provider_task_id || existing?.providerTaskId || null,
        remoteSegmentId: chosenTask?.segment_id || representative?.id || existing?.remoteSegmentId || null,
        remoteTaskId: chosenTask?.id || existing?.remoteTaskId || null,
        outputPath: existing?.outputPath || null,
        outputUrl: existing?.outputUrl || null,
        error: chosenTask?.error_message || existing?.error || null,
        index: position,
        mode: snapshot.mode,
        generateAudio: Boolean(existing?.generateAudio ?? representative?.generate_audio),
        referenceAssetId: existing?.referenceAssetId || null,
        referenceAssetIds: existing?.referenceAssetIds || [],
        previousTaskIds: existing?.previousTaskIds || [],
      };
      const publicState = r18PublicSegmentState(chosenTask, rows);
      if (publicState) {
        segment.status = publicState.status;
        segment.progress = publicState.progress;
        segment.error = publicState.error;
      }
      rebuiltSegments.push(segment);
    }

    if (!rebuiltSegments.length && snapshot.mode === 'text_only') {
      rebuiltSegments.push({
        id: uid(),
        fromFrameId: null,
        toFrameId: null,
        prompt: '',
        duration: 4,
        model: 'mini',
        resolution: '720p',
        status: 'draft',
        progress: 0,
        providerTaskId: null,
        remoteSegmentId: null,
        remoteTaskId: null,
        outputPath: null,
        outputUrl: null,
        error: null,
        index: 0,
        mode: 'text_only',
        generateAudio: false,
        referenceAssetId: null,
        referenceAssetIds: [],
      });
    }

    state.draft.segments = rebuiltSegments;
    workspace.segments = rebuiltSegments;
    if (!rebuiltSegments.some(segment => segment.id === state.selectedSegmentId)) {
      state.selectedSegmentId = rebuiltSegments[0]?.id || null;
    }
    workspace.selectedSegmentId = state.selectedSegmentId;

    const bySegment = new Map();

    for (const row of rows) {
      if (row.project_id !== projectId) continue;
      const meta = row.metadata || {};
      const providerTaskId = providerTaskIdFromOutputRow(row, meta);
      const googleDriveFileId = row.google_drive_file_id || meta.google_drive_file_id || meta.googleDriveFileId || meta.drive_file_id || meta.driveFileId || null;
      const driveStatus = String(row.storage_status || row.status || meta.google_drive_backup_status || '').toLowerCase();

      let url = '';
      let storageMode = '';
      if (googleDriveFileId && driveStatus === 'completed') {
        url = `seedance-proxy://${row.id || googleDriveFileId}`;
        storageMode = 'google-drive-proxy';
      }
      if (!url) continue;

      let position = row.segment_id && positionByRemoteSegment.has(row.segment_id)
        ? positionByRemoteSegment.get(row.segment_id)
        : null;
      if (position == null && row.task_id) {
        const task = tasks.find(item => item.id === row.task_id);
        if (task?.segment_id && positionByRemoteSegment.has(task.segment_id)) {
          position = positionByRemoteSegment.get(task.segment_id);
        }
      }
      if (position == null && rebuiltSegments.length === 1) position = 0;
      const local = rebuiltSegments.find(segment => Number(segment.index || 0) === Number(position));
      if (!local) continue;

      const chosenTask = chosenTaskByPosition.get(Number(position));
      let score = new Date(row.created_at || 0).getTime() || 0;
      if (googleDriveFileId && driveStatus === 'completed') score += 1_000_000_000_000;
      if (row.task_id && chosenTask?.id === row.task_id) score += 10_000_000_000_000;
      if (providerTaskId && chosenTask?.provider_task_id === providerTaskId) score += 10_000_000_000_000;

      const output = {
        row,
        projectId,
        mode: snapshot.mode,
        url,
        storageMode,
        providerTaskId,
        taskId: row.task_id || null,
        segmentId: local.id,
        remoteSegmentId: row.segment_id || null,
        index: Number(position || 0),
        promptSnapshot: local.prompt || '',
        googleDriveFileId,
        outputId: row.id || null,
        matchScore: score,
      };
      if (!bySegment.has(output.index)) bySegment.set(output.index, []);
      bySegment.get(output.index).push(output);
    }

    const outputs = [];
    const history = [];
    for (const [position, list] of bySegment.entries()) {
      list.sort((a, b) => b.matchScore - a.matchScore);
      const chosen = list[0];
      if (!chosen) continue;
      outputs.push(chosen);
      history.push(...list.slice(1).map(old => ({
        ...old,
        historical: true,
        reason: '当前独立项目历史版本',
        historyId: `${r5OutputStableKey(old)}-r5-3`,
      })));

      const local = rebuiltSegments.find(segment => Number(segment.index || 0) === Number(position));
      if (local) {
        local.status = 'succeeded';
        local.progress = 100;
        local.error = null;
        local.providerTaskId = chosen.providerTaskId || local.providerTaskId;
        local.remoteTaskId = chosen.taskId || local.remoteTaskId;
        local.remoteSegmentId = chosen.remoteSegmentId || local.remoteSegmentId;
      }
    }

    if (!current()) return;
    state.outputs = outputs.sort((a, b) => a.index - b.index);
    state.outputHistory = history
      .sort((a, b) => new Date(b.row?.created_at || 0) - new Date(a.row?.created_at || 0))
      .slice(0, 50);

    workspace.outputs = state.outputs;
    workspace.outputHistory = state.outputHistory;
    workspace.segments = rebuiltSegments;
    workspace.remoteProjectId = projectId;
    workspace.remoteBindingSchema = 'r5.3';
    workspace.remoteBindingVersion = 'r5.3';
    workspace.remoteBindingLocked = true;
    workspace.cloudSyncedAt = Date.now();
    workspace.lastEmptySyncAt = state.outputs.length ? 0 : Date.now();
    state.draft.remoteProjectId = projectId;
    saveCurrentWorkspaceSelection();
    await saveDraft(state.draft);
  })();
}

async function r5RefreshJobs() {
  try { await loadOutputs(true); } catch (error) { console.warn('[Davis Video Studio R5] refresh failed', error); }
  renderJobs();
}

async function r5SyncRemoteTasks() {
  await loadOutputs(true);
}

function r5RecoverLatestDriveOutputWhenEmpty(force = false) {
  return (async () => {
    if (!state.draft) return;
    try {
      await loadOutputs(Boolean(force));
      renderJobs();
      if (force) toast((state.outputs || []).length ? '已刷新当前项目' : '当前项目暂无视频',
        (state.outputs || []).length ? '已按固定项目 ID 恢复并使用浏览器视频缓存。' : '没有找到属于这个独立项目的 Google Drive 视频。');
    } catch (error) { if (force) toast('刷新失败', errorMessage(error)); }
  })();
}

function r5RenderJobs() {
  if (!state.draft) return;
  const projectId = state.draft.remoteProjectId || getWorkspace().remoteProjectId || '';
  const mode = r5ModeKey(state.draft.mode);
  const contextKey = `${state.draft.id}:${mode}:${projectId}`;
  const belongs = output => (!output?.projectId || !projectId || output.projectId === projectId) && (!output?.mode || r5ModeKey(output.mode) === mode);
  state.outputs = (state.outputs || []).filter(belongs);
  state.outputHistory = (state.outputHistory || []).filter(belongs);

  const segments = state.draft.segments || [];
  $('jobs-list').innerHTML = segments.length ? segments.map(s => `
    <article class="job-card"><div class="job-head"><strong>Segment ${String(s.index + 1).padStart(2, '0')}</strong><span>${statusText(s.status)}</span></div>
    <p>${escapeHtml(s.prompt || '未填写提示词')}</p>${jobStageMarkup(s)}
    ${s.providerTaskId ? '<p class="task-id">后台任务已记录</p>' : ''}
    ${s.error ? `<p style="color:#ff8090;white-space:pre-wrap">${escapeHtml(s.error)}</p>` : ''}
    <div class="job-actions"><button data-sync-output="${s.id}">刷新结果</button><button data-edit-from-job="${s.id}">重新编辑</button></div></article>`).join('') : '<div class="empty-state">暂无生成任务</div>';

  const activeMarkup = renderActiveGenerationCards();
  const visible = currentOutputRows();
  const history = historicalOutputRows();
  const markup = [activeMarkup, visible.map(o => outputCardMarkup(o, false)).join(''),
    history.length ? `<div class="history-title">当前独立项目历史输出</div>${history.map(o => outputCardMarkup(o, true)).join('')}` : ''].filter(Boolean).join('');
  const next = markup || '<div class="empty-state">当前独立项目暂无视频。点击“刷新状态”只会查询这个项目，不会搜索或展示其他项目。</div>';
  const signature = [...visible, ...history].map(r5OutputStableKey).join('|') + `:${segments.map(s => `${s.id}-${s.status}-${s.progress}`).join('|')}`;
  const list = $('outputs-list');
  if (renderJobs.lastContextKey !== contextKey || renderJobs.lastOutputSignature !== signature || !list.childNodes.length) {
    list.innerHTML = next;
    renderJobs.lastContextKey = contextKey;
    renderJobs.lastOutputSignature = signature;
  }
  setTimeout(hydrateProxyVideoElements, 0);

  qsa('[data-sync-output]').forEach(btn => btn.onclick = async () => {
    btn.disabled = true; const old = btn.textContent; btn.textContent = '刷新中...';
    try { await refreshJobs(true); renderAll(); } finally { btn.disabled = false; btn.textContent = old || '刷新结果'; }
  });
  qsa('[data-edit-from-job]').forEach(btn => btn.onclick = () => reEditSegment(btn.dataset.editFromJob));
  qsa('[data-edit-output-segment]').forEach(btn => btn.onclick = () => reEditSegment(btn.dataset.editOutputSegment || findSegmentIdByOutputIndex(btn.dataset.outputIndex)));
  qsa('[data-download-output]').forEach(link => link.onclick = event => {
    if (!link.href || link.getAttribute('href') === '#' || link.href.endsWith('#')) { event.preventDefault(); toast('视频还没加载完成', '首次读取完成后会自动写入浏览器缓存。'); }
  });
  setTimeout(r16ApplyReadOnlyControls, 0);
}

function r5RenderProjects() {
  const list = orderedDrafts();
  $('project-list').innerHTML = list.length ? list.map(d => {
    const mode = r5ModeKey(d.lockedMode || d.mode);
    const workspace = d.workspaces?.[mode] || d;
    const count = mode === 'text_only' ? '纯文字' : `${workspace.frames?.length || d.frames?.length || 0} 张图`;
    const readOnly = isVideoSuperAdmin(state.user) && isForeignVideoOwner(state.user, r16ProjectOwnerId(d));
    return `<button class="project-item ${state.draft?.id === d.id ? 'active' : ''}" data-project="${d.id}">
      <strong>${escapeHtml(d.name)}</strong>
      <span><b class="project-mode-tag">${escapeHtml(r5ModeLabel(mode))}</b>${readOnly ? ' · 只读' : ''} · ${count} · ${new Date(d.createdAt || d.updatedAt || Date.now()).toLocaleString('zh-CN')}</span>
    </button>`;
  }).join('') : '<div class="empty-state">还没有视频项目，请点击“新建视频项目”并选择模式。</div>';
  qsa('[data-project]').forEach(btn => btn.onclick = () => selectDraft(btn.dataset.project));
}

function r5RenderSettings() {
  $('project-name').value = state.draft.name;
  $('project-ratio').value = state.draft.ratio;
  $('final-width').value = state.draft.finalWidth;
  $('final-height').value = state.draft.finalHeight;
  $('fit-mode').value = state.draft.fitMode;
  const label = $('locked-mode-label');
  if (label) label.textContent = r5ModeLabel(state.draft.mode);
  const card = $('mode-lock-card');
  if (card) card.dataset.mode = r5ModeKey(state.draft.mode);
  updateRatioTip();
  renderTextModePanel();
  syncCustomSelects();
}

function r5SetView(view) {
  state.currentView = view;
  qsa('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  qsa('.view-tab').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  if (view === 'jobs' && state.draft) {
    const workspace = getWorkspace();
    state.outputs = workspace.outputs || state.outputs || [];
    state.outputHistory = workspace.outputHistory || state.outputHistory || [];
    renderJobs();
    if (!state.isGenerating && (!Number(workspace.cloudSyncedAt || 0) || Date.now() - Number(workspace.cloudSyncedAt || 0) > 5 * 60_000)) {
      loadOutputs(false).then(() => renderJobs()).catch(error => console.warn('[Davis Video Studio R5] background sync failed', error));
    }
  }
}

function r5OpenCreateModal() {
  const modal = $('project-mode-modal');
  if (!modal) return;
  const input = $('new-project-name');
  if (input) input.value = '';
  const cancel = $('project-mode-cancel');
  if (cancel) cancel.hidden = !(state.drafts || []).length;
  modal.hidden = false;
  setTimeout(() => input?.focus(), 0);
}

function r5CloseCreateModal() {
  if ($('project-mode-modal')) $('project-mode-modal').hidden = true;
}

async function r5CreateProjectFromMode(mode) {
  const key = r5ModeKey(mode);
  const inputName = String($('new-project-name')?.value || '').trim();
  const displayName = inputName || `未命名 ${r5ModeSuffix(key)}项目`;

  let remoteNames;
  try {
    remoteNames = await r6ExistingProjectNames();
  } catch (error) {
    toast('无法校验项目名称', errorMessage(error, '读取云端项目名称失败，请检查网络后重试'));
    return;
  }

  const localNames = (state.drafts || []).map(draft => draft?.name).filter(Boolean);
  if (r14ProjectNameExists(displayName, [...localNames, ...remoteNames])) {
    toast('项目名称已存在', `“${displayName}”已经存在，请修改名称后再创建。`);
    $('new-project-name')?.focus();
    return;
  }

  const draft = newDraft(key, displayName);
  await saveDraft(draft);
  state.drafts.unshift(draft);
  r5CloseCreateModal();
  await selectDraft(draft.id);
  setView('quick');
}

function r5WireCreateModal() {
  if ($('new-project')) $('new-project').onclick = r5OpenCreateModal;
  qsa('[data-create-project-mode]').forEach(btn => btn.onclick = () => r5CreateProjectFromMode(btn.dataset.createProjectMode));
  if ($('project-mode-cancel')) $('project-mode-cancel').onclick = r5CloseCreateModal;
  if ($('project-mode-modal')) $('project-mode-modal').onclick = event => { if (event.target === $('project-mode-modal') && (state.drafts || []).length) r5CloseCreateModal(); };
}

async function r5SelectDraft(id) {
  const draft = migrateDraftWorkspaces(await getDraft(id));
  if (!draft) return;
  clearInterval(state.pollTimer); state.pollTimer = null;
  state.objectUrls.forEach(url => URL.revokeObjectURL(url));
  state.objectUrls.clear();
  state.draft = draft;
  bindCurrentWorkspace();
  normalizeSegments(state.draft);
  saveCurrentWorkspaceSelection();
  localStorage.setItem(LAST_SELECTED_DRAFT_KEY, id);
  renderAll();
  const workspace = getWorkspace();
  try {
    if (!Number(workspace.cloudSyncedAt || 0) || Date.now() - Number(workspace.cloudSyncedAt || 0) > 5 * 60_000) await loadOutputs(false);
  } catch (error) { console.warn('[Davis Video Studio R5] project sync failed', error); }
  renderAll();
  r16ApplyReadOnlyControls();
  const active = state.draft.segments.some(s => ['submitting','submitted','queued','running','processing'].includes(String(s.status || '').toLowerCase()));
  if (active && r16CurrentProjectWritable()) startPolling();
}

async function r5CreateProject() { r5OpenCreateModal(); }

async function r5RemoveProject() {
  if (!r16AssertCurrentProjectWritable('删除项目')) return;
  if (!state.draft || !await confirmBox('删除项目', `确定删除“${state.draft.name}”及其本地草稿吗？云端生成记录不会自动删除。`)) return;
  const id = state.draft.id;
  const workspace = getWorkspace();
  (workspace.frames || []).forEach(frame => releaseFrameUrl(frame.id));
  (workspace.referenceAssets || []).forEach(asset => asset?.id && releaseFrameUrl(asset.id));
  await deleteDraft(id);
  state.drafts = state.drafts.filter(item => item.id !== id);
  state.draft = null;
  state.outputs = []; state.outputHistory = []; state.jobs = [];
  if (state.drafts.length) await selectDraft(orderedDrafts()[0].id);
  else { renderProjects(); r5OpenCreateModal(); }
}

async function r11RestoreCloudDrafts(localDrafts) {
  const local = Array.isArray(localDrafts) ? [...localDrafts] : [];
  if (!state.user?.id) return [];

  let projectQuery = supabase
    .from('video_projects')
    .select('id,name,mode,owner_id,created_at,updated_at');
  projectQuery = scopeVideoRead(projectQuery, state.user);
  const { data, error } = await projectQuery
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.warn('[Davis Video R16] cloud project recovery skipped', error);
    return local.filter(draft => {
      const ownerId = r16ProjectOwnerId(draft);
      return ownerId ? ownerId === state.user.id : true;
    });
  }

  const projects = data || [];
  const projectById = new Map(projects.map(project => [project.id, project]));

  for (const draft of local) {
    const mode = r5ModeKey(draft.lockedMode || draft.mode);
    const workspace = draft.workspaces?.[mode] || draft;
    const projectId = workspace.remoteProjectId || draft.remoteProjectId || workspace.bindingCandidateProjectId || null;
    const project = projectId ? projectById.get(projectId) : null;
    if (project?.owner_id) {
      draft.remoteOwnerId = project.owner_id;
      draft.ownerId = project.owner_id;
      workspace.remoteOwnerId = project.owner_id;
      workspace.ownerId = project.owner_id;
      try { await saveDraft(draft); } catch (saveError) {
        console.warn('[Davis Video R16] failed to persist project owner', projectId, saveError);
      }
    } else if (!r16ProjectOwnerId(draft)) {
      draft.ownerId = state.user.id;
      workspace.ownerId = state.user.id;
    }
  }

  const drafts = local.filter(draft => {
    const ownerId = r16ProjectOwnerId(draft);
    return isVideoSuperAdmin(state.user) || ownerId === state.user.id;
  });

  const boundProjectIds = new Set();
  for (const draft of drafts) {
    if (draft?.remoteProjectId) boundProjectIds.add(draft.remoteProjectId);
    for (const workspace of Object.values(draft?.workspaces || {})) {
      if (workspace?.remoteProjectId) boundProjectIds.add(workspace.remoteProjectId);
      if (workspace?.bindingCandidateProjectId) boundProjectIds.add(workspace.bindingCandidateProjectId);
    }
  }

  for (const project of projects) {
    if (!project?.id || boundProjectIds.has(project.id)) continue;
    const mode = r5ModeKey(project.mode);
    const draft = newDraft(mode, project.name || `云端 ${r5ModeLabel(mode)}项目`);
    const workspace = draft.workspaces[mode];

    draft.id = `cloud-${project.id}`;
    draft.ownerId = project.owner_id;
    draft.remoteOwnerId = project.owner_id;
    draft.remoteProjectId = project.id;
    draft.remoteProjectName = project.name || draft.name;
    draft.createdAt = new Date(project.created_at || Date.now()).getTime();
    draft.updatedAt = new Date(project.updated_at || project.created_at || Date.now()).getTime();
    draft.cloudRecoveredProject = true;

    workspace.ownerId = project.owner_id;
    workspace.remoteOwnerId = project.owner_id;
    workspace.remoteProjectId = project.id;
    workspace.bindingCandidateProjectId = project.id;
    workspace.remoteBindingSchema = 'r5.3';
    workspace.remoteBindingVersion = 'r5.3';
    workspace.remoteBindingLocked = true;
    workspace.cloudSyncedAt = 0;
    workspace.lastEmptySyncAt = 0;

    try {
      await saveDraft(draft);
      drafts.push(draft);
      boundProjectIds.add(project.id);
    } catch (saveError) {
      console.warn('[Davis Video R16] failed to cache cloud project', project.id, saveError);
    }
  }

  return drafts.sort((a, b) =>
    Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0)
  );
}

async function r5Init() {
  if (!await initSession()) return;
  wireEvents();
  r5WireCreateModal();
  enhanceCustomSelects();
  document.body.dataset.seedanceBuild = APP_BUILD;
  state.drafts = await r11RestoreCloudDrafts(await r5MigrateDraftCollection(await listDrafts()));
  if (!state.drafts.length) { renderProjects(); r5OpenCreateModal(); return; }
  const last = localStorage.getItem(LAST_SELECTED_DRAFT_KEY);
  const initial = state.drafts.find(d => d.id === last) || orderedDrafts()[0];
  await selectDraft(initial.id);
  setView('quick');
}

function renamedFunction(fn, targetName) {
  const source = fn.toString();
  return source.replace(/^(async\s+)?function\s+[^(]+/, (_, asyncPrefix = '') => `${asyncPrefix}function ${targetName}`);
}

function replaceSection(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`R5 无法定位代码区段：${startMarker} → ${endMarker}`);
  return `${source.slice(0, start)}${replacement}

${source.slice(end)}`;
}


function r10StableUploadPlan(frames, neededIds) {
  const needed = neededIds instanceof Set ? neededIds : new Set(neededIds || []);
  const plan = (frames || []).map((frame, order) => ({ id: frame?.id, order }))
    .filter(item => item.id && needed.has(item.id));
  if (plan.length !== needed.size) throw new Error('提交所需图片已变化，请重新确认首尾帧后再提交');
  return plan;
}
function r10ApplyFrameBinding(frames, frameId, uploaded) {
  const target = (frames || []).find(frame => frame?.id === frameId);
  if (!target) throw new Error('图片工作区在上传时发生变化，已安全中止本次提交，请重试');
  ['remoteAssetId','remotePath','arkSafeVersion','uploadWidth','uploadHeight','wasAspectPadded',
   'aspectPadMode','uploadSafeRatio','originalRatio'].forEach(key => {
    if (uploaded && Object.prototype.hasOwnProperty.call(uploaded, key)) target[key] = uploaded[key];
  });
  return target;
}
function r10SubmissionContext() {
  return { draftId: state.draft?.id || null, mode: r5ModeKey(state.draft?.lockedMode || state.draft?.mode) };
}
function r10AssertContext(context) {
  if (state.draft?.id !== context?.draftId ||
      r5ModeKey(state.draft?.lockedMode || state.draft?.mode) !== context?.mode) {
    throw new Error('提交期间项目已切换，已安全中止，避免素材写入错误项目');
  }
}
async function r10RecoverFrameBindings(projectId, plan) {
  const result = await supabase.from('video_assets')
    .select('id,object_path,sort_order,width,height,created_at')
    .eq('owner_id', r16ProjectOwnerId()).eq('project_id', projectId).eq('kind', 'frame')
    .order('created_at', { ascending: false }).limit(100);
  if (result.error) { console.warn('[Davis Video R10] frame recovery skipped', result.error); return; }
  for (const item of plan) {
    const frame = state.draft.frames.find(candidate => candidate.id === item.id);
    if (!frame || frame.remoteAssetId) continue;
    const row = (result.data || []).find(candidate => String(candidate.object_path || '').includes('-' + item.id + '-'));
    if (!row) continue;
    r10ApplyFrameBinding(state.draft.frames, item.id, {
      remoteAssetId: row.id, remotePath: row.object_path, arkSafeVersion: IMAGE_SAFE_VERSION,
      uploadWidth: row.width || null, uploadHeight: row.height || null
    });
    if (Number(row.sort_order) !== item.order) {
      supabase.from('video_assets').update({ sort_order: item.order })
        .eq('id', row.id).eq('owner_id', r16ProjectOwnerId())
        .then(({ error }) => { if (error) console.warn('[Davis Video R10] order repair failed', error); });
    }
  }
}
async function r10UploadNeededFrames(segmentIds) {
  if (!r16AssertCurrentProjectWritable('上传素材')) throw new Error('只读项目不能上传素材');
  const context = r10SubmissionContext();
  const projectId = await ensureRemoteProject();
  r10AssertContext(context);
  if (state.draft.mode === 'text_only') {
    const current = () => state.draft.segments.filter(segment => segmentIds.includes(segment.id));
    const assets = commitTextReferenceAssets();
    current().forEach(segment => {
      validatePromptReferenceTokens(segment, assets);
      segment.status = 'uploading'; segment.progress = assets.length ? 3 : 12;
      segment.error = assets.length ? '准备上传 ' + assets.length + ' 个参考素材...' : null;
    });
    renderJobs(); await persist(); r10AssertContext(context);
    const ids = await uploadReferenceAssets(projectId, current());
    r10AssertContext(context);
    const uploaded = commitTextReferenceAssets();
    current().forEach(segment => {
      segment.referenceAssetId = ids[0] || null; segment.referenceAssetIds = ids;
      segment.referenceDirections = uploaded.map((item, index) => ({
        asset_id: item.remoteAssetId || null, token: referenceToken(item, index),
        name: item.name, mime_type: item.type, usage: 'free_prompt_reference'
      }));
      segment.status = 'submitting'; segment.progress = 13; segment.error = null;
    });
    renderAll(); await persist(); return projectId;
  }
  const selected = state.draft.segments.filter(segment => segmentIds.includes(segment.id));
  const needed = new Set(selected.flatMap(segment => [segment.fromFrameId, segment.toFrameId]));
  const plan = r10StableUploadPlan(state.draft.frames, needed);
  await r10RecoverFrameBindings(projectId, plan);
  r10AssertContext(context);
  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index];
    const currentSegments = state.draft.segments.filter(segment => segmentIds.includes(segment.id));
    currentSegments.forEach(segment => {
      if ([segment.fromFrameId, segment.toFrameId].includes(item.id)) {
        segment.status = 'uploading';
        segment.progress = Math.max(3, Math.round(((index + 0.2) / Math.max(plan.length, 1)) * 12));
        segment.error = null;
      }
    });
    renderAll(); await persist(); r10AssertContext(context);
    const frame = state.draft.frames.find(candidate => candidate.id === item.id);
    if (!frame) throw new Error('图片工作区在上传时发生变化，已安全中止本次提交，请重试');
    const uploaded = await uploadFrame(frame, projectId, item.order);
    r10AssertContext(context);
    r10ApplyFrameBinding(state.draft.frames, item.id, uploaded);
    await persist();
  }
  const incomplete = [];
  state.draft.segments.filter(segment => segmentIds.includes(segment.id)).forEach(segment => {
    const from = state.draft.frames.find(frame => frame.id === segment.fromFrameId);
    const to = state.draft.frames.find(frame => frame.id === segment.toFrameId);
    if (!from?.remoteAssetId || !to?.remoteAssetId) incomplete.push(segment.index + 1);
    else { segment.status = 'submitting'; segment.progress = 13; segment.error = null; }
  });
  if (incomplete.length) throw new Error('素材绑定不完整，请重新提交 Segment ' + incomplete.join('、'));
  renderAll(); await persist(); return projectId;
}
async function r10RecoverOrphan(force) {
  if (!state.draft || state.isGenerating) return false;
  const active = new Set(['preparing','uploading','submitting','retrying']);
  const candidates = state.draft.segments.filter(segment =>
    active.has(String(segment.status || '').toLowerCase()) &&
    !segment.remoteSegmentId && !segment.remoteTaskId && !segment.providerTaskId);
  const projectId = state.draft.remoteProjectId || getWorkspace().remoteProjectId || null;
  if (!candidates.length || !projectId) return false;
  const result = await supabase.from('video_segments').select('id')
    .eq('owner_id', r16ProjectOwnerId()).eq('project_id', projectId).limit(1);
  if (result.error) throw new Error('检查中断提交失败：' + errorMessage(result.error));
  if ((result.data || []).length) return false;
  const needed = new Set(candidates.flatMap(segment => [segment.fromFrameId, segment.toFrameId]).filter(Boolean));
  if (needed.size) await r10RecoverFrameBindings(projectId, r10StableUploadPlan(state.draft.frames, needed));
  candidates.forEach(segment => {
    segment.status = 'failed'; segment.progress = 0; segment.submissionStartedAt = null;
    segment.error = '上次提交在素材上传后中断，未创建 Ark 任务。已解除卡住状态；点击“重新编辑”后可再次提交。';
  });
  saveCurrentWorkspaceSelection(); await persist();
  if (force) toast('已解除卡住状态', '未创建 Ark 任务。请点击“重新编辑”后再次提交。');
  return true;
}
async function r10RefreshJobs(force = false) {
  if (!r16CurrentProjectWritable()) {
    try { await loadOutputs(true); } catch (error) { console.warn('[Davis Video R16] read-only refresh failed', error); }
    renderJobs();
    return;
  }
  try { await loadOutputs(true); } catch (error) { console.warn('[Davis Video R10] refresh failed', error); }
  try { await r10RecoverOrphan(Boolean(force)); }
  catch (error) { console.warn('[Davis Video R10] orphan recovery failed', error); if (force) toast('状态检查失败', errorMessage(error)); }
  renderJobs();
}

function r18PublicSegmentState(task, outputRows) {
  if (!task) return null;
  const output = (outputRows || []).find(row => row?.task_id === task.id) || null;
  if (output) {
    const metadata = output.metadata || {};
    const storageStatus = String(output.storage_status || '').toLowerCase();
    const publicStatus = String(output.status || '').toLowerCase();
    const driveFileId = output.google_drive_file_id || metadata.google_drive_file_id || null;
    if (driveFileId && storageStatus === 'completed') {
      return { status: 'completed', progress: 100, error: null };
    }
    if (publicStatus === 'drive_sync_failed' || metadata.storage_terminal === true) {
      return {
        status: 'drive_sync_failed',
        progress: 100,
        error: output.storage_error || 'Google Drive 云盘同步失败',
      };
    }
    return {
      status: 'uploading_drive',
      progress: Math.max(90, Number(task.progress || 0)),
      error: null,
    };
  }

  const finalStatus = String(task.provider_response?.final_status || '').toLowerCase();
  if (finalStatus === 'provider_policy_blocked') {
    return {
      status: 'provider_policy_blocked',
      progress: 0,
      error: task.error_message || '当前视频模型对该真人参考图片进行了安全限制。素材和项目已保存，你可以更换参考图片后重新生成。',
    };
  }
  if (finalStatus === 'provider_failed') {
    return { status: 'provider_failed', progress: 0, error: task.error_message || null };
  }
  const raw = String(task.status || '').toLowerCase();
  if (raw === 'provider_policy_blocked') {
    return {
      status: 'provider_policy_blocked',
      progress: 0,
      error: task.error_message || '当前视频模型对该真人参考图片进行了安全限制。素材和项目已保存，你可以更换参考图片后重新生成。',
    };
  }
  if (raw === 'failed' || raw === 'error') {
    return { status: 'provider_failed', progress: 0, error: task.error_message || null };
  }
  if (['succeeded','completed','success'].includes(raw)) {
    return { status: 'uploading_drive', progress: 90, error: null };
  }
  if (['running','processing','submitted'].includes(raw)) {
    return { status: 'generating', progress: Math.max(20, Number(task.progress || 0)), error: null };
  }
  if (['queued','submitting'].includes(raw)) {
    return { status: 'pending', progress: Math.max(10, Number(task.progress || 0)), error: null };
  }
  return null;
}

function r18StatusText(status) {
  return ({
    draft:'草稿',
    preparing:'准备中',
    uploading:'上传素材',
    submitting:'正在提交',
    retrying:'重试连接',
    queued:'排队中',
    pending:'排队中',
    submitted:'生成中',
    generating:'生成中',
    running:'生成中',
    processing:'生成中',
    uploading_drive:'视频正在同步云端',
    completed:'完成',
    succeeded:'完成',
    success:'完成',
    provider_failed:'模型拒绝',
    provider_policy_blocked:'参考图片受限',
    drive_sync_failed:'云盘同步失败',
    failed:'失败',
    error:'失败',
    recovering:'找回中',
    charged_unknown:'疑似已扣费待确认'
  })[String(status || '').toLowerCase()] || status || '草稿';
}

function r18JobStageMarkup(segment) {
  const status = String(segment.status || 'draft').toLowerCase();
  const progress = Number(segment.progress || (
    status === 'pending' ? 15 :
    status === 'generating' ? 60 :
    status === 'uploading_drive' ? 92 :
    status === 'completed' ? 100 : 0
  ));
  const uploaded = !['draft','preparing','uploading','provider_failed'].includes(status);
  const submitted = ['pending','generating','uploading_drive','completed','drive_sync_failed'].includes(status);
  const generated = ['uploading_drive','completed','drive_sync_failed'].includes(status);
  const driveDone = status === 'completed';
  const failed = ['provider_failed','drive_sync_failed','failed','error'].includes(status);
  const steps = [
    ['素材上传', uploaded],
    ['任务提交', submitted],
    ['Seedance 生成', generated],
    ['Google Drive 同步', driveDone],
  ];
  return `
    <div class="job-progress" style="margin:12px 0">
      <div style="height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden">
        <div style="height:100%;width:${Math.max(0,Math.min(100,progress))}%;background:linear-gradient(90deg,#6d5dfc,#9a8cff);transition:.3s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:7px;font-size:10px;color:#8b91a3">
        <span>${progress}%</span><span>${statusText(status)}</span>
      </div>
      <div style="display:grid;gap:5px;margin-top:10px;font-size:10px;color:#8c92a1">
        ${steps.map(([label,done]) => `<span>${done ? '✓' : failed ? '×' : '○'} ${label}</span>`).join('')}
      </div>
      ${segment.providerTaskId ? '<div style="margin-top:9px;font-size:10px;color:#8b91a3">后台任务已记录，可自动刷新结果</div>' : ''}
    </div>`;
}

export function patchV46Source(source, { supabaseUrl, dbUrl, projectVersionUrl, accessControlSource }) {
  let patched = String(source || '');
  if (!patched.includes(ORIGINAL_BUILD)) throw new Error(`只支持 ${ORIGINAL_BUILD}，当前 app-v46.js 版本不匹配`);
  patched = patched.replace("from '../supabase-config.js'", `from '${supabaseUrl}'`)
    .replace("from './db.js'", `from '${dbUrl}';\nimport { parseProjectVersion, nextProjectVersionName, cloneDraftAsVersion } from '${projectVersionUrl}'`)
    .replace(ORIGINAL_BUILD, PRODUCTION_BUILD);

  const accessControlSupport = String(accessControlSource || '').replace(/\bexport\s+/g, '');
  const support = accessControlSupport + '\n\n' + [r5ModeKey,r5ModeLabel,r5ModeSuffix,r5BaseProjectName,r5Clone,r5WorkspaceHasContent,r5CreateWorkspaceClone,
    r5BuildSplitDraft,r5MigrateDraftCollection,r5ContextSnapshot,r5ContextIsCurrent,r5ExactTaskIds,
    r53IsGenericProjectName,r53NormalizePrompt,r53PromptOverlap,r53ProjectCandidateScore,r5VerifyProjectId,
    r5ResolveFixedProject,r5TaskScore,r5OutputStableKey,r5CacheRequestUrl,r5ReadPersistentVideo,r5PrunePersistentVideoCache,
    r5WritePersistentVideo,r5OpenCreateModal,r5CloseCreateModal,r5CreateProjectFromMode,r5WireCreateModal,
    r6ExistingProjectNames,r6ForkCurrentDraftForSubmit,r10StableUploadPlan,r10ApplyFrameBinding,
    r10SubmissionContext,r10AssertContext,r10RecoverFrameBindings,r10RecoverOrphan,r11RestoreCloudDrafts,r13MarkVersionForkForSubmit,r14NormalizeProjectName,r14ProjectNameExists,r15HasFilePayload,r15WireFileDropzone,r15PreventDocumentFileNavigation,
    r16ProjectOwnerId,r16ScopeProjectRead,r16CurrentProjectWritable,r16AssertCurrentProjectWritable,r16ApplyReadOnlyControls,
    r18PublicSegmentState,r18StatusText,r18JobStageMarkup].map(fn => fn.toString()).join('\n\n');

  patched = patched.replace("const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';",
    "const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';\n\n" + support);
  if (!patched.includes('.map((segment, index) => ({ ...segment, index }));')) throw new Error('无法定位 Segment 身份稳定修复点');
  patched = patched.replace('.map((segment, index) => ({ ...segment, index }));', '.map((segment, index) => { segment.index = index; return segment; });');
  patched = replaceSection(patched, 'function newDraft() {', 'function createWorkspaceState() {', renamedFunction(r5NewDraft, 'newDraft'));
  patched = replaceSection(patched, 'function migrateDraftWorkspaces(draft) {', 'function getWorkspace(', renamedFunction(r5MigrateDraftWorkspaces, 'migrateDraftWorkspaces'));
  patched = replaceSection(patched, 'function getWorkspace(', 'function bindCurrentWorkspace() {', renamedFunction(r5GetWorkspace, 'getWorkspace'));
  patched = replaceSection(patched, 'function bindCurrentWorkspace() {', 'function saveCurrentWorkspaceSelection() {', renamedFunction(r5BindCurrentWorkspace, 'bindCurrentWorkspace'));
  patched = replaceSection(patched, 'function saveCurrentWorkspaceSelection() {', 'function workspaceLabel(', renamedFunction(r5SaveCurrentWorkspaceSelection, 'saveCurrentWorkspaceSelection'));
  patched = replaceSection(patched, 'function setView(view) {', 'function orderedDrafts() {', renamedFunction(r5SetView, 'setView'));
  patched = replaceSection(patched, 'function renderProjects() {', 'function escapeHtml(', renamedFunction(r5RenderProjects, 'renderProjects'));
  patched = replaceSection(patched, 'function renderSettings() {', 'function buildStrictFrameLockPrompt(', renamedFunction(r5RenderSettings, 'renderSettings'));
  patched = replaceSection(patched, 'async function selectDraft(id) {', 'async function createProject() {', renamedFunction(r5SelectDraft, 'selectDraft'));
  patched = replaceSection(patched, 'async function createProject() {', 'async function removeProject() {', renamedFunction(r5CreateProject, 'createProject'));
  patched = replaceSection(patched, 'async function removeProject() {', 'function statusText(', renamedFunction(r5RemoveProject, 'removeProject'));
  patched = replaceSection(patched, 'function statusText(', 'async function ensureRemoteProject() {', renamedFunction(r18StatusText, 'statusText'));
  patched = replaceSection(patched, 'async function fetchVideoBlobThroughProxy(output) {', 'async function hydrateProxyVideoElements() {', renamedFunction(r5FetchVideoBlobThroughProxy, 'fetchVideoBlobThroughProxy'));
  patched = replaceSection(patched, 'async function hydrateProxyVideoElements() {', 'function outputCardMarkup(', renamedFunction(r5HydrateProxyVideoElements, 'hydrateProxyVideoElements'));
  patched = replaceSection(patched, 'async function recoverLatestDriveOutputWhenEmpty(force = false) {', 'function renderJobs() {', renamedFunction(r5RecoverLatestDriveOutputWhenEmpty, 'recoverLatestDriveOutputWhenEmpty'));
  patched = replaceSection(patched, 'function renderJobs() {', 'function findSegmentIdByOutputIndex(', renamedFunction(r5RenderJobs, 'renderJobs'));
  patched = replaceSection(patched, 'function jobStageMarkup(', 'function frameCard(', renamedFunction(r18JobStageMarkup, 'jobStageMarkup'));
  patched = replaceSection(patched, 'function reEditSegment(segmentId) {', 'function renderAll() {', renamedFunction(r6ReEditSegment, 'reEditSegment'));
  patched = replaceSection(patched, 'async function syncRemoteTasks() {', 'async function bindProviderTaskAndRecover(', renamedFunction(r5SyncRemoteTasks, 'syncRemoteTasks'));
  patched = replaceSection(patched, 'async function uploadNeededFrames(', 'async function submitOne(', renamedFunction(r10UploadNeededFrames, 'uploadNeededFrames'));
  patched = replaceSection(patched, 'async function refreshJobs() {', 'async function loadOutputs() {', renamedFunction(r10RefreshJobs, 'refreshJobs'));
  patched = replaceSection(patched, 'async function loadOutputs() {', 'function startPolling() {', renamedFunction(r5LoadOutputs, 'loadOutputs'));
  patched = replaceSection(patched, 'async function init() {', 'init().catch(', renamedFunction(r5Init, 'init'));

  for (const [functionName, actionLabel, throwOnDeny] of [
    ['removeFrame', '删除图片', false],
    ['moveFrame', '调整图片顺序', false],
    ['addReferenceVideo', '添加参考视频', false],
    ['addReferenceAssets', '添加参考素材', false],
    ['addFiles', '上传图片', false],
    ['ensureRemoteProject', '创建或修改云端项目', true],
    ['uploadFrame', '上传图片', true],
    ['uploadReferenceVideo', '上传参考视频', true],
    ['uploadReferenceAssets', '上传参考素材', true],
    ['submitOne', '提交 Seedance 任务', true],
    ['resubmitSegment', '重新提交视频', false],
    ['generateSegments', '生成视频', false],
    ['mergeAll', '合并他人项目视频', false]
  ]) {
    patched = r16GuardPatchedFunction(patched, functionName, actionLabel, throwOnDeny);
  }

  patched = patched.replace("  $('new-project').onclick = createProject;", "  $('new-project').onclick = r5OpenCreateModal;");
  const modeSwitchBlock = `  qsa('#mode-switch button').forEach(btn => btn.onclick = async () => {
    saveCurrentWorkspaceSelection();
    state.draft.mode = btn.dataset.mode === 'first_last' ? 'first_last' : (btn.dataset.mode === 'text_only' ? 'text_only' : 'multi_frame');
    bindCurrentWorkspace();
    normalizeSegments(state.draft);
    saveCurrentWorkspaceSelection();
    renderAll();
    await persist();
    toast('已切换工作区', \`\${workspaceLabel()} 的图片、提示词、任务和输出独立保存。\`);
  });
`;
  if (!patched.includes(modeSwitchBlock)) throw new Error('无法定位旧模式切换事件');
  patched = patched.replace(modeSwitchBlock, '');

  patched = patched.replace(
    "    mode: isTextOnly ? 'text_only' : state.draft.mode,\n  };",
    "    submit_mode: isTextOnly && ((segment.referenceAssetIds || (state.referenceAssets || []).map(item => item.remoteAssetId).filter(Boolean)).length || segment.referenceAssetId) ? 'reference_image_video' : (isTextOnly ? 'text_to_video' : 'first_last_frame_video'),\n    task_type: '',\n    image_role: isTextOnly ? 'reference_image' : 'first_frame',\n    image_count: isTextOnly ? (segment.referenceAssetIds || (state.referenceAssets || []).map(item => item.remoteAssetId).filter(Boolean)).length : 2,\n    contains_real_person: isTextOnly && Array.isArray(globalThis.__davisVisionDiagnostics) ? globalThis.__davisVisionDiagnostics.some(item => item?.contains_real_person === true) : false,\n    real_person_count: isTextOnly && Array.isArray(globalThis.__davisVisionDiagnostics) ? Math.max(0, ...globalThis.__davisVisionDiagnostics.map(item => Number(item?.real_person_count || 0))) : 0,\n    multi_person_detected: isTextOnly && Array.isArray(globalThis.__davisVisionDiagnostics) ? globalThis.__davisVisionDiagnostics.some(item => item?.multi_person_detected === true) : false,\n    mode: isTextOnly ? 'text_only' : state.draft.mode,\n  };"
  );

  patched = patched.replace(
    "    if (data?.error && !data?.success) throw new Error(data.error);",
    "    if (data?.error && !data?.success) { const wrapped = new Error(data.error); wrapped.payload = data; throw wrapped; }"
  );
  patched = patched.replace(
    "        message = payload?.error || payload?.message || message;",
    "        message = payload?.error || payload?.message || message; error.payload = payload;"
  );

  const rightsHelper = `
async function r21ConfirmMaterialRights(error) {
  if (String(error?.message || '') !== 'MATERIAL_RIGHTS_CONFIRMATION_REQUIRED') return false;
  const payload = error?.payload || {};
  const statement = payload.statement || '我确认已获得该图片/视频素材的合法使用权，并承担由此产生的责任。';
  const accepted = await confirmBox('素材使用权确认', statement);
  if (!accepted) throw new Error('已取消素材使用权确认');
  const result = await invokeEdgeFunction('seedance-material-rights', {
    project_id: payload.project_id || state.draft.remoteProjectId,
    project_version_id: payload.project_version_id || state.draft.remoteProjectId,
  });
  state.draft.materialRightsConfirmation = {
    confirmed: true,
    projectVersionId: result.project_version_id,
    termsVersion: result.terms_version,
  };
  state.draft.materialRightsConfirmedAt = result.confirmed_at || new Date().toISOString();
  await persist();
  return true;
}

`;
  patched = patched.replace('async function submitOne(segment) {', rightsHelper + 'async function submitOne(segment) {');
  patched = patched.replace(
    "    } catch (error) {\n      lastError = error;",
    "    } catch (error) {\n      if (await r21ConfirmMaterialRights(error)) { attempt -= 1; continue; }\n      lastError = error;"
  );

  patched = patched.replace(
    "      if (!data.task_id || !data.provider_task_id) throw new Error(data.error || 'Seedance 提交接口没有返回 task_id / provider_task_id');",
    "      if (!data.task_id) throw new Error(data.error || 'Seedance 提交接口没有返回 task_id');"
  );
  patched = patched.replace(
    "      segment.providerTaskId = data.provider_task_id;",
    "      segment.providerTaskId = data.provider_task_id || null;"
  );

  patched = patched.replace("return new Set(['preparing','uploading','submitting','retrying','submitted','queued','running','processing']);", "return new Set(['preparing','uploading','submitting','retrying','submitted','queued','pending','generating','running','processing','uploading_drive']);");
  const generateSignature = 'async function generateSegments(segmentIds) {';
  patched = patched.replace(generateSignature, 'async function generateSegments(segmentIds, options = {}) {');
  const generateStart = patched.indexOf('async function generateSegments(segmentIds, options = {}) {');
  const generateEnd = patched.indexOf('\nasync function refreshSingleSegment(', generateStart);
  if (generateStart < 0 || generateEnd < 0) throw new Error('无法定位 generateSegments 完整区段');
  const generateSource = patched.slice(generateStart, generateEnd)
    .replace('  const segments = state.draft.segments.filter(s => segmentIds.includes(s.id));',
      '  let segments = state.draft.segments.filter(s => segmentIds.includes(s.id));');
  patched = patched.slice(0, generateStart) + generateSource + patched.slice(generateEnd);
  const autoReset = `  let resetCount = 0;
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
  const guard = `  if (!options.allowResubmit && !state.draft?.pendingVersionFork) {
    await loadOutputs(false).catch(() => {});
    const retryableStatuses = new Set(['failed', 'cancelled', 'canceled']);
    const retryable = segments.filter(segment => {
      const status = String(segment?.status || '').toLowerCase();
      const hasOutput = Boolean(
        segment?.outputPath
        || segment?.outputUrl
        || (state.outputs || []).some(output => Number(output.index) === Number(segment.index))
      );
      return retryableStatuses.has(status) && !hasOutput;
    });
    const existing = segments.filter(segment => !retryable.includes(segment) && (
      segmentHasExistingTask(segment)
      || (state.outputs || []).some(output => Number(output.index) === Number(segment.index))
    ));
    if (existing.length) {
      r13MarkVersionForkForSubmit(segmentIds);
      toast('将创建新版本', '当前项目已有任务或视频；确认提交后会自动创建新的 V-N 独立项目，原历史保持不变。');
    }
    if (!existing.length && retryable.length) {
      retryable.forEach(resetSegmentForNewSubmit);
      state.outputs = (state.outputs || []).filter(isOutputCurrentForSegment);
      saveCurrentWorkspaceSelection();
      renderAll();
      await persist();
    }
  }
`;
  if (!patched.includes(autoReset)) throw new Error('无法定位旧自动重置代码');
  patched = patched.replace(autoReset, guard);
  const versionForkMarker = "  if (!await confirmBox('确认提交真实任务', `将提交 ${segments.length} 个视频片段。为避免 Ark 连接超时，多帧会逐段提交，可能产生 Ark API 费用。`)) return;";
  if (!patched.includes(versionForkMarker)) throw new Error('无法定位版本分叉提交点');
  patched = patched.replace(versionForkMarker, versionForkMarker + '\n' + "  if (state.draft?.pendingVersionFork) {\n    try {\n      const versionFork = await r6ForkCurrentDraftForSubmit(segmentIds);\n      if (versionFork) {\n        segmentIds = versionFork.segmentIds;\n        segments = state.draft.segments.filter(segment => segmentIds.includes(segment.id));\n        options = { ...options, allowResubmit: false, versionForked: true };\n        if (!segments.length) return toast('无法创建新版本任务', '新版本中没有找到要提交的片段。');\n      }\n    } catch (error) {\n      console.error('[Davis Video Studio] version fork failed', error);\n      return toast('新版本创建失败', errorMessage(error, '无法创建独立版本，请稍后重试'));\n    }\n  }");
  patched = patched.replace("    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; });",
    "    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; s.submissionStartedAt = Date.now(); if (options.allowResubmit) { s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; } });");
  const fileDropEvents = `  const zone = $('upload-zone');
  ['dragenter','dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', event => addFiles(event.dataTransfer.files));`;
  if (!patched.includes(fileDropEvents)) throw new Error('无法定位文件拖放事件绑定');
  patched = patched.replace(fileDropEvents, `  const zone = $('upload-zone');
  r15WireFileDropzone(zone, addFiles);
  r15WireFileDropzone($('reference-video-card'), addReferenceVideo);
  r15PreventDocumentFileNavigation();`);
  patched = patched.replace('  await generateSegments([segment.id]);', '  await generateSegments([segment.id], { allowResubmit: true });');
  const projectPayloadMarker = `    status: 'draft',
  };`;
  const projectPayloadReplacement = `    status: 'draft',
    version_source_project_id: state.draft.versionSourceProjectId || null,
    version_root_id: state.draft.versionRootProjectId || null,
    version_number: Math.max(1, Number(state.draft.versionNumber) || 1),
  };`;
  if (!patched.includes(projectPayloadMarker)) throw new Error('无法定位远端项目版本字段');
  patched = patched.replace(projectPayloadMarker, projectPayloadReplacement);
  const projectBindingMarker = `  state.draft.remoteProjectId = result.data.id;
  workspace.remoteProjectId = result.data.id;`;
  const projectBindingReplacement = `  state.draft.remoteProjectId = result.data.id;
  state.draft.versionSourceProjectId = result.data.version_source_project_id || state.draft.versionSourceProjectId || null;
  state.draft.versionRootProjectId = result.data.version_root_id || state.draft.versionRootProjectId || result.data.id;
  state.draft.versionNumber = Math.max(1, Number(result.data.version_number) || Number(state.draft.versionNumber) || 1);
  workspace.remoteProjectId = result.data.id;`;
  if (!patched.includes(projectBindingMarker)) throw new Error('无法定位远端项目绑定点');
  patched = patched.replace(projectBindingMarker, projectBindingReplacement);
  const originalFrameUploadMarker = "  const safeFrame = await makeArkSafeFrameBlob(frame);";
  const originalFrameUploadReplacement = `  if (!(frame.blob instanceof Blob)) throw new Error('原始图片文件已丢失，请重新上传');
  const safeFrame = {
    blob: frame.blob,
    type: frame.blob.type || frame.type || 'image/png',
    width: frame.width || frame.uploadWidth || null,
    height: frame.height || frame.uploadHeight || null,
  };`;
  if (!patched.includes(originalFrameUploadMarker)) throw new Error('无法定位帧图片转码点');
  patched = patched.replace(originalFrameUploadMarker, originalFrameUploadReplacement);
  const textReferencePromptMarker = "    return [\n      '【纯文字生成要求】',\n      '当前任务为纯文字描述生成模式，没有上传参考图。',";
  const textReferencePromptReplacement = "    const referenceCount = (state.referenceAssets || []).length;\n    return [\n      '【纯文字生成要求】',\n      referenceCount\n        ? `当前任务为纯文字描述生成模式，已上传 ${referenceCount} 张参考图；请结合参考图理解主体、构图与风格。`\n        : '当前任务为纯文字描述生成模式，没有上传参考图。',";
  if (!patched.includes(textReferencePromptMarker)) throw new Error('无法定位纯文字参考图提示包装');
  patched = patched.replace(textReferencePromptMarker, textReferencePromptReplacement);
  return `${patched}
//# sourceURL=seedance/app-production-runtime.js
`;
}

export async function bootProduction() {
  const originalUrl = new URL(`${ORIGINAL_FILE}?v=${ORIGINAL_BUILD}`, import.meta.url);
  const supabaseUrl = new URL('../supabase-config.js', import.meta.url).href;
  const dbUrl = new URL('./db.js', import.meta.url).href;
  const projectVersionUrl = new URL('./project-version-policy.mjs', import.meta.url).href;
  const accessControlUrl = new URL('./access-control.mjs?v=20260729-user-isolation-r16', import.meta.url);
  const [response, accessControlResponse] = await Promise.all([
    fetch(originalUrl, { cache: 'no-store' }),
    fetch(accessControlUrl, { cache: 'no-store' })
  ]);
  if (!response.ok) throw new Error(`读取 app-v46.js 失败：HTTP ${response.status}`);
  if (!accessControlResponse.ok) throw new Error(`读取 access-control.mjs 失败：HTTP ${accessControlResponse.status}`);
  const [source, accessControlSource] = await Promise.all([response.text(), accessControlResponse.text()]);
  const patched = patchV46Source(source, { supabaseUrl, dbUrl, projectVersionUrl, accessControlSource });
  const blobUrl = URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }));
  try {
    await import(blobUrl);
    document.body.dataset.seedanceLoaderBuild = PRODUCTION_BUILD;
    console.log('[Davis Video Studio loader]', PRODUCTION_BUILD);
  } finally { setTimeout(() => URL.revokeObjectURL(blobUrl), 30000); }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  bootProduction().catch(error => {
    console.error('[Davis Video Studio R5] boot failed', error);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:20px;z-index:99999;background:#220b12;color:#fff;border:1px solid #ff6075;border-radius:14px;padding:20px;font:14px/1.6 system-ui;overflow:auto';
    box.innerHTML = `<strong>Seedance 单项目单模式版启动失败</strong><br>${String(error?.message || error).replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}<br><br>请确认 seedance/app-v46.js 保留，并上传本包中的 ai-assistant.html 与 seedance/app.js。`;
    document.body.appendChild(box);
  });
}
