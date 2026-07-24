const PRODUCTION_BUILD = '20260724-single-project-single-mode-r5-4-output-render-fix';
const ORIGINAL_BUILD = '20260723-google-drive-only-output-v46';
const ORIGINAL_FILE = './app-v46.js';

function r5FetchVideoBlobThroughProxy(output) {
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
    .select('id,name,mode,created_at,updated_at')
    .eq('owner_id', state.user.id)
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
      .eq('owner_id', state.user.id)
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
      .select('id,name,mode,created_at,updated_at,status')
      .eq('owner_id', state.user.id)
      .in('id', list);
    if (!r5ContextIsCurrent(snapshot) || error) return;
    for (const project of data || []) {
      if (r5ModeKey(project.mode) === mode) candidateMap.set(project.id, project);
    }
  }

  await addProjectsByIds([...exactProjectIds, existingProjectId]);

  if (baseName) {
    const { data, error } = await supabase.from('video_projects')
      .select('id,name,mode,created_at,updated_at,status')
      .eq('owner_id', state.user.id)
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
        .select('id,name,mode,created_at,updated_at,status')
        .eq('owner_id', state.user.id)
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
      .eq('owner_id', state.user.id)
      .in('project_id', candidateIds),
    supabase.from('video_tasks')
      .select('id,project_id,segment_id,provider_task_id,status,created_at')
      .eq('owner_id', state.user.id)
      .in('project_id', candidateIds),
    supabase.from('video_outputs')
      .select('id,project_id,task_id,segment_id,metadata,created_at')
      .eq('owner_id', state.user.id)
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
    workspace.remoteBindingSchema = 'r5.3';
    workspace.remoteBindingVersion = 'r5.3';
    workspace.remoteBindingLocked = true;
    state.draft.remoteProjectId = project.id;
    const projectId = project.id;

    const [segmentResult, taskResult, outputResult] = await Promise.all([
      supabase.from('video_segments')
        .select('id,project_id,position,prompt,model_alias,duration,resolution,ratio,status,mode,generate_audio,created_at,updated_at')
        .eq('owner_id', state.user.id)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.from('video_tasks')
        .select('id,segment_id,project_id,provider_task_id,status,progress,error_message,model_alias,created_at,updated_at')
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

    const currentTime = Date.now();
    const bySegment = new Map();

    for (const row of rows) {
      if (row.project_id !== projectId) continue;
      const meta = row.metadata || {};
      const providerTaskId = providerTaskIdFromOutputRow(row, meta);
      const googleDriveFileId = meta.google_drive_file_id || meta.googleDriveFileId || meta.drive_file_id || meta.driveFileId || null;
      const driveStatus = String(meta.google_drive_backup_status || '').toLowerCase();
      const providerUrl = outputVideoUrlFromMetadata(meta);
      const providerExpiry = Date.parse(meta.provider_video_url_expires_at || '');
      const providerValid = Boolean(providerUrl) && (!Number.isFinite(providerExpiry) || providerExpiry > currentTime + 60_000);

      let url = '';
      let storageMode = '';
      if (googleDriveFileId && driveStatus !== 'failed') {
        url = `seedance-proxy://${row.id || googleDriveFileId}`;
        storageMode = 'google-drive-proxy';
      } else if (providerValid) {
        url = `seedance-proxy://${row.id || providerTaskId}`;
        storageMode = 'ark-proxy';
      } else if (row.storage_path && row.bucket_id && row.bucket_id !== 'ark-url') {
        const signed = await supabase.storage.from(row.bucket_id).createSignedUrl(row.storage_path, 3600);
        if (!current()) return;
        if (!signed.error && signed.data?.signedUrl) {
          url = signed.data.signedUrl;
          storageMode = 'supabase';
        }
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
      if (googleDriveFileId && driveStatus !== 'failed') score += 1_000_000_000_000;
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
    try { await loadOutputs(true); renderAll(); } finally { btn.disabled = false; btn.textContent = old || '刷新结果'; }
  });
  qsa('[data-edit-from-job]').forEach(btn => btn.onclick = () => reEditSegment(btn.dataset.editFromJob));
  qsa('[data-edit-output-segment]').forEach(btn => btn.onclick = () => reEditSegment(btn.dataset.editOutputSegment || findSegmentIdByOutputIndex(btn.dataset.outputIndex)));
  qsa('[data-download-output]').forEach(link => link.onclick = event => {
    if (!link.href || link.getAttribute('href') === '#' || link.href.endsWith('#')) { event.preventDefault(); toast('视频还没加载完成', '首次读取完成后会自动写入浏览器缓存。'); }
  });
}

function r5RenderProjects() {
  const list = orderedDrafts();
  $('project-list').innerHTML = list.length ? list.map(d => {
    const mode = r5ModeKey(d.lockedMode || d.mode);
    const workspace = d.workspaces?.[mode] || d;
    const count = mode === 'text_only' ? '纯文字' : `${workspace.frames?.length || d.frames?.length || 0} 张图`;
    return `<button class="project-item ${state.draft?.id === d.id ? 'active' : ''}" data-project="${d.id}">
      <strong>${escapeHtml(d.name)}</strong>
      <span><b class="project-mode-tag">${escapeHtml(r5ModeLabel(mode))}</b> · ${count} · ${new Date(d.createdAt || d.updatedAt || Date.now()).toLocaleString('zh-CN')}</span>
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
    if (!Number(workspace.cloudSyncedAt || 0) || Date.now() - Number(workspace.cloudSyncedAt || 0) > 5 * 60_000) {
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
  const draft = newDraft(key, inputName || `未命名 ${r5ModeSuffix(key)}项目`);
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
  const active = state.draft.segments.some(s => ['submitting','submitted','queued','running','processing'].includes(String(s.status || '').toLowerCase()));
  if (active) startPolling();
}

async function r5CreateProject() { r5OpenCreateModal(); }

async function r5RemoveProject() {
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

async function r5Init() {
  if (!await initSession()) return;
  wireEvents();
  r5WireCreateModal();
  enhanceCustomSelects();
  document.body.dataset.seedanceBuild = APP_BUILD;
  state.drafts = await r5MigrateDraftCollection(await listDrafts());
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

export function patchV46Source(source, { supabaseUrl, dbUrl }) {
  let patched = String(source || '');
  if (!patched.includes(ORIGINAL_BUILD)) throw new Error(`只支持 ${ORIGINAL_BUILD}，当前 app-v46.js 版本不匹配`);
  patched = patched.replace("from '../supabase-config.js'", `from '${supabaseUrl}'`)
    .replace("from './db.js'", `from '${dbUrl}'`).replace(ORIGINAL_BUILD, PRODUCTION_BUILD);

  const support = [r5ModeKey,r5ModeLabel,r5ModeSuffix,r5BaseProjectName,r5Clone,r5WorkspaceHasContent,r5CreateWorkspaceClone,
    r5BuildSplitDraft,r5MigrateDraftCollection,r5ContextSnapshot,r5ContextIsCurrent,r5ExactTaskIds,
    r53IsGenericProjectName,r53NormalizePrompt,r53PromptOverlap,r53ProjectCandidateScore,r5VerifyProjectId,
    r5ResolveFixedProject,r5TaskScore,r5OutputStableKey,r5CacheRequestUrl,r5ReadPersistentVideo,r5PrunePersistentVideoCache,
    r5WritePersistentVideo,r5OpenCreateModal,r5CloseCreateModal,r5CreateProjectFromMode,r5WireCreateModal].map(fn => fn.toString()).join('\n\n');

  patched = patched.replace("const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';",
    "const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';\n\n" + support);
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
  patched = replaceSection(patched, 'async function fetchVideoBlobThroughProxy(output) {', 'async function hydrateProxyVideoElements() {', renamedFunction(r5FetchVideoBlobThroughProxy, 'fetchVideoBlobThroughProxy'));
  patched = replaceSection(patched, 'async function hydrateProxyVideoElements() {', 'function outputCardMarkup(', renamedFunction(r5HydrateProxyVideoElements, 'hydrateProxyVideoElements'));
  patched = replaceSection(patched, 'async function recoverLatestDriveOutputWhenEmpty(force = false) {', 'function renderJobs() {', renamedFunction(r5RecoverLatestDriveOutputWhenEmpty, 'recoverLatestDriveOutputWhenEmpty'));
  patched = replaceSection(patched, 'function renderJobs() {', 'function findSegmentIdByOutputIndex(', renamedFunction(r5RenderJobs, 'renderJobs'));
  patched = replaceSection(patched, 'async function syncRemoteTasks() {', 'async function bindProviderTaskAndRecover(', renamedFunction(r5SyncRemoteTasks, 'syncRemoteTasks'));
  patched = replaceSection(patched, 'async function refreshJobs() {', 'async function loadOutputs() {', renamedFunction(r5RefreshJobs, 'refreshJobs'));
  patched = replaceSection(patched, 'async function loadOutputs() {', 'function startPolling() {', renamedFunction(r5LoadOutputs, 'loadOutputs'));
  patched = replaceSection(patched, 'async function init() {', 'init().catch(', renamedFunction(r5Init, 'init'));

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

  const generateSignature = 'async function generateSegments(segmentIds) {';
  patched = patched.replace(generateSignature, 'async function generateSegments(segmentIds, options = {}) {');
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
  const guard = `  if (!options.allowResubmit) {
    await loadOutputs(false).catch(() => {});
    const existing = segments.filter(segment => segmentHasExistingTask(segment) || (state.outputs || []).some(output => Number(output.index) === Number(segment.index)));
    if (existing.length) return toast('已阻止重复提交', '当前独立项目已经存在任务或视频。需要新版本时，请明确点击重新提交。');
  }
`;
  if (!patched.includes(autoReset)) throw new Error('无法定位旧自动重置代码');
  patched = patched.replace(autoReset, guard);
  patched = patched.replace("    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; });",
    "    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; if (options.allowResubmit) { s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; } });");
  patched = patched.replace('  await generateSegments([segment.id]);', '  await generateSegments([segment.id], { allowResubmit: true });');
  return `${patched}
//# sourceURL=seedance/app-production-runtime.js
`;
}

export async function bootProduction() {
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
