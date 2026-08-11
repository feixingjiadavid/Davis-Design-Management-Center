const PRODUCTION_BUILD = '20260811-jianying-tray-bridge-r53-2';
const ORIGINAL_BUILD = '20260728-blob-persistence-recovery-r8';
const ORIGINAL_FILE = './app-v46.js';

const R46_OBSOLETE_RUNTIME_CACHE_KEYS = Object.freeze([
  'seedance_app_v46_last_known_good_v1',
  'seedance_app_v46_last_known_good',
  'seedance_app_v46_source_cache_v1',
]);

function r46ClearObsoleteRuntimeCaches() {
  if (typeof localStorage === 'undefined') return;
  for (const key of R46_OBSOLETE_RUNTIME_CACHE_KEYS) {
    try { localStorage.removeItem(key); } catch {}
  }
}

r46ClearObsoleteRuntimeCaches();


/**
 * R32 FFmpeg Worker 同源兼容层。
 * 不再修改 app-v46.js 生成后的 mergeAll 源码。
 */
function r32ResolveWorkerUrl(scriptURL) {
  const raw = String(scriptURL || '');
  const isFfmpegClassWorker =
    /https:\/\/esm\.sh\/.*@ffmpeg\/ffmpeg@0\.12\.10.*\/worker(?:\.m?js)?(?:[?#].*)?$/i.test(raw) ||
    (/https:\/\/esm\.sh\//i.test(raw) && /@ffmpeg\/ffmpeg@0\.12\.10/i.test(raw) && /worker/i.test(raw));

  if (!isFfmpegClassWorker) return scriptURL;
  return new URL('./ffmpeg-class-worker.js?v=20260806-r32', import.meta.url);
}

function r32InstallFfmpegWorkerShim() {
  if (typeof globalThis === 'undefined' || typeof globalThis.Worker !== 'function') return;
  if (globalThis.__davisFfmpegWorkerShimR32) return;

  const NativeWorker = globalThis.Worker;

  class DavisWorkerR32 extends NativeWorker {
    constructor(scriptURL, options) {
      super(r32ResolveWorkerUrl(scriptURL), options);
    }
  }

  try { Object.setPrototypeOf(DavisWorkerR32, NativeWorker); } catch {}
  globalThis.Worker = DavisWorkerR32;
  globalThis.__davisFfmpegWorkerShimR32 = true;
  globalThis.__davisNativeWorkerR32 = NativeWorker;
}

r32InstallFfmpegWorkerShim();



const R44_INDEX_PROJECT_CATEGORIES = Object.freeze([
  "Smart文化-OpenTalk",
  "Smart文化-1024",
  "Smart文化-后勤小管家",
  "Smart文化-小蓝书运营",
  "Smart文化-送物机器人",
  "荣誉体系-即时激励",
  "荣誉体系-荣誉奖项",
  "荣誉体系-AI奖项",
  "荣誉体系-最佳拍档",
  "荣誉体系-科技合作社",
  "荣誉体系-极客团",
  "年度大会-武汉",
  "年度大会-上海",
  "年度大会-行庆",
  "HR侧相关-周年庆",
  "HR侧相关-初八团拜",
  "工会相关-团建旅游",
  "工会相关-运动季",
  "工会相关-文体活动",
  "常规活动-新人入职",
  "常规活动-科技合规银监人行类支持",
  "常规活动-年决",
  "常规活动-管理团队活动",
  "常规活动-外籍员工支持",
  "品宣支持",
  "科技子支持",
  "行品宣设计对接",
  "部门-基科",
  "部门-数业",
  "部门-贷款",
  "部门-存款",
  "部门-企同",
  "部门-财富",
  "部门-政科",
  "部门-数发",
  "部门-安全",
  "部门-上海",
  "部门-武汉",
  "部门-成都",
  "部门-科管"
]);

function r43NormalizeCategory(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function r43InferHistoricalCategory(name) {
  const value = String(name || '').toLocaleLowerCase('zh-CN');
  if (value.includes('周年')) return 'HR侧相关-周年庆';
  if (value.includes('荣誉') || value.includes('激励')) return '荣誉体系-即时激励';
  if (value.includes('小蓝书')) return 'Smart文化-小蓝书运营';
  if (value.includes('团建') || value.includes('旅游')) return '工会相关-团建旅游';
  if (value.includes('opentalk') || value.includes('waic')) return 'Smart文化-OpenTalk';
  if (value.includes('机器人')) return 'Smart文化-送物机器人';
  if (value.includes('贷款')) return '部门-贷款';
  if (value.includes('财富')) return '部门-财富';
  if (value.includes('上海')) return '部门-上海';
  if (value.includes('成都')) return '部门-成都';
  return '其他';
}

function r43ProjectCategoryValue(draft = state.draft) {
  if (!draft) return '其他';
  return r43NormalizeCategory(draft.projectCategory || draft.project_category)
    || r43InferHistoricalCategory(draft.name)
    || '其他';
}

function r43IncomingProjectCategory() {
  const keys = ['project_category', 'project', 'category', 'design_project'];
  const readParams = raw => {
    try {
      const params = new URLSearchParams(raw || '');
      for (const key of keys) {
        const value = r43NormalizeCategory(params.get(key));
        if (value) return value;
      }
    } catch {}
    return '';
  };
  const direct = readParams(globalThis.location?.search || '');
  if (direct) return direct;

  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === location.origin) {
      const value = readParams(ref.search);
      if (value) return value;
    }
  } catch {}

  for (const key of ['davis_design_project', 'davis_project_category', 'design_project']) {
    try {
      const value = r43NormalizeCategory(sessionStorage.getItem(key));
      if (value) return value;
    } catch {}
  }
  return '';
}

function r43SyncCategoryCustomVisibility(focus = false) {
  const select = $('new-project-category');
  const wrap = $('new-project-category-custom-wrap');
  const input = $('new-project-category-custom');
  if (!select || !wrap) return;
  const custom = select.value === '__other__';
  wrap.hidden = !custom;
  if (custom && focus) setTimeout(() => input?.focus(), 0);
}

function r43ApplyCategoryOptions(payload, resetSelection = false) {
  const select = $('new-project-category');
  const custom = $('new-project-category-custom');
  if (!select) return;

  const currentValue = select.value;
  const currentCustom = r43NormalizeCategory(custom?.value);
  // R44：下拉选项必须与 index.html 的 PROJECT_LIST 一字不差、顺序一致。
  // Supabase RPC 负责返回建议值；即使 RPC 暂时失败，完整类别也不能缺失。
  const values = [...R44_INDEX_PROJECT_CATEGORIES];

  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  const other = document.createElement('option');
  other.value = '__other__';
  other.textContent = '其他（手动填写）';
  select.appendChild(other);

  const incoming = r43IncomingProjectCategory();
  const suggested = r43NormalizeCategory(payload?.suggested_category);
  let preferred = '';
  if (!resetSelection && currentValue && currentValue !== '__other__' && values.includes(currentValue)) {
    preferred = currentValue;
  } else if (!resetSelection && currentValue === '__other__' && currentCustom) {
    preferred = currentCustom;
  } else {
    preferred = incoming || suggested || '其他';
  }

  if (values.includes(preferred)) {
    select.value = preferred;
    if (custom) custom.value = '';
  } else {
    select.value = '__other__';
    if (custom) custom.value = preferred && preferred !== '其他' ? preferred : '';
  }
  r43SyncCategoryCustomVisibility(false);
}

async function r43LoadCategoryOptions(force = false, resetSelection = false) {
  r43LoadCategoryOptions.cache ||= null;
  r43LoadCategoryOptions.inflight ||= null;

  if (!force && r43LoadCategoryOptions.cache) {
    r43ApplyCategoryOptions(r43LoadCategoryOptions.cache, resetSelection);
    return r43LoadCategoryOptions.cache;
  }
  if (r43LoadCategoryOptions.inflight) {
    const data = await r43LoadCategoryOptions.inflight;
    r43ApplyCategoryOptions(data, resetSelection);
    return data;
  }

  const select = $('new-project-category');
  if (select && !r43LoadCategoryOptions.cache) {
    select.replaceChildren();
    const loading = document.createElement('option');
    loading.value = '__loading__';
    loading.textContent = '正在读取设计需求项目类别...';
    select.appendChild(loading);
  }

  r43LoadCategoryOptions.inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_video_project_category_options');
      if (error) throw error;
      const result = data && typeof data === 'object'
        ? data
        : { options: R44_INDEX_PROJECT_CATEGORIES.map(value => ({ value, label: value })), suggested_category: null, fallback: '其他', source: 'index.PROJECT_LIST' };
      r43LoadCategoryOptions.cache = result;
      return result;
    } catch (error) {
      console.warn('[Davis Video R44] project category options failed; using index PROJECT_LIST fallback', error);
      const fallback = { options: R44_INDEX_PROJECT_CATEGORIES.map(value => ({ value, label: value })), suggested_category: null, fallback: '其他', source: 'index.PROJECT_LIST' };
      r43LoadCategoryOptions.cache = fallback;
      return fallback;
    } finally {
      r43LoadCategoryOptions.inflight = null;
    }
  })();

  const data = await r43LoadCategoryOptions.inflight;
  r43ApplyCategoryOptions(data, resetSelection);
  return data;
}

function r43ProjectCategoryFromControls() {
  const select = $('new-project-category');
  const custom = $('new-project-category-custom');
  if (!select || select.value === '__loading__') return '其他';
  if (select.value === '__other__') {
    return r43NormalizeCategory(custom?.value) || '其他';
  }
  return r43NormalizeCategory(select.value) || '其他';
}



function r45SetProjectFieldError(inputId, errorId, message = '') {
  const input = $(inputId);
  const error = $(errorId);
  const hasError = Boolean(message);
  input?.classList.toggle('is-invalid', hasError);
  input?.setAttribute('aria-invalid', hasError ? 'true' : 'false');
  if (error) {
    error.hidden = !hasError;
    if (hasError) error.textContent = message;
  }
}

function r45ClearProjectCreateErrors() {
  r45SetProjectFieldError('new-project-category', 'new-project-category-error', '');
  r45SetProjectFieldError('new-project-category-custom', 'new-project-category-custom-error', '');
  r45SetProjectFieldError('new-project-name', 'new-project-name-error', '');
}

function r45ValidateProjectCreateFields() {
  r45ClearProjectCreateErrors();

  const select = $('new-project-category');
  const custom = $('new-project-category-custom');
  const nameInput = $('new-project-name');

  const selectValue = String(select?.value || '').trim();
  const customValue = r43NormalizeCategory(custom?.value);
  const nameValue = String(nameInput?.value || '').trim();

  const missing = [];
  let firstInvalid = null;

  if (!select || !selectValue || selectValue === '__loading__') {
    r45SetProjectFieldError(
      'new-project-category',
      'new-project-category-error',
      selectValue === '__loading__' ? '项目类别仍在加载，请稍后再选择。' : '请选择项目类别。'
    );
    missing.push('项目类别');
    firstInvalid ||= select;
  } else if (selectValue === '__other__' && !customValue) {
    r45SetProjectFieldError(
      'new-project-category-custom',
      'new-project-category-custom-error',
      '选择“其他”后必须填写自定义项目类别。'
    );
    missing.push('自定义项目类别');
    firstInvalid ||= custom;
  }

  if (!nameValue) {
    r45SetProjectFieldError(
      'new-project-name',
      'new-project-name-error',
      '请填写项目名称，不能使用未命名项目直接创建。'
    );
    missing.push('项目名称');
    firstInvalid ||= nameInput;
  }

  if (missing.length) {
    const unique = [...new Set(missing)];
    toast('请先填写生成归属', `${unique.join('、')}为必填项。填写完整后再创建项目。`);
    firstInvalid?.focus();
    return { ok:false, category:'', name:'', missing:unique };
  }

  return {
    ok:true,
    category:r43ProjectCategoryFromControls(),
    name:nameValue,
    missing:[],
  };
}



function r49ParentGroupIdForDraft(draft = state.draft) {
  return String(draft?.parentGroupId || draft?.parent_group_id || '').trim() || null;
}
function r49TaskDisplayName(draft = state.draft) {
  const direct = String(draft?.taskName || draft?.task_name || '').trim();
  if (direct) return direct;
  const mode = r5ModeKey(draft?.lockedMode || draft?.mode);
  return mode === 'first_last' ? '首尾帧任务' : (mode === 'text_only' ? '纯文字任务' : '多帧 Storyboard 任务');
}
function r49DefaultTaskName(mode, index = 1) {
  const n = String(Math.max(1, Number(index) || 1)).padStart(2,'0');
  const key = r5ModeKey(mode);
  return key === 'first_last' ? `首尾帧任务 ${n}` : (key === 'text_only' ? `纯文字任务 ${n}` : `多帧 Storyboard 任务 ${n}`);
}
function r49FindParentGroup(groupId) {
  return (state.projectGroups || []).find(group => String(group?.id) === String(groupId)) || null;
}
function r49ExpandedParentGroups() {
  try { return new Set(JSON.parse(localStorage.getItem('davis_video_expanded_parent_groups_v49') || '[]').map(String)); }
  catch { return new Set(); }
}
function r49SaveExpandedParentGroups(set) {
  try { localStorage.setItem('davis_video_expanded_parent_groups_v49', JSON.stringify([...set].slice(-300))); } catch {}
}
function r49ExpandParentGroup(groupId, expanded = true) {
  if (!groupId) return;
  const set = r49ExpandedParentGroups();
  if (expanded) set.add(String(groupId)); else set.delete(String(groupId));
  r49SaveExpandedParentGroups(set);
}

function r50TreeSelection() {
  const fallbackGroupId = r49ParentGroupIdForDraft(state.draft);
  const fallback = state.draft && fallbackGroupId
    ? { type:'task', groupId:String(fallbackGroupId), draftId:String(state.draft.id) }
    : { type:'project', groupId:'', draftId:'' };

  const current = state.r50TreeSelection;
  if (current && ['project','task'].includes(current.type)) return current;

  try {
    const raw = JSON.parse(localStorage.getItem('davis_video_tree_selection_v50') || 'null');
    if (raw && ['project','task'].includes(raw.type)) {
      state.r50TreeSelection = {
        type: raw.type,
        groupId: String(raw.groupId || ''),
        draftId: String(raw.draftId || ''),
      };
      return state.r50TreeSelection;
    }
  } catch {}

  state.r50TreeSelection = fallback;
  return fallback;
}

function r50SetTreeSelection(type, groupId, draftId = '') {
  const next = {
    type: type === 'project' ? 'project' : 'task',
    groupId: String(groupId || ''),
    draftId: type === 'project' ? '' : String(draftId || ''),
  };
  state.r50TreeSelection = next;
  try { localStorage.setItem('davis_video_tree_selection_v50', JSON.stringify(next)); } catch {}
  r50SyncDeleteButton();
  return next;
}

function r50SelectParentGroup(groupId) {
  const group = r49FindParentGroup(groupId);
  if (!group) return;
  r50SetTreeSelection('project', group.id, '');
  renderProjects();
}

function r50SyncDeleteButton() {
  const button = $('delete-project');
  if (!button) return;

  const selection = r50TreeSelection();
  if (selection.type === 'project' && selection.groupId) {
    const group = r49FindParentGroup(selection.groupId);
    button.textContent = '删除当前项目';
    const foreign = Boolean(group && String(group.owner_id || '') !== String(state.user?.id || ''));
    button.disabled = !group || foreign;
    button.title = foreign ? '其他用户的项目仅允许查看' : '删除当前一级项目及其子任务入口';
    return;
  }

  button.textContent = '删除当前任务';
  const draft = state.draft;
  const writable = Boolean(draft) && r16CurrentProjectWritable(draft);
  button.disabled = !writable;
  button.title = draft && !writable ? '其他用户的任务仅允许查看' : '删除当前子生成任务';
}

function r50SetChildTaskNameError(message = '') {
  const input = $('new-child-task-name');
  const error = $('new-child-task-name-error');
  const hasError = Boolean(message);
  input?.classList.toggle('is-invalid', hasError);
  input?.setAttribute('aria-invalid', hasError ? 'true' : 'false');
  if (error) {
    error.hidden = !hasError;
    if (hasError) error.textContent = message;
  }
}

function r50ValidateChildTaskName() {
  const input = $('new-child-task-name');
  const value = String(input?.value || '').trim();
  if (value) {
    r50SetChildTaskNameError('');
    return value;
  }
  r50SetChildTaskNameError('请填写任务名称后再选择生成模式。');
  toast('请填写任务名称', '任务名称为必填项。填写后才能创建首尾帧、多帧 Storyboard 或纯文字任务。');
  input?.focus();
  return '';
}

async function r50RemoveParentProject(groupId) {
  const group = r49FindParentGroup(groupId);
  if (!group) return toast('删除失败','没有找到当前一级项目，请刷新后重试。');
  if (String(group.owner_id || '') !== String(state.user?.id || '')) return toast('只读项目','不能删除其他用户的一级项目。');

  const children = r49GroupChildren(group.id);
  if (!await confirmBox(
    '删除当前项目',
    `确定删除“${group.name}”吗？该项目下 ${children.length} 个生成任务会一并从项目树移除；已生成的视频、Ark 任务和输出记录仍保留在云端历史记录中。`
  )) return;

  const ownerId = String(group.owner_id || state.user.id);

  const childCloud = await supabase.from('video_projects')
    .update({ status:'deleted', updated_at:new Date().toISOString() })
    .eq('owner_id', ownerId)
    .eq('parent_group_id', group.id)
    .neq('status','deleted');
  if (childCloud.error) {
    console.error('[Davis Video R50] delete project children failed', childCloud.error);
    return toast('删除失败', errorMessage(childCloud.error,'项目下子任务删除失败，请重试。'));
  }

  const parentCloud = await supabase.from('video_project_groups')
    .update({ status:'deleted', updated_at:new Date().toISOString() })
    .eq('id', group.id)
    .eq('owner_id', ownerId)
    .select('id,status')
    .maybeSingle();
  if (parentCloud.error || !parentCloud.data || String(parentCloud.data.status || '').toLowerCase() !== 'deleted') {
    console.error('[Davis Video R50] delete parent project failed', parentCloud.error || parentCloud.data);
    return toast('删除失败', parentCloud.error ? errorMessage(parentCloud.error,'一级项目删除失败') : '一级项目没有成功标记为已删除，请重试。');
  }

  const deletedIds = new Set(children.map(draft => String(draft.id)));
  for (const draft of children) {
    const mode = r5ModeKey(draft.lockedMode || draft.mode);
    const workspace = draft.workspaces?.[mode] || draft;
    (workspace.frames || []).forEach(frame => frame?.id && releaseFrameUrl(frame.id));
    (workspace.referenceAssets || []).forEach(asset => asset?.id && releaseFrameUrl(asset.id));
    try { await deleteDraft(draft.id); } catch (error) {
      console.warn('[Davis Video R50] local child cleanup failed', draft.id, error);
    }
  }

  state.drafts = (state.drafts || []).filter(draft => !deletedIds.has(String(draft.id)));
  state.projectGroups = (state.projectGroups || []).filter(item => String(item.id) !== String(group.id));
  const expanded = r49ExpandedParentGroups();
  expanded.delete(String(group.id));
  r49SaveExpandedParentGroups(expanded);

  if (state.draft && deletedIds.has(String(state.draft.id))) {
    state.draft = null;
    state.outputs = [];
    state.outputHistory = [];
    state.jobs = [];
  }

  const nextDraft = orderedDrafts()[0] || null;
  if (nextDraft) {
    const nextGroupId = r49ParentGroupIdForDraft(nextDraft);
    r50SetTreeSelection('task', nextGroupId, nextDraft.id);
    await selectDraft(nextDraft.id);
  } else {
    const nextGroup = (state.projectGroups || [])[0] || null;
    if (nextGroup) r50SetTreeSelection('project', nextGroup.id, '');
    else {
      state.r50TreeSelection = { type:'project', groupId:'', draftId:'' };
      try { localStorage.removeItem('davis_video_tree_selection_v50'); } catch {}
    }
    renderProjects();
    r49RenderTaskContext();
    r50SyncDeleteButton();
  }

  toast('项目已删除', `“${group.name}”及其子任务入口已从项目树移除。`);
}

async function r50DeleteSelectedNode() {
  const selection = r50TreeSelection…45987 tokens truncated…throwOnDeny] of [
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

  patched = patched.replace("  $('new-project').onclick = createProject;", "  $('new-project').onclick = r49OpenParentModal;");
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

  patched = patched.replaceAll(
    "      mime_type: item.type,\n      usage: 'free_prompt_reference',",
    "      mime_type: item.type,\n      duration_seconds: Number(item.durationSeconds || item.duration_seconds || 0) || null,\n      usage: 'free_prompt_reference',"
  );

  const framePromptModeMarker = "    prompt_mode: isTextOnly ? 'text_reference_video_v14' : 'strict_frame_lock_v14',";
  const framePromptModeReplacement = "    prompt_mode: isTextOnly ? 'text_reference_video_v14' : 'strict_first_last_client_v28',";
  if (!patched.includes(framePromptModeMarker)) throw new Error('无法定位首尾帧 prompt_mode');
  patched = patched.replace(framePromptModeMarker, framePromptModeReplacement);

  const frameLockBodyMarker = "    frame_fit_mode: state.draft.fitMode,\n    final_width: Number(state.draft.finalWidth),";
  const frameLockBodyReplacement = "    frame_fit_mode: state.draft.fitMode,\n    frame_lock_policy: isTextOnly ? null : 'strict_first_last_server_v2',\n    storyboard_parent_mode: state.draft.mode,\n    segment_position: Number(segment.index || 0),\n    final_width: Number(state.draft.finalWidth),";
  if (!patched.includes(frameLockBodyMarker)) throw new Error('无法定位首尾帧提交元数据');
  patched = patched.replace(frameLockBodyMarker, frameLockBodyReplacement);

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
  const destructiveFrameReset = `        frame.remoteAssetId = null;
        frame.remotePath = null;
        frame.arkSafeVersion = null;
        frame.wasAspectPadded = false;`;
  const safeFrameReset = `        // R27：保留旧 asset/path 作为原图恢复来源；只让安全版本失效，强制重新补边上传。
        // 新安全 asset 写入成功后 uploadFrame 才替换绑定，避免 persist() 在上传前卡死。
        frame.arkSafeVersion = null;
        frame.wasAspectPadded = false;`;
  if (!patched.includes(destructiveFrameReset)) throw new Error('无法定位旧的强制图片重传清理逻辑');
  patched = patched.replace(destructiveFrameReset, safeFrameReset);
  const oldGenerateCatch = `  } catch (error) {
    const message = errorMessage(error, '提交失败');
    segments.forEach(segment => {
      if (['preparing','uploading','submitting','submitted','queued'].includes(segment.status)) {
        segment.status = 'failed';
        segment.progress = 0;
        segment.error = message;
      }
    });`;
  const newGenerateCatch = `  } catch (error) {
    const message = errorMessage(error, '提交失败');
    segments.forEach(segment => {
      if (!['completed','succeeded','success','running','processing','generating','uploading_drive'].includes(String(segment.status || '').toLowerCase())) {
        segment.status = 'failed';
        segment.progress = 0;
        segment.uploadStage = null;
        segment.error = message;
      }
    });`;
  if (!patched.includes(oldGenerateCatch)) throw new Error('无法定位生成失败反馈逻辑');
  patched = patched.replace(oldGenerateCatch, newGenerateCatch);
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
      toast('将在当前任务新增生成', '当前子任务已有历史任务或视频；本次生成仍归属于当前子任务，不会创建新的一级项目或 V-N 项目。');
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
  const r37PaidConfirm = `  const modelIssue = segments.map(segment => r37ValidateSegmentConfig(segment)).find(Boolean);
  if (modelIssue) return toast('当前模型配置不可提交', modelIssue);
  const costRows = segments.map(segment => r37EstimateCost(segment));
  const estimatedTotal = costRows.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const lowerBoundCost = costRows.some(item => item.lowerBound);
  const costSummary = costRows.map((item, index) => 'SEG ' + String(index + 1).padStart(2,'0') + '：' + item.model + ' · ' + item.duration + 's · ' + (item.resolution === '4k' ? '4K' : item.resolution.toUpperCase()) + ' · ' + item.inputLabel + ' · ' + (item.generateAudio ? '有声' : '无声') + ' ≈ ¥' + item.cost.toFixed(2)).join('；');
  if (!await confirmBox('确认提交真实任务', '将提交 ' + segments.length + ' 个视频片段。\\n\\n本次预估费用' + (lowerBoundCost ? '至少' : '约') + ' ¥' + estimatedTotal.toFixed(2) + '。\\n' + costSummary + '\\n\\n最终费用以 Ark usage / 火山方舟账单为准。')) return;`;
  patched = patched.replace(versionForkMarker, r37PaidConfirm);
  const r37ConfirmEndMarker = "  if (!await confirmBox('确认提交真实任务', '将提交 ' + segments.length + ' 个视频片段。\\n\\n本次预估费用' + (lowerBoundCost ? '至少' : '约') + ' ¥' + estimatedTotal.toFixed(2) + '。\\n' + costSummary + '\\n\\n最终费用以 Ark usage / 火山方舟账单为准。')) return;";
  if (!patched.includes(r37ConfirmEndMarker)) throw new Error('无法定位 R37 费用确认点');
  patched = patched.replace(r37ConfirmEndMarker, r37ConfirmEndMarker + '\n' + "  if (state.draft?.pendingVersionFork) {\n    try {\n      const versionFork = await r6ForkCurrentDraftForSubmit(segmentIds);\n      if (versionFork) {\n        segmentIds = versionFork.segmentIds;\n        segments = state.draft.segments.filter(segment => segmentIds.includes(segment.id));\n        options = { ...options, allowResubmit: false, versionForked: true };\n        if (!segments.length) return toast('无法创建新版本任务', '新版本中没有找到要提交的片段。');\n      }\n    } catch (error) {\n      console.error('[Davis Video Studio] version fork failed', error);\n      return toast('新版本创建失败', errorMessage(error, '无法创建独立版本，请稍后重试'));\n    }\n  }");
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
  patched = replaceSection(
    patched,
    'async function recoverRemoteFrameAsset(frame, projectId, order) {',
    'async function uploadFrame(frame, projectId, order) {',
    renamedFunction(r25RecoverRemoteFrameAsset, 'recoverRemoteFrameAsset')
  );
  patched = replaceSection(
    patched,
    'async function uploadFrame(frame, projectId, order) {',
    'async function uploadNeededFrames(segmentIds) {',
    renamedFunction(r25UploadFrame, 'uploadFrame')
  );
  // R25：保留 app-v46.js 的 makeArkSafeFrameBlob 自动补边，不再把原始超宽/超高图片绕过预处理直接上传。
  // R29：纯文字参考素材提示已内置到 r28BuildStrictFrameLockPrompt；禁止再对已替换函数做二次 marker patch。
  return `${patched}
//# sourceURL=seedance/app-production-runtime.js
`;
}

export async function bootProduction() {
  r46ClearObsoleteRuntimeCaches();
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
  const r46Boot = async () => {
    try {
      await bootProduction();
    } catch (error) {
      const message = String(error?.message || error);
      const quotaFailure = /quota|exceeded.*storage|setItem.*Storage/i.test(message);
      if (quotaFailure && !globalThis.__davisR46QuotaRetry) {
        globalThis.__davisR46QuotaRetry = true;
        r46ClearObsoleteRuntimeCaches();
        console.warn('[Davis Video Studio R50] storage quota during boot; legacy cache cleared, retrying once');
        await bootProduction();
        return;
      }
      throw error;
    }
  };

  r46Boot().catch(error => {
    console.error('[Davis Video Studio R50] boot failed', error);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:20px;z-index:99999;background:#220b12;color:#fff;border:1px solid #ff6075;border-radius:14px;padding:20px;font:14px/1.6 system-ui;overflow:auto';
    box.innerHTML = `<strong>Davis Video 启动失败</strong><br>${String(error?.message || error).replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}<br><br>请保留 seedance/app-v46.js，并覆盖本包中的 ai-assistant.html 与 seedance/app.js；随后 Ctrl+F5 强制刷新。`;
    document.body.appendChild(box);
  });
}

