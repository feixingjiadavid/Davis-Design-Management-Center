const PRODUCTION_BUILD = '20260807-tree-selection-collapse-r50';
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
    preferred = incoming || suggested || values[0] || '其他';
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
  return mode === 'first_last' ? '首尾帧任务' : (mode === 'text_only' ? '纯文字任务' : '多帧任务');
}
function r49DefaultTaskName(mode, index = 1) {
  const n = String(Math.max(1, Number(index) || 1)).padStart(2,'0');
  const key = r5ModeKey(mode);
  return key === 'first_last' ? `首尾帧任务 ${n}` : (key === 'text_only' ? `纯文字任务 ${n}` : `多帧任务 ${n}`);
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
  toast('请填写任务名称', '任务名称为必填项。填写后才能创建首尾帧、多帧或纯文字任务。');
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
  const selection = r50TreeSelection();
  if (selection.type === 'project' && selection.groupId) {
    return r50RemoveParentProject(selection.groupId);
  }
  return r49RemoveTask();
}


function r49GroupChildren(groupId) {
  return (state.drafts || []).filter(draft => String(r49ParentGroupIdForDraft(draft) || '') === String(groupId || ''))
    .sort((a,b) => Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0));
}
async function r49LoadParentGroups() {
  if (!state.user?.id) return [];
  const { data, error } = await supabase.from('video_project_groups')
    .select('id,owner_id,name,project_category,status,created_at,updated_at,metadata')
    .neq('status','deleted').order('updated_at',{ascending:false}).limit(1000);
  if (error) { console.warn('[Davis Video R50] load parent groups failed', error); return state.projectGroups || []; }
  state.projectGroups = Array.isArray(data) ? data : [];
  return state.projectGroups;
}
async function r49EnsureDraftParentBindings(drafts) {
  const list = Array.isArray(drafts) ? drafts : [];
  state.projectGroups ||= [];
  for (const draft of list) {
    if (!draft) continue;
    let groupId = r49ParentGroupIdForDraft(draft);
    let group = groupId ? r49FindParentGroup(groupId) : null;
    if (!groupId) {
      const legacyName = String(r5BaseProjectName(draft.name) || draft.name || '历史生成项目').trim();
      group = state.projectGroups.find(item => String(item?.owner_id || '') === String(draft.ownerId || state.user?.id || '') && r14NormalizeProjectName(item?.name) === r14NormalizeProjectName(legacyName)) || null;
      if (!group && String(draft.ownerId || state.user?.id || '') === String(state.user?.id || '')) {
        const insert = await supabase.from('video_project_groups').insert({
          owner_id:state.user.id,name:legacyName,project_category:r43ProjectCategoryValue(draft),status:'active',
          metadata:{created_from_local_legacy_draft:true,local_draft_id:draft.id}
        }).select().single();
        if (!insert.error && insert.data) { group = insert.data; state.projectGroups.unshift(group); }
        else {
          const existing = await supabase.from('video_project_groups').select('id,owner_id,name,project_category,status,created_at,updated_at,metadata')
            .eq('owner_id',state.user.id).ilike('name',legacyName).neq('status','deleted').limit(1).maybeSingle();
          if (!existing.error && existing.data) { group = existing.data; if (!state.projectGroups.some(item => item.id === group.id)) state.projectGroups.unshift(group); }
        }
      }
      if (group) groupId = group.id;
    }
    if (groupId) {
      draft.parentGroupId = groupId; draft.parent_group_id = groupId;
      const resolved = group || r49FindParentGroup(groupId);
      if (resolved) { draft.parentProjectName = resolved.name; draft.projectCategory = r43NormalizeCategory(resolved.project_category) || r43ProjectCategoryValue(draft); }
    }
    draft.taskName = String(draft.taskName || draft.task_name || '').trim() || r49TaskDisplayName(draft);
    draft.task_name = draft.taskName;
    try { await saveDraft(draft); } catch {}
  }
  return list;
}
function r49RenderTaskContext() {
  const context = $('child-task-context');
  if (!context) return;
  if (!state.draft) { context.hidden = true; return; }
  const group = r49FindParentGroup(r49ParentGroupIdForDraft(state.draft));
  context.hidden = false;
  if ($('child-task-parent-title')) $('child-task-parent-title').textContent = group?.name || state.draft.parentProjectName || '未归类项目';
  if ($('child-task-title')) $('child-task-title').textContent = r49TaskDisplayName(state.draft);
  if ($('child-task-mode')) $('child-task-mode').textContent = r5ModeLabel(state.draft.lockedMode || state.draft.mode);
  if ($('new-child-task-current')) {
    $('new-child-task-current').disabled = Boolean(group && String(group.owner_id || '') !== String(state.user?.id || ''));
    $('new-child-task-current').onclick = () => r49OpenChildTaskModal(r49ParentGroupIdForDraft(state.draft));
  }
}
function r49RenderProjects() {
  const groups = [...(state.projectGroups || [])].filter(g => String(g?.status || 'active').toLowerCase() !== 'deleted')
    .sort((a,b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
  const expanded = r49ExpandedParentGroups();
  const selection = r50TreeSelection();
  const selectedGroupId = String(selection.groupId || '');
  const selectedDraftId = selection.type === 'task' ? String(selection.draftId || state.draft?.id || '') : '';

  $('project-list').innerHTML = groups.length ? groups.map(group => {
    const groupId = String(group.id);
    const children = r49GroupChildren(groupId);
    const isExpanded = expanded.has(groupId);
    const isSelectedGroup = selectedGroupId === groupId;
    const isProjectNodeSelected = isSelectedGroup && selection.type === 'project';
    const foreign = String(group.owner_id || '') !== String(state.user?.id || '');

    const childMarkup = children.length ? children.map(draft => {
      const mode = r5ModeKey(draft.lockedMode || draft.mode);
      const workspace = draft.workspaces?.[mode] || draft;
      const count = mode === 'text_only' ? '纯文字' : `${workspace.frames?.length || draft.frames?.length || 0} 张图`;
      const childActive = isSelectedGroup && selection.type === 'task' && selectedDraftId === String(draft.id);
      return `<button class="project-child ${childActive ? 'active' : ''}" data-project="${draft.id}" data-parent-group="${groupId}">
        <strong>${escapeHtml(r49TaskDisplayName(draft))}</strong>
        <span><i class="project-child-mode">${escapeHtml(r5ModeLabel(mode))}</i><span>${count}</span><span>·</span><span>${new Date(draft.createdAt || draft.updatedAt || Date.now()).toLocaleString('zh-CN')}</span></span>
      </button>`;
    }).join('') : '<div class="project-child-empty">还没有生成任务</div>';

    return `<div class="project-tree-group">
      <div class="project-parent-row ${isSelectedGroup ? 'is-active' : ''} ${isProjectNodeSelected ? 'is-project-selected' : ''}">
        <button class="project-parent-chevron-btn" type="button" data-toggle-parent="${groupId}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="${isExpanded ? '收起项目' : '展开项目'}"><span class="project-parent-chevron">▶</span></button>
        <button class="project-parent-main" type="button" data-select-parent="${groupId}">
          <span class="project-parent-copy"><strong>${escapeHtml(group.name || '未命名项目')}</strong><span>${escapeHtml(group.project_category || '其他')} · ${children.length} 个任务${foreign ? ' · 只读' : ''}</span></span>
        </button>
        <button class="project-parent-add" type="button" data-add-child="${groupId}" title="新建生成任务" ${foreign ? 'disabled' : ''}>＋</button>
      </div>
      <div class="project-child-list" ${isExpanded ? '' : 'hidden'}>${childMarkup}${foreign ? '' : `<button class="project-child-add" type="button" data-add-child="${groupId}">＋ 新建生成任务</button>`}</div>
    </div>`;
  }).join('') : '<div class="empty-state">还没有生成项目，请先点击“新建视频项目”。</div>';

  qsa('[data-toggle-parent]').forEach(btn => btn.onclick = event => {
    event.stopPropagation();
    const nextExpanded = btn.getAttribute('aria-expanded') !== 'true';
    r49ExpandParentGroup(btn.dataset.toggleParent, nextExpanded);
    renderProjects();
  });
  qsa('[data-select-parent]').forEach(btn => btn.onclick = () => r50SelectParentGroup(btn.dataset.selectParent));
  qsa('[data-add-child]').forEach(btn => btn.onclick = event => {
    event.stopPropagation();
    if (!btn.disabled) r49OpenChildTaskModal(btn.dataset.addChild);
  });
  qsa('[data-project]').forEach(btn => btn.onclick = () => {
    const draft = (state.drafts || []).find(item => String(item.id) === String(btn.dataset.project));
    const groupId = btn.dataset.parentGroup || r49ParentGroupIdForDraft(draft);
    r50SetTreeSelection('task', groupId, btn.dataset.project);
    void selectDraft(btn.dataset.project);
  });
  r50SyncDeleteButton();
}
function r49OpenParentModal() {
  const modal = $('project-mode-modal'); if (!modal) return;
  if ($('new-project-name')) $('new-project-name').value = '';
  if ($('new-project-category-custom')) $('new-project-category-custom').value = '';
  r45ClearProjectCreateErrors(); modal.hidden = false; void r43LoadCategoryOptions(false,true);
  setTimeout(() => $('new-project-name')?.focus(),0);
}
function r49CloseParentModal() { if ($('project-mode-modal')) $('project-mode-modal').hidden = true; }
async function r49CreateParentProject() {
  await r43LoadCategoryOptions(false,false);
  const validation = r45ValidateProjectCreateFields(); if (!validation.ok) return;
  const { data, error } = await supabase.from('video_project_groups').insert({
    owner_id:state.user.id,name:validation.name,project_category:validation.category,status:'active',
    metadata:{source:$('new-project-category')?.value === '__other__' ? 'manual_or_other' : 'design_request_project'}
  }).select().single();
  if (error || !data) {
    const duplicate = /duplicate|unique/i.test(String(error?.message || error || ''));
    toast(duplicate ? '项目名称已存在' : '创建项目失败', duplicate ? `“${validation.name}”已经存在，请展开该项目继续创建任务。` : errorMessage(error,'无法创建一级项目')); return;
  }
  state.projectGroups ||= []; state.projectGroups.unshift(data); r49ExpandParentGroup(data.id,true); r49CloseParentModal(); renderProjects(); r49OpenChildTaskModal(data.id);
  toast('项目已创建', `“${data.name}”已创建。现在可以在这个项目下面建立多个独立生成任务。`);
}
function r49OpenChildTaskModal(groupId) {
  const group = r49FindParentGroup(groupId); if (!group) return toast('无法创建任务','没有找到对应的一级项目，请刷新后重试。');
  if (String(group.owner_id || '') !== String(state.user?.id || '')) return toast('只读项目','不能在其他用户的项目下新增任务。');
  const modal = $('child-task-modal'); if (!modal) return; modal.dataset.parentGroupId = group.id;
  if ($('child-task-parent-name')) $('child-task-parent-name').textContent = group.name;
  if ($('new-child-task-name')) $('new-child-task-name').value = '';
  r50SetChildTaskNameError('');
  modal.hidden = false; setTimeout(() => $('new-child-task-name')?.focus(),0);
}
function r49CloseChildTaskModal() { if ($('child-task-modal')) $('child-task-modal').hidden = true; }
async function r49CreateChildTask(mode) {
  const modal = $('child-task-modal'), groupId = modal?.dataset.parentGroupId || '', group = r49FindParentGroup(groupId);
  if (!group) return toast('创建任务失败','一级项目不存在，请刷新后重试。');
  const key = r5ModeKey(mode), siblings = r49GroupChildren(group.id);
  const taskName = r50ValidateChildTaskName();
  if (!taskName) {
    const clicked = document.querySelector(`[data-create-child-mode="${key}"]`);
    if (clicked) {
      clicked.classList.remove('is-blocked-hint');
      void clicked.offsetWidth;
      clicked.classList.add('is-blocked-hint');
      setTimeout(() => clicked.classList.remove('is-blocked-hint'),360);
    }
    return;
  }
  if (siblings.some(item => r14NormalizeProjectName(r49TaskDisplayName(item)) === r14NormalizeProjectName(taskName))) {
    r50SetChildTaskNameError('这个项目下已经有同名任务，请换一个名称。');
    toast('任务名称已存在',`“${taskName}”已经在“${group.name}”项目下，请换一个名称。`);
    $('new-child-task-name')?.focus();
    return;
  }
  const remoteName = `${group.name} · ${taskName}`, draft = newDraft(key,remoteName,group.project_category);
  draft.parentGroupId = group.id; draft.parent_group_id = group.id; draft.parentProjectName = group.name; draft.taskName = taskName; draft.task_name = taskName; draft.taskOrder = siblings.length; draft.projectCategory = group.project_category; draft.projectCategorySource = 'parent_project'; draft.remoteProjectName = remoteName;
  await saveDraft(draft); state.drafts.unshift(draft); r49ExpandParentGroup(group.id,true);
  r50SetTreeSelection('task', group.id, draft.id);
  try { await supabase.from('video_project_groups').update({updated_at:new Date().toISOString()}).eq('id',group.id).eq('owner_id',state.user.id); } catch {}
  group.updated_at = new Date().toISOString(); r49CloseChildTaskModal(); await selectDraft(draft.id); setView('quick');
  toast('生成任务已创建',`“${taskName}”已创建为${r5ModeLabel(key)}任务，素材、提示词、生成记录和输出均独立保存。`);
}
function r49WireHierarchyUi() {
  if ($('new-project')) $('new-project').onclick = r49OpenParentModal;
  if ($('project-create-submit')) $('project-create-submit').onclick = r49CreateParentProject;
  if ($('project-mode-cancel')) $('project-mode-cancel').onclick = r49CloseParentModal;
  if ($('project-mode-modal')) $('project-mode-modal').onclick = event => { if (event.target === $('project-mode-modal')) { event.preventDefault(); event.stopPropagation(); } };
  qsa('[data-create-child-mode]').forEach(btn => btn.onclick = () => r49CreateChildTask(btn.dataset.createChildMode));
  if ($('child-task-cancel')) $('child-task-cancel').onclick = r49CloseChildTaskModal;
  if ($('child-task-modal')) $('child-task-modal').onclick = event => { if (event.target === $('child-task-modal')) { event.preventDefault(); event.stopPropagation(); } };
  if ($('new-project-category')) $('new-project-category').onchange = () => { r43SyncCategoryCustomVisibility(true); r45SetProjectFieldError('new-project-category','new-project-category-error',''); if ($('new-project-category').value !== '__other__') r45SetProjectFieldError('new-project-category-custom','new-project-category-custom-error',''); };
  if ($('new-project-category-custom')) $('new-project-category-custom').oninput = () => { if (r43NormalizeCategory($('new-project-category-custom').value)) r45SetProjectFieldError('new-project-category-custom','new-project-category-custom-error',''); };
  if ($('new-project-name')) $('new-project-name').oninput = () => { if (String($('new-project-name').value || '').trim()) r45SetProjectFieldError('new-project-name','new-project-name-error',''); };
  if ($('new-child-task-name')) $('new-child-task-name').oninput = () => { if (String($('new-child-task-name').value || '').trim()) r50SetChildTaskNameError(''); };
  if ($('delete-project')) $('delete-project').onclick = r50DeleteSelectedNode;
  r50SyncDeleteButton();
}
function r49RenderSettings() {
  $('project-name').value = r49TaskDisplayName(state.draft); $('project-name').readOnly = true; $('project-name').title = '当前子生成任务名称';
  $('project-ratio').value = state.draft.ratio; $('final-width').value = state.draft.finalWidth; $('final-height').value = state.draft.finalHeight; $('fit-mode').value = state.draft.fitMode;
  if ($('locked-mode-label')) $('locked-mode-label').textContent = r5ModeLabel(state.draft.mode);
  if ($('mode-lock-card')) $('mode-lock-card').dataset.mode = r5ModeKey(state.draft.mode);
  r49RenderTaskContext(); updateRatioTip(); renderTextModePanel(); syncCustomSelects();
}
function r50ApplySelectedTaskDom(draftId, groupId) {
  const root = $('project-list');
  if (!root) return;
  root.querySelectorAll('.project-child.active').forEach(node => node.classList.remove('active'));
  const task = root.querySelector(`.project-child[data-project="${CSS.escape(String(draftId || ''))}"]`);
  task?.classList.add('active');
  root.querySelectorAll('.project-parent-row').forEach(row => {
    const parentId = String(row.querySelector('[data-select-parent]')?.dataset?.selectParent || '');
    row.classList.toggle('is-active', Boolean(groupId) && parentId === String(groupId));
    row.classList.remove('is-project-selected');
  });
}

async function r49SelectDraft(id) {
  const draft = migrateDraftWorkspaces(await getDraft(id)); if (!draft) return;
  clearInterval(state.pollTimer); state.pollTimer = null; state.objectUrls.forEach(url => URL.revokeObjectURL(url)); state.objectUrls.clear();
  state.draft = draft; bindCurrentWorkspace(); normalizeSegments(state.draft); saveCurrentWorkspaceSelection();
  const groupId = r49ParentGroupIdForDraft(draft);
  r50SetTreeSelection('task', groupId, draft.id);
  localStorage.setItem(LAST_SELECTED_DRAFT_KEY,id);
  r50ApplySelectedTaskDom(draft.id, groupId);
  renderAll(); r49RenderTaskContext();
  document.dispatchEvent(new CustomEvent('davis-video-task-selected',{detail:{draftId:String(draft.id),groupId:String(groupId||'')}}));
  const workspace = getWorkspace();
  try { if (!Number(workspace.cloudSyncedAt || 0) || Date.now() - Number(workspace.cloudSyncedAt || 0) > 5 * 60_000) await loadOutputs(false); } catch (error) { console.warn('[Davis Video Studio R50] task sync failed', error); }
  renderAll(); r49RenderTaskContext(); r16ApplyReadOnlyControls(); r50SyncDeleteButton();
  const active = state.draft.segments.some(s => ['submitting','submitted','queued','running','processing'].includes(String(s.status || '').toLowerCase()));
  if (active && r16CurrentProjectWritable()) startPolling();
}
async function r49RemoveTask() {
  if (!r16AssertCurrentProjectWritable('删除生成任务')) return;
  if (!state.draft || !await confirmBox('删除生成任务',`确定删除“${r49TaskDisplayName(state.draft)}”吗？一级项目仍会保留；已生成的视频和任务记录仍保留在云端。`)) return;
  const id = state.draft.id, parentGroupId = r49ParentGroupIdForDraft(state.draft), workspace = getWorkspace();
  const remoteProjectId = workspace.remoteProjectId || state.draft.remoteProjectId || workspace.bindingCandidateProjectId || null, ownerId = r16ProjectOwnerId() || state.user?.id || '';
  if (remoteProjectId) {
    const { data, error } = await supabase.from('video_projects').update({status:'deleted',updated_at:new Date().toISOString()}).eq('id',remoteProjectId).eq('owner_id',ownerId).select('id,status').maybeSingle();
    if (error || !data || String(data.status || '').toLowerCase() !== 'deleted') { toast('删除失败',error ? errorMessage(error,'云端任务删除失败') : '云端任务没有成功标记为已删除，请重试。'); return; }
  }
  (workspace.frames || []).forEach(frame => releaseFrameUrl(frame.id)); (workspace.referenceAssets || []).forEach(asset => asset?.id && releaseFrameUrl(asset.id));
  await deleteDraft(id); state.drafts = state.drafts.filter(item => item.id !== id); if (localStorage.getItem(LAST_SELECTED_DRAFT_KEY) === id) localStorage.removeItem(LAST_SELECTED_DRAFT_KEY);
  state.draft = null; state.outputs = []; state.outputHistory = []; state.jobs = [];
  const sameParent = r49GroupChildren(parentGroupId);
  if (sameParent.length) {
    r50SetTreeSelection('task', parentGroupId, sameParent[0].id);
    await selectDraft(sameParent[0].id);
  } else if (parentGroupId && r49FindParentGroup(parentGroupId)) {
    r50SetTreeSelection('project', parentGroupId, '');
    renderProjects(); r49RenderTaskContext(); r50SyncDeleteButton();
  } else if (state.drafts.length) {
    await selectDraft(orderedDrafts()[0].id);
  } else {
    renderProjects(); r49RenderTaskContext(); r50SyncDeleteButton();
  }
}
async function r49RestoreCloudDrafts(localDrafts) {
  const local = (Array.isArray(localDrafts) ? [...localDrafts] : []).filter(draft => !draft?.deleted); if (!state.user?.id) return [];
  let projectQuery = supabase.from('video_projects').select('id,name,mode,owner_id,project_category,parent_group_id,task_name,task_order,created_at,updated_at,status');
  projectQuery = scopeVideoRead(projectQuery,state.user);
  const { data, error } = await projectQuery.order('created_at',{ascending:false}).limit(1000);
  if (error) { console.warn('[Davis Video R50] cloud task recovery skipped',error); return local; }
  const allProjects = data || [], deletedIds = new Set(allProjects.filter(p => String(p?.status || '').toLowerCase() === 'deleted').map(p => p.id).filter(Boolean));
  const projects = allProjects.filter(p => !deletedIds.has(p.id)), projectById = new Map(projects.map(p => [p.id,p])), cleanLocal = [];
  for (const draft of local) {
    const mode = r5ModeKey(draft.lockedMode || draft.mode), workspace = draft.workspaces?.[mode] || draft;
    const projectId = workspace.remoteProjectId || draft.remoteProjectId || workspace.bindingCandidateProjectId || null;
    if (projectId && deletedIds.has(projectId)) { try { await deleteDraft(draft.id); } catch {} continue; }
    const project = projectId ? projectById.get(projectId) : null;
    if (project) {
      draft.ownerId = project.owner_id; draft.remoteOwnerId = project.owner_id; workspace.ownerId = project.owner_id; workspace.remoteOwnerId = project.owner_id;
      if (project.project_category) draft.projectCategory = project.project_category;
      if (project.parent_group_id) { draft.parentGroupId = project.parent_group_id; draft.parent_group_id = project.parent_group_id; const group = r49FindParentGroup(project.parent_group_id); if (group) draft.parentProjectName = group.name; }
      draft.taskName = String(project.task_name || draft.taskName || '').trim() || r49TaskDisplayName(draft); draft.task_name = draft.taskName; draft.taskOrder = Number(project.task_order || draft.taskOrder || 0);
      try { await saveDraft(draft); } catch {}
    }
    cleanLocal.push(draft);
  }
  const drafts = cleanLocal.filter(draft => { const ownerId = r16ProjectOwnerId(draft); return isVideoSuperAdmin(state.user) || !ownerId || ownerId === state.user.id; });
  const bound = new Set();
  for (const draft of drafts) { if (draft.remoteProjectId) bound.add(draft.remoteProjectId); for (const workspace of Object.values(draft.workspaces || {})) { if (workspace?.remoteProjectId) bound.add(workspace.remoteProjectId); if (workspace?.bindingCandidateProjectId) bound.add(workspace.bindingCandidateProjectId); } }
  for (const project of projects) {
    if (!project?.id || bound.has(project.id)) continue;
    const mode = r5ModeKey(project.mode), group = r49FindParentGroup(project.parent_group_id), taskName = String(project.task_name || '').trim() || r49DefaultTaskName(mode,1);
    const draft = newDraft(mode,project.name || `${group?.name || '云端项目'} · ${taskName}`,project.project_category || group?.project_category || null), workspace = draft.workspaces[mode];
    draft.id = `cloud-${project.id}`; draft.ownerId = project.owner_id; draft.remoteOwnerId = project.owner_id; draft.remoteProjectId = project.id; draft.remoteProjectName = project.name || draft.name;
    draft.parentGroupId = project.parent_group_id || null; draft.parent_group_id = project.parent_group_id || null; draft.parentProjectName = group?.name || ''; draft.taskName = taskName; draft.task_name = taskName; draft.taskOrder = Number(project.task_order || 0);
    draft.createdAt = new Date(project.created_at || Date.now()).getTime(); draft.updatedAt = new Date(project.updated_at || project.created_at || Date.now()).getTime(); draft.cloudRecoveredProject = true;
    workspace.ownerId = project.owner_id; workspace.remoteOwnerId = project.owner_id; workspace.remoteProjectId = project.id; workspace.bindingCandidateProjectId = project.id; workspace.remoteBindingSchema = 'r49-child-task'; workspace.remoteBindingVersion = 'r49'; workspace.remoteBindingLocked = true; workspace.cloudSyncedAt = 0;
    try { await saveDraft(draft); drafts.push(draft); bound.add(project.id); } catch (saveError) { console.warn('[Davis Video R50] failed to cache cloud child task',project.id,saveError); }
  }
  return drafts.sort((a,b) => Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0));
}

async function r49ReEditSegment(segmentId) {
  if (!r16AssertCurrentProjectWritable('重新编辑')) return;
  if (!segmentId) { toast('无法定位片段','这个输出没有找到对应片段，请在编辑详情中手动选择。'); setView('editor'); return; }
  const segment = state.draft.segments.find(item => item.id === segmentId || item.remoteTaskId === segmentId);
  if (!segment) { toast('无法定位片段','当前生成任务没有找到对应片段，请确认打开的是正确子任务。'); setView('editor'); return; }
  state.draft.pendingVersionFork = null;
  state.selectedSegmentId = segment.id;
  saveCurrentWorkspaceSelection();
  await persist();
  setView('editor');
  renderEditor();
  toast('已回到编辑页','修改后再次生成仍保留在当前子任务中，不会自动创建新的 V-N 项目。');
}

async function r49Init() {
  if (!await initSession()) return; void r38LoadUsageSummary(true); wireEvents();
  const usageModal = $('personal-usage-modal'), usageOpen = $('personal-usage-open'), usageClose = $('personal-usage-close'), usageBackdrop = $('personal-usage-backdrop');
  const closeUsage = () => { if (!usageModal) return; usageModal.hidden = true; usageModal.setAttribute('aria-hidden','true'); usageOpen?.setAttribute('aria-expanded','false'); document.body.classList.remove('usage-modal-open'); };
  const openUsage = () => { if (!usageModal) return; usageModal.hidden = false; usageModal.setAttribute('aria-hidden','false'); usageOpen?.setAttribute('aria-expanded','true'); document.body.classList.add('usage-modal-open'); void r38LoadUsageSummary(false); };
  usageOpen?.addEventListener('click',openUsage); usageClose?.addEventListener('click',closeUsage); usageBackdrop?.addEventListener('click',closeUsage);
  window.addEventListener('keydown',event => { if (event.key === 'Escape' && usageModal && !usageModal.hidden) closeUsage(); });
  r49WireHierarchyUi(); enhanceCustomSelects(); document.body.dataset.seedanceBuild = APP_BUILD;
  state.projectGroups = await r49LoadParentGroups();
  state.drafts = await r49RestoreCloudDrafts(await r5MigrateDraftCollection(await listDrafts()));
  state.drafts = await r49EnsureDraftParentBindings(state.drafts);
  await r49LoadParentGroups(); renderProjects();
  if (!state.drafts.length) {
    r49RenderTaskContext();
    if (state.projectGroups.length) r50SetTreeSelection('project', state.projectGroups[0].id, '');
    else r49OpenParentModal();
    renderProjects(); r50SyncDeleteButton();
    return;
  }
  const last = localStorage.getItem(LAST_SELECTED_DRAFT_KEY), initial = state.drafts.find(d => d.id === last) || orderedDrafts()[0];
  await selectDraft(initial.id); setView('quick');
}


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
  if (state.draft) state.draft.pendingVersionFork = null;
  return false;
}

async function r6ExistingProjectNames() {
  if (!state.user?.id) throw new Error('用户会话已失效，无法分配新版本名称');
  const { data, error } = await supabase
    .from('video_projects')
    .select('name,status')
    .eq('owner_id', state.user.id)
    .neq('status', 'deleted')
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
    toast('无法定位片段', '这个输出没有找到对应片段，请在编辑详情中手动选择。');
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
  if (key === 'text_only') return '纯文字';
  return '多帧';
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

function r5NewDraft(mode = 'multi_frame', name = '', projectCategory = null) {
  const key = r5ModeKey(mode);
  const id = uid();
  const workspace = createWorkspaceState();
  workspace.ownerId = state.user?.id || null;
  workspace.remoteOwnerId = null;
  const displayName = String(name || '').trim() || `未命名 ${r5ModeSuffix(key)}项目`;
  const category = r43NormalizeCategory(projectCategory) || r43InferHistoricalCategory(displayName) || '其他';
  return {
    id,
    name: displayName,
    remoteProjectName: displayName,
    projectCategory: category,
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
  draft.projectCategory = r43NormalizeCategory(draft.projectCategory || draft.project_category)
    || r43InferHistoricalCategory(draft.name)
    || '其他';
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
    .select('id,name,mode,owner_id,project_category,created_at,updated_at,status')
    .eq('owner_id', r16ProjectOwnerId())
    .eq('id', projectId)
    .maybeSingle();
  if (!r5ContextIsCurrent(snapshot)) return null;
  if (error || !data || String(data.status || '').toLowerCase() === 'deleted' || r5ModeKey(data.mode) !== mode) return null;
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
      .select('id,name,mode,owner_id,project_category,created_at,updated_at,status')
      .eq('owner_id', r16ProjectOwnerId())
      .neq('status', 'deleted')
      .in('id', list);
    if (!r5ContextIsCurrent(snapshot) || error) return;
    for (const project of data || []) {
      if (r5ModeKey(project.mode) === mode) candidateMap.set(project.id, project);
    }
  }

  await addProjectsByIds([...exactProjectIds, existingProjectId]);

  if (baseName) {
    const { data, error } = await supabase.from('video_projects')
      .select('id,name,mode,owner_id,project_category,created_at,updated_at,status')
      .eq('owner_id', r16ProjectOwnerId())
      .neq('status', 'deleted')
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
        .select('id,name,mode,owner_id,project_category,created_at,updated_at,status')
        .eq('owner_id', r16ProjectOwnerId())
        .neq('status', 'deleted')
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
  const resolvedCategory = r43NormalizeCategory(project.project_category);
  const categoryChanged = Boolean(resolvedCategory && resolvedCategory !== r43ProjectCategoryValue(state.draft));
  if (resolvedCategory) state.draft.projectCategory = resolvedCategory;

  if (changed || categoryChanged) await saveDraft(state.draft);
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

      const existingStatusLower = String(existing?.status || '').toLowerCase();
      const preserveLocalFailureOrSubmit = new Set([
        'preparing','uploading','submitting','retrying',
        'failed','error','charged_unknown','provider_failed','provider_policy_blocked'
      ]).has(existingStatusLower);

      const segment = {
        ...(existing || {}),
        id: existing?.id || uid(),
        fromFrameId: existing?.fromFrameId || null,
        toFrameId: existing?.toFrameId || null,
        prompt: String(existing?.prompt || '').trim() ? existing.prompt : (representative?.prompt || ''),
        duration: Number(existing?.duration || representative?.duration || 4),
        model: existing?.model || representative?.model_alias || chosenTask?.model_alias || 'mini',
        resolution: existing?.resolution || representative?.resolution || '720p',
        status: preserveLocalFailureOrSubmit ? existing.status : (chosenTask?.status || representative?.status || existing?.status || 'draft'),
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
        model: 'v20',
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
  const custom = $('new-project-category-custom');
  if (custom) custom.value = '';
  r45ClearProjectCreateErrors();
  const cancel = $('project-mode-cancel');
  if (cancel) cancel.hidden = !(state.drafts || []).length;
  modal.hidden = false;
  void r43LoadCategoryOptions(false, true);
  setTimeout(() => input?.focus(), 0);
}

function r5CloseCreateModal() {
  if ($('project-mode-modal')) $('project-mode-modal').hidden = true;
}

async function r5CreateProjectFromMode(mode) {
  const key = r5ModeKey(mode);
  await r43LoadCategoryOptions(false, false);

  const validation = r45ValidateProjectCreateFields();
  if (!validation.ok) {
    const clicked = document.querySelector(`[data-create-project-mode="${key}"]`);
    if (clicked) {
      clicked.classList.remove('is-blocked-hint');
      void clicked.offsetWidth;
      clicked.classList.add('is-blocked-hint');
      setTimeout(() => clicked.classList.remove('is-blocked-hint'), 360);
    }
    return;
  }

  const category = validation.category;
  const displayName = validation.name;

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

  const draft = newDraft(key, displayName, category);
  draft.projectCategorySource = $('new-project-category')?.value === '__other__' ? 'manual_or_other' : 'design_request_project';
  await saveDraft(draft);
  state.drafts.unshift(draft);
  r5CloseCreateModal();
  await selectDraft(draft.id);
  setView('quick');
}

function r5WireCreateModal() {
  if ($('new-project')) $('new-project').onclick = r5OpenCreateModal;
  qsa('[data-create-project-mode]').forEach(btn => btn.onclick = () => r5CreateProjectFromMode(btn.dataset.createProjectMode));

  if ($('new-project-category')) {
    $('new-project-category').onchange = () => {
      r43SyncCategoryCustomVisibility(true);
      r45SetProjectFieldError('new-project-category', 'new-project-category-error', '');
      if ($('new-project-category').value !== '__other__') {
        r45SetProjectFieldError('new-project-category-custom', 'new-project-category-custom-error', '');
      }
    };
  }

  if ($('new-project-category-custom')) {
    $('new-project-category-custom').oninput = () => {
      if (r43NormalizeCategory($('new-project-category-custom').value)) {
        r45SetProjectFieldError('new-project-category-custom', 'new-project-category-custom-error', '');
      }
    };
  }

  if ($('new-project-name')) {
    $('new-project-name').oninput = () => {
      if (String($('new-project-name').value || '').trim()) {
        r45SetProjectFieldError('new-project-name', 'new-project-name-error', '');
      }
    };
  }

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
  if (!state.draft || !await confirmBox('删除项目', `确定删除“${state.draft.name}”吗？删除后不会再出现在项目列表；已生成的视频和任务记录仍保留在云端。`)) return;

  const id = state.draft.id;
  const workspace = getWorkspace();
  const remoteProjectId = workspace.remoteProjectId || state.draft.remoteProjectId || workspace.bindingCandidateProjectId || null;
  const ownerId = r16ProjectOwnerId() || state.user?.id || '';

  if (remoteProjectId) {
    const { data, error } = await supabase
      .from('video_projects')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', remoteProjectId)
      .eq('owner_id', ownerId)
      .select('id,status')
      .maybeSingle();

    if (error || !data || String(data.status || '').toLowerCase() !== 'deleted') {
      console.error('[Davis Video] delete cloud project failed', error || data);
      toast('删除失败', error ? errorMessage(error, '云端项目删除失败') : '云端项目没有成功标记为已删除，请重试。');
      return;
    }
  }

  (workspace.frames || []).forEach(frame => releaseFrameUrl(frame.id));
  (workspace.referenceAssets || []).forEach(asset => asset?.id && releaseFrameUrl(asset.id));
  await deleteDraft(id);
  state.drafts = state.drafts.filter(item => item.id !== id);
  if (localStorage.getItem(LAST_SELECTED_DRAFT_KEY) === id) localStorage.removeItem(LAST_SELECTED_DRAFT_KEY);
  state.draft = null;
  state.outputs = [];
  state.outputHistory = [];
  state.jobs = [];

  if (state.drafts.length) await selectDraft(orderedDrafts()[0].id);
  else { renderProjects(); r5OpenCreateModal(); }
}

async function r11RestoreCloudDrafts(localDrafts) {
  const local = (Array.isArray(localDrafts) ? [...localDrafts] : []).filter(draft => !draft?.deleted);
  if (!state.user?.id) return [];

  let projectQuery = supabase
    .from('video_projects')
    .select('id,name,mode,owner_id,project_category,created_at,updated_at,status');
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

  const allProjects = data || [];
  const deletedProjectIds = new Set(
    allProjects
      .filter(project => String(project?.status || '').toLowerCase() === 'deleted')
      .map(project => project.id)
      .filter(Boolean)
  );
  const projects = allProjects.filter(project => !deletedProjectIds.has(project.id));
  const projectById = new Map(projects.map(project => [project.id, project]));

  const cleanLocal = [];
  for (const draft of local) {
    const mode = r5ModeKey(draft.lockedMode || draft.mode);
    const workspace = draft.workspaces?.[mode] || draft;
    const projectId = workspace.remoteProjectId || draft.remoteProjectId || workspace.bindingCandidateProjectId || null;
    if (projectId && deletedProjectIds.has(projectId)) {
      try { await deleteDraft(draft.id); } catch (deleteError) {
        console.warn('[Davis Video R24] failed to purge locally cached deleted project', draft.id, deleteError);
      }
      continue;
    }
    cleanLocal.push(draft);
  }

  for (const draft of cleanLocal) {
    const mode = r5ModeKey(draft.lockedMode || draft.mode);
    const workspace = draft.workspaces?.[mode] || draft;
    const projectId = workspace.remoteProjectId || draft.remoteProjectId || workspace.bindingCandidateProjectId || null;
    const project = projectId ? projectById.get(projectId) : null;
    if (project?.owner_id) {
      draft.remoteOwnerId = project.owner_id;
      draft.ownerId = project.owner_id;
      workspace.remoteOwnerId = project.owner_id;
      workspace.ownerId = project.owner_id;
      if (r43NormalizeCategory(project.project_category)) {
        draft.projectCategory = r43NormalizeCategory(project.project_category);
      }
      try { await saveDraft(draft); } catch (saveError) {
        console.warn('[Davis Video R16] failed to persist project owner', projectId, saveError);
      }
    } else if (!r16ProjectOwnerId(draft)) {
      draft.ownerId = state.user.id;
      workspace.ownerId = state.user.id;
    }
  }

  const drafts = cleanLocal.filter(draft => {
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
    const draft = newDraft(
      mode,
      project.name || `云端 ${r5ModeLabel(mode)}项目`,
      r43NormalizeCategory(project.project_category) || null
    );
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
  void r38LoadUsageSummary(true);
  wireEvents();
  const usageModal = $('personal-usage-modal');
  const usageOpen = $('personal-usage-open');
  const usageClose = $('personal-usage-close');
  const usageBackdrop = $('personal-usage-backdrop');
  const closeUsageModal = () => {
    if (!usageModal) return;
    usageModal.hidden = true;
    usageModal.setAttribute('aria-hidden', 'true');
    usageOpen?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('usage-modal-open');
  };
  const openUsageModal = () => {
    if (!usageModal) return;
    usageModal.hidden = false;
    usageModal.setAttribute('aria-hidden', 'false');
    usageOpen?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('usage-modal-open');
    void r38LoadUsageSummary(false);
  };
  usageOpen?.addEventListener('click', openUsageModal);
  usageClose?.addEventListener('click', closeUsageModal);
  usageBackdrop?.addEventListener('click', closeUsageModal);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && usageModal && !usageModal.hidden) closeUsageModal();
  });
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
  if (result.error) { console.warn('[Davis Video R25] frame recovery skipped', result.error); return; }

  for (const item of plan) {
    const frame = state.draft.frames.find(candidate => candidate.id === item.id);
    if (!frame) continue;

    const sourceW = Number(frame.width || 0);
    const sourceH = Number(frame.height || 0);
    const sourceRatio = sourceW > 0 && sourceH > 0 ? sourceW / sourceH : null;
    const sourceNeedsPadding = sourceRatio != null && (sourceRatio > 2.49 || sourceRatio < 0.41);

    const boundW = Number(frame.uploadWidth || 0);
    const boundH = Number(frame.uploadHeight || 0);
    const boundRatio = boundW > 0 && boundH > 0 ? boundW / boundH : null;
    const boundUnsafe = boundRatio != null && (boundRatio > 2.49 || boundRatio < 0.41);
    const staleUnsafeBinding = Boolean(frame.remoteAssetId && (
      boundUnsafe || (sourceNeedsPadding && frame.wasAspectPadded !== true)
    ));

    // 旧版本可能把 3:1 / 1:3 原图直接标成“已上传”。强制解除旧绑定，重新走自动补边上传。
    if (staleUnsafeBinding) {
      // R27：旧 3:1 asset 仍作为“原图恢复来源”保留。
      // 不能先清 remoteAssetId / remotePath，否则 persist() 会重新写入大 Blob，
      // 在 IndexedDB 阶段卡住，实际上传请求根本还没发出。
      frame.arkSafeVersion = null;
      frame.uploadSafeRatio = null;
      frame.wasAspectPadded = false;
      frame.aspectPadMode = 'none';
    }

    if (frame.remoteAssetId && !staleUnsafeBinding) continue;

    const rows = (result.data || []).filter(candidate =>
      String(candidate.object_path || '').includes('-' + item.id + '-')
    );

    // 只允许恢复已经满足 Seedance 0.40~2.50 比例要求的云端图片。
    const row = rows.find(candidate => {
      const w = Number(candidate.width || 0);
      const h = Number(candidate.height || 0);
      if (!(w > 0 && h > 0)) return false;
      const ratio = w / h;
      return ratio >= 0.41 && ratio <= 2.49;
    });

    if (!row) continue;

    const rowRatio = Number(row.width) / Number(row.height);
    r10ApplyFrameBinding(state.draft.frames, item.id, {
      remoteAssetId: row.id,
      remotePath: row.object_path,
      arkSafeVersion: IMAGE_SAFE_VERSION,
      uploadWidth: row.width,
      uploadHeight: row.height,
      uploadSafeRatio: rowRatio,
      wasAspectPadded: Boolean(sourceNeedsPadding),
      aspectPadMode: sourceNeedsPadding ? (sourceRatio > 2.49 ? 'letterbox_vertical_black_bars' : 'pillarbox_horizontal_black_bars') : 'none',
      originalRatio: sourceRatio,
    });

    if (Number(row.sort_order) !== item.order) {
      supabase.from('video_assets').update({ sort_order: item.order })
        .eq('id', row.id).eq('owner_id', r16ProjectOwnerId())
        .then(({ error }) => { if (error) console.warn('[Davis Video R25] order repair failed', error); });
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
        name: item.name, mime_type: item.type, duration_seconds: Number(item.durationSeconds || item.duration_seconds || 0) || null, usage: 'free_prompt_reference'
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
        segment.uploadStage = `正在自动补边并上传图片 ${index + 1}/${plan.length}`;
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
    segment.uploadStage = null;
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
    void r38LoadUsageSummary(false);
    return;
  }
  try { await loadOutputs(true); } catch (error) { console.warn('[Davis Video R10] refresh failed', error); }
  try { await r10RecoverOrphan(Boolean(force)); }
  catch (error) { console.warn('[Davis Video R10] orphan recovery failed', error); if (force) toast('状态检查失败', errorMessage(error)); }
  renderJobs();
  void r38LoadUsageSummary(false);
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
      ${segment.uploadStage ? `<div style="margin-top:9px;font-size:11px;color:#5665d8">${escapeHtml(segment.uploadStage)}</div>` : ''}
      ${segment.providerTaskId ? '<div style="margin-top:9px;font-size:10px;color:#8b91a3">后台任务已记录，可自动刷新结果</div>' : ''}
    </div>`;
}


async function r25RecoverRemoteFrameAsset(frame, projectId, order) {
  const existing = await withTimeout(
    supabase.from('video_assets')
      .select('id,object_path,mime_type,file_size,width,height')
      .eq('owner_id', state.user.id)
      .eq('project_id', projectId)
      .eq('kind', 'frame')
      .eq('sort_order', order)
      .order('created_at', { ascending: false })
      .limit(20),
    TIMEOUTS.database,
    `查找已上传图片 ${order + 1}`,
  );
  if (existing.error) throw new Error(`查找已上传图片 ${order + 1} 失败：${errorMessage(existing.error)}`);

  const sourceW = Number(frame.width || 0);
  const sourceH = Number(frame.height || 0);
  const sourceRatio = sourceW > 0 && sourceH > 0 ? sourceW / sourceH : null;
  const sourceNeedsPadding = sourceRatio != null && (sourceRatio > 2.49 || sourceRatio < 0.41);

  const row = (existing.data || []).find(candidate => {
    if (!candidate?.id || !candidate?.object_path) return false;
    const w = Number(candidate.width || 0);
    const h = Number(candidate.height || 0);
    if (!(w > 0 && h > 0)) return false;
    const ratio = w / h;
    return ratio >= 0.41 && ratio <= 2.49;
  });
  if (!row) return false;

  const rowRatio = Number(row.width) / Number(row.height);
  frame.remoteAssetId = row.id;
  frame.remotePath = row.object_path;
  frame.type = frame.type || row.mime_type || 'image/png';
  frame.size = frame.size || row.file_size || 0;
  frame.uploadWidth = row.width;
  frame.uploadHeight = row.height;
  frame.arkSafeVersion = IMAGE_SAFE_VERSION;
  frame.uploadSafeRatio = rowRatio;
  frame.originalRatio = sourceRatio;
  frame.wasAspectPadded = Boolean(sourceNeedsPadding);
  frame.aspectPadMode = sourceNeedsPadding
    ? (sourceRatio > 2.49 ? 'letterbox_vertical_black_bars' : 'pillarbox_horizontal_black_bars')
    : 'none';
  return true;
}

async function r25UploadFrame(frame, projectId, order) {
  // 必须先读取真实像素并生成 Ark 安全图。不能再把原始 3:1 / 1:3 图片直接上传。
  const safeFrame = await makeArkSafeFrameBlob(frame);

  const safeW = Number(safeFrame.width || 0);
  const safeH = Number(safeFrame.height || 0);
  const safeRatio = safeW > 0 && safeH > 0 ? safeW / safeH : null;
  if (safeRatio != null && (safeRatio < 0.40 || safeRatio > 2.50)) {
    throw new Error(`图片 ${order + 1} 自动补边失败：处理后比例 ${safeRatio.toFixed(2)} 仍超出 Seedance 0.40-2.50 范围`);
  }

  const boundW = Number(frame.uploadWidth || 0);
  const boundH = Number(frame.uploadHeight || 0);
  const boundRatio = boundW > 0 && boundH > 0 ? boundW / boundH : null;
  const currentBindingSafe = Boolean(
    frame.remoteAssetId &&
    frame.remotePath &&
    frame.arkSafeVersion === IMAGE_SAFE_VERSION &&
    boundRatio != null &&
    boundRatio >= 0.41 &&
    boundRatio <= 2.49 &&
    (!safeFrame.normalized || frame.wasAspectPadded === true)
  );
  if (currentBindingSafe) return frame;

  // R27：不要在新补边图成功上传前清掉旧 remoteAssetId / remotePath。
  // 旧绑定只作为原图恢复来源，不会提交给 Ark；新安全 asset 成功后才原子替换本地绑定。
  frame.arkSafeVersion = null;

  // 只恢复数据库里已经是安全比例的历史补边图；3:1 原图不会再被恢复。
  if (await recoverRemoteFrameAsset(frame, projectId, order)) return frame;

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
      original_name: safeFrame.normalized ? `${frame.name}（已自动补边适配 Davis Video）` : frame.name,
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
  frame.uploadSafeRatio = safeFrame.safeRatio || safeRatio;
  frame.originalRatio = safeFrame.originalRatio || (frame.width && frame.height ? frame.width / frame.height : null);
  return frame;
}


function r34BuildStrictFrameLockPrompt(segment) {
  const rawPrompt = String(segment?.prompt || '').trim();
  if (state.draft.mode === 'text_only') {
    const ratioLabel = state.draft.ratio === 'follow' ? '16:9' : state.draft.ratio;
    const referenceCount = (state.referenceAssets || []).length;
    return [
      '【纯文字要求】',
      referenceCount
        ? `当前任务为纯文字描述生成模式，已提供 ${referenceCount} 个参考素材；请结合参考素材理解主体、构图、动作与风格。`
        : '当前任务为纯文字描述生成模式，没有上传参考素材。',
      '请严格根据用户文字描述和已提供参考素材生成，不要凭空添加与描述冲突的主体、文字、Logo、人物或复杂背景。',
      `输出比例：${ratioLabel}；整体应保持画面稳定、主体明确、镜头运动自然。`,
      '【用户视频描述】',
      rawPrompt || '请生成一个画面稳定、质感高级、自然运动的短视频。'
    ].join('\\n');
  }
  const fromIndex = state.draft.frames.findIndex(f => f.id === segment.fromFrameId);
  const toIndex = state.draft.frames.findIndex(f => f.id === segment.toFrameId);
  const frameA = fromIndex >= 0 ? `图 ${fromIndex + 1}` : '首图';
  const frameB = toIndex >= 0 ? `图 ${toIndex + 1}` : '尾图';
  const segmentLabel = `第 ${Math.max(0, Number(segment?.index || 0)) + 1} 段`;
  const modeLine = state.draft.mode === 'multi_frame'
    ? '多帧 只是把多组首尾帧拆成多个独立任务逐段提交；当前这一段仍然必须按严格首尾帧任务执行。'
    : '当前任务必须按严格首尾帧任务执行。';
  return [
    '【Davis Video 严格首尾帧硬约束｜最高优先级｜R34 形象锁定版】',
    `${segmentLabel}：${modeLine}`,
    `起始控制图=${frameA}；结束控制图=${frameB}。两张图都不是风格参考，而是必须被准确复现的硬控制图。`,
    '【核心目标】不是只要求运动从A走到B，而是要求 A 和 B 之间所有元素在身份、形状、样貌、材质、颜色、版式和结构上保持同一体系，不能在过渡中被改造成另一种样子。',
    '【绝对优先级】尾帧外观锁定 > 首帧外观锁定 > 中间运动丰富度 > 文本创意发挥。只要尾帧样子发生改版、换脸、换造型、换数字造型、换IP风格、换Logo样式，都视为失败。',
    '1. 第1帧必须最大程度复现起始控制图：主体身份、IP造型、Logo、文字、数字、五官、轮廓、服装、颜色、材质、道具、背景、透视、构图、镜头裁切和相对位置不得擅自改变。',
    '2. 最后1帧必须最大程度复现结束控制图，而且要求“样子一致”而不是“内容接近”：主体的外轮廓、局部结构、比例、转折、边缘形态、材质质感、色彩关系、文本/数字字体形状、Logo细节、图标样式、道具样式、背景摆放、前后景层次、镜头远近都必须与结束控制图保持同一外观体系。',
    '3. 严禁模型在过渡中把主体改造成另一版设计。尤其禁止：把尾帧中的数字、IP、吉祥物、角色、图标、Logo、文字、装饰、道具从原来的造型重绘成另一种形象、另一种材质、另一种比例或另一种风格。',
    '4. 两张控制图里没有变化的元素，一律视为“冻结元素”。冻结元素从头到尾都必须保持同一外观、同一位置逻辑、同一材质和同一设计语言，不允许忽然变粗、变细、变圆、变尖、变卡通、变写实、变立体、变扁平。',
    '5. 两张控制图里发生变化的元素，也只能做“定向插值过渡”，不能借机重设计。允许的只是从A的样子连续过渡到B的样子；不允许先变成第三种陌生样子，再回到B。',
    '6. 中间过程只允许在两张控制图真实差异之间做连续插值、位移、缓动、视差、镜头运动和必要形变；禁止新增两帧都不存在的主要元素，禁止删除两帧都存在的主要元素。',
    '7. 最后0.5秒必须进入“尾帧收敛阶段”：停止自由发挥，把所有仍有偏差的元素收拢回结束控制图。结尾不能继续生成新的动作、新构图、新道具、新装饰、新表情或新的设计语言。',
    '8. 如果时长不足以同时满足丰富运动和尾帧外观还原，请减少运动复杂度、缩短中间变化、弱化演出，优先保证尾帧的外观一致性。宁可动画简单，也不能把尾帧元素改样。',
    '9. 若用户文字与首尾帧冲突，以首尾帧为最高优先级；文字只能描述“如何过渡”，不能修改首尾帧中任何主体本体、形象状态、设计细节和结束画面长相。',
    '【尾帧硬验收】最终一帧必须逐项匹配结束控制图：主体外观、局部细节、数字/文字/Logo形状、色彩、材质、大小比例、位置、背景、镜头裁切、透视、层次、光影。任何“改样”“改版”“换风格”都算不合格。',
    '【本段用户运动/过渡要求｜仅用于说明过渡方式，不得覆盖首尾帧外观锁定】',
    rawPrompt || '只做稳定、自然、低自由度的首尾帧过渡。',
  ].join('\\n');
}


async function r35UploadReferenceAssets(projectId, segmentsForProgress = []) {
  const assets = commitTextReferenceAssets();
  const resultIds = [];
  const segments = Array.isArray(segmentsForProgress) ? segmentsForProgress : [];

  for (let index = 0; index < assets.length; index++) {
    const ref = assets[index];
    const isImage = String(ref?.type || '').startsWith('image/');
    const progress = Math.min(12, 4 + Math.round(((index + 0.35) / Math.max(assets.length, 1)) * 8));

    segments.forEach(segment => {
      segment.status = 'uploading';
      segment.progress = progress;
      segment.error = isImage
        ? `正在检查比例并上传参考图片 ${index + 1}/${assets.length}：${ref.name || assetKindLabel(ref)}`
        : `正在上传参考素材 ${index + 1}/${assets.length}：${ref.name || assetKindLabel(ref)}`;
    });
    renderJobs();
    await persist();

    const boundW = Number(ref?.uploadWidth || ref?.width || 0);
    const boundH = Number(ref?.uploadHeight || ref?.height || 0);
    const boundRatio = boundW > 0 && boundH > 0 ? boundW / boundH : null;
    const safeRemoteImage = Boolean(
      isImage &&
      ref.remoteAssetId &&
      ref.remotePath &&
      ref.arkSafeVersion === IMAGE_SAFE_VERSION &&
      boundRatio != null &&
      boundRatio >= 0.41 &&
      boundRatio <= 2.49
    );

    // 非图片素材沿用原逻辑；图片只有在“明确已做过 Ark 安全补边”时才允许复用。
    if ((!isImage && ref.remoteAssetId && ref.remotePath) || safeRemoteImage) {
      resultIds.push(ref.remoteAssetId);
      continue;
    }

    // 旧版本的 reference_image 可能已经上传了 3:1 原图。
    // 即使本地 Blob 被清理，也要从旧 remotePath 下载回来，再走 makeArkSafeFrameBlob。
    if (!(ref.blob instanceof Blob)) {
      await restoreRemoteFrameBlob(ref);
    }
    if (!(ref.blob instanceof Blob)) {
      throw new Error(`参考内容“${ref.name}”的本地文件已丢失，请重新上传`);
    }

    let uploadBlob = ref.blob;
    let uploadType = ref.type || ref.blob.type || 'application/octet-stream';
    let uploadWidth = null;
    let uploadHeight = null;
    let normalized = false;
    let padMode = 'none';
    let safeRatio = null;
    let originalRatio = null;

    if (isImage) {
      const safe = await makeArkSafeFrameBlob(ref);
      uploadBlob = safe.blob;
      uploadType = safe.type || 'image/png';
      uploadWidth = Number(safe.width || 0) || null;
      uploadHeight = Number(safe.height || 0) || null;
      normalized = Boolean(safe.normalized);
      padMode = safe.padMode || 'none';
      safeRatio = Number(safe.safeRatio || safe.ratio || (
        uploadWidth && uploadHeight ? uploadWidth / uploadHeight : 0
      )) || null;
      originalRatio = Number(safe.originalRatio || 0) || null;

      if (safeRatio != null && (safeRatio < 0.40 || safeRatio > 2.50)) {
        throw new Error(`参考图片“${ref.name}”自动补边失败：处理后比例 ${safeRatio.toFixed(2)} 仍超出 Seedance 0.40-2.50 范围`);
      }
    }

    const ext = extensionFromMime(uploadType);
    const kindFolder = ref.type.startsWith('audio/')
      ? 'reference-audios'
      : isImage
        ? 'reference-images'
        : 'reference-videos';
    const safeNameBase = String(ref.name || 'reference')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w.\-]+/g,'_')
      .slice(-90) || 'reference';
    const path = `${state.user.id}/${projectId}/${kindFolder}/${ref.id}-${Date.now()}-${safeNameBase}.${ext}`;

    const upload = await withTimeout(
      supabase.storage.from('seedance-inputs').upload(path, uploadBlob, {
        contentType: uploadType,
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
        original_name: isImage && normalized
          ? `${ref.name}（已自动补边适配 Davis Video）`
          : ref.name,
        mime_type: uploadType,
        file_size: uploadBlob.size,
        width: uploadWidth,
        height: uploadHeight,
        kind: ref.type.startsWith('audio/')
          ? 'reference_audio'
          : isImage
            ? 'reference_image'
            : 'reference_video',
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

    if (isImage) {
      ref.arkSafeVersion = IMAGE_SAFE_VERSION;
      ref.uploadWidth = uploadWidth;
      ref.uploadHeight = uploadHeight;
      ref.width = uploadWidth || ref.width || null;
      ref.height = uploadHeight || ref.height || null;
      ref.wasAspectPadded = normalized;
      ref.aspectPadMode = padMode;
      ref.uploadSafeRatio = safeRatio;
      ref.originalRatio = originalRatio;
      ref.type = uploadType;
      ref.size = uploadBlob.size;
      // 新补边 Blob 留在当前会话，后续重试不会再读取 3:1 旧原图。
      ref.blob = uploadBlob;
    }

    resultIds.push(ref.remoteAssetId);
    commitTextReferenceAssets(assets);
  }

  commitTextReferenceAssets(assets);
  segments.forEach(segment => {
    segment.error = null;
  });
  await persist();
  return resultIds;
}


function r37ModelCatalog() {
  return {
    v20: {
      label: 'Seedance 2.0',
      shortLabel: 'Seedance 2.0', family: '2.0', minDuration: 4, maxDuration: 15,
      resolutions: ['480p','720p','1080p','4k'], supportsAudio: true, supportsVideoReference: true,
      pricing: { noVideo: 46, withVideo: 28 },
    },
    fast: {
      label: 'Seedance 2.0 Fast',
      shortLabel: 'Seedance 2.0 Fast', family: '2.0', minDuration: 4, maxDuration: 15,
      resolutions: ['480p','720p'], supportsAudio: true, supportsVideoReference: true,
      pricing: { noVideo: 37, withVideo: 22 },
    },
    mini: {
      label: 'Seedance 2.0 Mini',
      shortLabel: 'Seedance 2.0 Mini', family: '2.0', minDuration: 4, maxDuration: 15,
      resolutions: ['480p','720p'], supportsAudio: false, supportsVideoReference: true,
      pricing: { noVideo: 23, withVideo: 14 },
    },
    v15: {
      label: 'Seedance 1.5 Pro',
      shortLabel: 'Seedance 1.5 Pro', family: '1.5', minDuration: 1, maxDuration: 12,
      resolutions: ['480p','720p','1080p'], supportsAudio: true, supportsVideoReference: false,
      pricing: { silent: 8, audio: 16 },
    },
  };
}

function r37ModelConfig(alias) {
  const catalog = r37ModelCatalog();
  return catalog[alias] || catalog.v20;
}

function r37ModelLabel(alias) {
  return r37ModelConfig(alias).shortLabel;
}

function r37ResolutionPixels(resolution) {
  const map = {
    '480p': 864 * 496,
    '720p': 1280 * 720,
    '1080p': 1920 * 1080,
    '4k': 3840 * 2160,
  };
  return map[String(resolution || '').toLowerCase()] || map['720p'];
}

function r37InputProfile(segment) {
  if (state.draft?.mode !== 'text_only') {
    return {
      label: state.draft?.mode === 'multi_frame' ? '图片 · 多帧首尾帧' : '图片 · 首尾帧',
      hasVideo: false, hasImage: true, hasAudio: false,
      videoSeconds: 0, unknownVideoDuration: false, refs: [],
    };
  }
  const refs = typeof currentReferenceAssets === 'function'
    ? currentReferenceAssets()
    : (state.referenceAssets || []);
  let hasVideo = false;
  let hasImage = false;
  let hasAudio = false;
  let videoSeconds = 0;
  let unknownVideoDuration = false;
  refs.forEach(asset => {
    const type = String(asset?.type || '');
    if (type.startsWith('video/')) {
      hasVideo = true;
      const d = Number(asset?.durationSeconds || asset?.duration_seconds || asset?.duration || 0);
      if (d > 0) videoSeconds += d;
      else unknownVideoDuration = true;
    } else if (type.startsWith('image/')) hasImage = true;
    else if (type.startsWith('audio/')) hasAudio = true;
  });
  const labels = [];
  if (hasVideo) labels.push('视频');
  if (hasImage) labels.push('图片');
  if (hasAudio) labels.push('音频');
  if (!labels.length) labels.push('纯文字');
  return { label: labels.join(' + '), hasVideo, hasImage, hasAudio, videoSeconds, unknownVideoDuration, refs };
}

function r37EstimateCost(segment) {
  const config = r37ModelConfig(segment?.model || 'v20');
  const resolution = config.resolutions.includes(String(segment?.resolution || '').toLowerCase())
    ? String(segment.resolution).toLowerCase()
    : '720p';
  const rawDuration = Number(segment?.duration || config.minDuration || 4);
  const duration = Math.max(config.minDuration, Math.min(config.maxDuration, Number.isFinite(rawDuration) ? rawDuration : config.minDuration));
  const profile = r37InputProfile(segment);
  const generateAudio = config.supportsAudio ? Boolean(segment?.generateAudio) : false;
  const secondsForTokens = config.family === '2.0'
    ? duration + (profile.hasVideo ? Math.max(0, profile.videoSeconds) : 0)
    : duration;
  const estimatedTokens = Math.ceil((r37ResolutionPixels(resolution) * 24 * secondsForTokens) / 1024);
  const rate = config.family === '1.5'
    ? (generateAudio ? config.pricing.audio : config.pricing.silent)
    : (profile.hasVideo ? config.pricing.withVideo : config.pricing.noVideo);
  const estimatedCost = estimatedTokens * rate / 1_000_000;
  return {
    model: config.label,
    resolution,
    duration,
    generateAudio,
    inputLabel: profile.label,
    hasVideo: profile.hasVideo,
    videoSeconds: profile.videoSeconds,
    lowerBound: Boolean(config.family === '2.0' && profile.hasVideo && profile.unknownVideoDuration),
    estimatedTokens,
    rate,
    cost: estimatedCost,
    family: config.family,
  };
}

function r37ValidateSegmentConfig(segment) {
  const config = r37ModelConfig(segment?.model || 'v20');
  const profile = r37InputProfile(segment);
  const duration = Number(segment?.duration || 0);
  const resolution = String(segment?.resolution || '').toLowerCase();
  if (duration < config.minDuration || duration > config.maxDuration) {
    return `${config.label} 支持 ${config.minDuration}-${config.maxDuration} 秒，请调整时长。`;
  }
  if (!config.resolutions.includes(resolution)) {
    return `${config.label} 当前支持 ${config.resolutions.map(item => item.toUpperCase()).join(' / ')}，请调整清晰度。`;
  }
  if (segment?.model === 'v15' && profile.hasVideo) {
    return 'Seedance 1.5 Pro 当前不接收参考视频；请改用 2.0 系列，或移除参考视频。';
  }
  if (segment?.model === 'v15' && profile.hasAudio) {
    return 'Seedance 1.5 Pro 当前不接收参考音频；声音开关只控制输出视频是否带声音。';
  }
  if (segment?.model === 'v15' && state.draft?.mode === 'text_only' && profile.refs.length > 1) {
    return 'Seedance 1.5 Pro 当前最多使用 1 张图片参考；多参考素材请改用 2.0 系列。';
  }
  return '';
}

function r37SetSelectOptions(select, items, preferredValue) {
  if (!select) return preferredValue;
  const normalized = items.map(item => typeof item === 'string' ? { value: item, label: item } : item);
  const allowed = new Set(normalized.map(item => String(item.value)));
  const value = allowed.has(String(preferredValue)) ? String(preferredValue) : String(normalized[0]?.value || '');
  select.innerHTML = normalized.map(item => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('');
  select.value = value;
  return value;
}

function r37ApplyModelControls(segment) {
  if (!segment) return;
  const catalog = r37ModelCatalog();
  segment.model = r37SetSelectOptions($('segment-model'), [
    { value:'v20', label:'Seedance 2.0 · 1080P/4K' },
    { value:'fast', label:'Seedance 2.0 Fast' },
    { value:'mini', label:'Seedance 2.0 Mini' },
    { value:'v15', label:'Seedance 1.5 Pro · 最短1秒' },
  ], segment.model || 'v20') || 'v20';
  const config = catalog[segment.model] || catalog.v20;

  const duration = Math.max(config.minDuration, Math.min(config.maxDuration, Number(segment.duration || config.minDuration)));
  segment.duration = Number(r37SetSelectOptions(
    $('segment-duration'),
    Array.from({ length: config.maxDuration - config.minDuration + 1 }, (_, i) => ({ value:String(config.minDuration + i), label:`${config.minDuration + i} 秒` })),
    String(duration)
  ));

  segment.resolution = r37SetSelectOptions(
    $('segment-resolution'),
    config.resolutions.map(value => ({ value, label:value === '4k' ? '4K' : value.toUpperCase() })),
    String(segment.resolution || '720p').toLowerCase()
  ) || '720p';

  if (!config.supportsAudio) segment.generateAudio = false;
  const audioItems = config.supportsAudio
    ? [{ value:'false', label:'关 · 无声视频' }, { value:'true', label:'开 · 生成声音' }]
    : [{ value:'false', label:'关 · 当前模型仅无声' }];
  r37SetSelectOptions($('segment-audio'), audioItems, String(Boolean(segment.generateAudio)));
}

function r37RenderSegmentCost(segment) {
  const el = $('segment-cost-estimate');
  if (!el || !segment) return;
  const estimate = r37EstimateCost(segment);
  const issue = r37ValidateSegmentConfig(segment);
  const prefix = estimate.lowerBound ? '≥ ' : '约 ';
  const extra = estimate.resolution === '4k' ? ' · 4K任务独占并发1' : '';
  el.innerHTML = `
    <div class="pricing-card-head"><strong>本段费用预估</strong><b>${prefix}¥${estimate.cost.toFixed(2)}</b></div>
    <div class="pricing-card-grid">
      <span>模型 <strong>${escapeHtml(estimate.model)}</strong></span>
      <span>输入 <strong>${escapeHtml(estimate.inputLabel)}</strong></span>
      <span>时长 <strong>${estimate.duration}s</strong></span>
      <span>清晰度 <strong>${escapeHtml(estimate.resolution === '4k' ? '4K' : estimate.resolution.toUpperCase())}</strong></span>
      <span>声音 <strong>${estimate.generateAudio ? '有声' : '无声'}</strong></span>
      <span>计费单价 <strong>¥${estimate.rate}/百万 tokens</strong></span>
    </div>
    <small>${estimate.lowerBound ? '参考视频时长尚未读取完整，因此这里显示最低预估；' : ''}约 ${estimate.estimatedTokens.toLocaleString('zh-CN')} tokens${extra}。最终以 Ark usage / 火山方舟账单为准。</small>
    ${issue ? `<p class="pricing-warning">${escapeHtml(issue)}</p>` : ''}`;
}

function r37RenderProjectCost() {
  const el = $('project-cost-estimate');
  if (!el || !state.draft) return;
  const segments = state.draft.segments || [];
  if (!segments.length) { el.innerHTML = ''; return; }
  const rows = segments.map(segment => ({ segment, estimate:r37EstimateCost(segment), issue:r37ValidateSegmentConfig(segment) }));
  const total = rows.reduce((sum, row) => sum + row.estimate.cost, 0);
  const lowerBound = rows.some(row => row.estimate.lowerBound);
  el.innerHTML = `
    <div class="pricing-total-head"><span>预计本项目生成费用</span><strong>${lowerBound ? '≥ ' : '约 '}¥${total.toFixed(2)}</strong></div>
    <div class="pricing-total-list">${rows.map((row, index) => `<div><span>SEG ${String(index + 1).padStart(2,'0')} · ${escapeHtml(r37ModelLabel(row.segment.model))} · ${row.estimate.duration}s · ${escapeHtml(row.estimate.resolution === '4k' ? '4K' : row.estimate.resolution.toUpperCase())} · ${escapeHtml(row.estimate.inputLabel)} · ${row.estimate.generateAudio ? '有声' : '无声'}</span><b>${row.estimate.lowerBound ? '≥' : '≈'} ¥${row.estimate.cost.toFixed(2)}</b></div>`).join('')}</div>
    <small>费用为前端预估，最终以 Ark usage / 火山方舟实际账单为准。</small>`;
}

function r37ReadMediaDuration(file) {
  return new Promise(resolve => {
    if (!(file instanceof Blob)) return resolve(0);
    const type = String(file.type || '');
    if (!type.startsWith('video/') && !type.startsWith('audio/')) return resolve(0);
    const element = document.createElement(type.startsWith('audio/') ? 'audio' : 'video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      element.removeAttribute('src');
      resolve(Number.isFinite(Number(value)) ? Number(value) : 0);
    };
    const timer = setTimeout(() => done(0), 6000);
    element.preload = 'metadata';
    element.onloadedmetadata = () => { clearTimeout(timer); done(element.duration); };
    element.onerror = () => { clearTimeout(timer); done(0); };
    element.src = url;
  });
}

async function r37AddReferenceAssets(fileList) {
  const files = [...fileList];
  const allowed = new Set([
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4', 'audio/ogg',
    'image/png', 'image/jpeg', 'image/webp',
  ]);
  let added = 0;
  for (const file of files) {
    if (!allowed.has(file.type)) { toast('格式不支持', `${file.name} 不是支持的参考格式`); continue; }
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const maxSize = isVideo ? 300 * 1024 * 1024 : isAudio ? 80 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxSize) { toast('文件过大', `${file.name} 超过当前类型限制`); continue; }
    const durationSeconds = (isVideo || isAudio) ? await r37ReadMediaDuration(file) : 0;
    const refs = commitTextReferenceAssets();
    refs.push({
      id: uid(), name: file.name, type: file.type, size: file.size, blob: file,
      createdAt: Date.now(), remoteAssetId: null, remotePath: null,
      durationSeconds: durationSeconds > 0 ? durationSeconds : null,
    });
    added += 1;
  }
  commitTextReferenceAssets(state.referenceAssets);
  renderTextModePanel();
  renderSummary();
  await persist();
  if (added) toast('参考内容已加入', `已添加 ${added} 个参考内容；费用预估会按图片/视频/音频输入自动更新。`);
}

function r37RenderInspector() {
  const segment = state.draft.segments.find(s => s.id === state.selectedSegmentId);
  $('inspector-empty').hidden = !!segment;
  $('inspector-form').hidden = !segment;
  if (!segment) return;
  const fromIndex = state.draft.frames.findIndex(f => f.id === segment.fromFrameId);
  const toIndex = state.draft.frames.findIndex(f => f.id === segment.toFrameId);
  $('inspector-index').textContent = state.draft.mode === 'text_only' ? 'TEXT TO VIDEO' : `SEGMENT ${String(segment.index+1).padStart(2,'0')}`;
  $('inspector-name').textContent = state.draft.mode === 'text_only' ? '纯文字 / 多模态参考生成' : `图 ${fromIndex+1} → 图 ${toIndex+1}`;
  $('inspector-status').textContent = statusText(segment.status);
  $('segment-prompt').value = segment.prompt;
  r37ApplyModelControls(segment);
  $('segment-duration').value = String(segment.duration);
  $('segment-model').value = segment.model;
  $('segment-resolution').value = segment.resolution;
  $('segment-ratio').value = state.draft.ratio === 'adaptive' ? '智能比例' : state.draft.ratio;
  if ($('segment-audio')) $('segment-audio').value = String(Boolean(segment.generateAudio));
  if ($('segment-prompt')) $('segment-prompt').placeholder = state.draft.mode === 'text_only'
    ? '描述你想生成的视频；2.0 支持文字/图片/视频/音频参考，1.5 Pro 支持纯文字/图片并可最短生成1秒。'
    : '描述这两帧之间的动作、镜头、节奏和画面变化。';
  r37RenderSegmentCost(segment);
  syncCustomSelects();
}

function r37RenderSummary() {
  $('summary-frames').textContent = state.draft.mode === 'text_only' ? '无需图片' : state.draft.frames.length;
  $('summary-segments').textContent = state.draft.mode === 'text_only' ? 1 : state.draft.segments.length;
  $('summary-duration').textContent = `${state.draft.segments.reduce((sum,s)=>sum+Number(s.duration||0),0)} 秒`;
  r37RenderProjectCost();
}


function r38FormatTokens(value) {
  const n = Math.max(0, Number(value || 0));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M tokens`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K tokens`;
  return `${Math.round(n)} tokens`;
}

function r38FormatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value || 0)));
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

function r38UsagePeriodMarkup(label, sublabel, row) {
  const data = row || {};
  const cost = Math.max(0, Number(data.cost_cny || 0));
  const tasks = Math.max(0, Number(data.generated_tasks || 0));
  return `<article class="personal-usage-item">
    <div class="label"><span>${escapeHtml(label)}</span><b>${escapeHtml(sublabel || '')}</b></div>
    <strong>¥${cost.toFixed(2)}</strong>
    <span>生成 ${tasks} 段 · ${escapeHtml(r38FormatTokens(data.tokens))} · ${escapeHtml(r38FormatDuration(data.generated_seconds))}</span>
  </article>`;
}


function r42UsagePeriods(summary) {
  return {
    today: { key:'today', title:'今日', label:'今日已产生费用', sublabel: summary?.as_of_date || '', row: summary?.today || {} },
    month: { key:'month', title:'本月', label:'本月已产生费用', sublabel: summary?.month_label || '', row: summary?.month || {} },
    year: { key:'year', title:'本年', label:'本年已产生费用', sublabel: summary?.year_label || '', row: summary?.year || {} },
  };
}

function r42VisibleBars(chart, summary) {
  const rows = Array.isArray(chart?.bars) ? chart.bars : [];
  if (chart?.period === 'month' && summary?.as_of_date) {
    return rows.filter(row => String(row?.full_label || '') <= String(summary.as_of_date));
  }
  if (chart?.period === 'year' && summary?.month_label) {
    return rows.filter(row => String(row?.full_label || '') <= String(summary.month_label));
  }
  if (chart?.period === 'today') {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Shanghai', hour:'2-digit', hour12:false }).format(new Date()));
    return rows.slice(0, Math.min(rows.length, Math.max(1, hour + 1)));
  }
  return rows;
}

function r42UsageOverviewMarkup(summary, period) {
  const item = r42UsagePeriods(summary)[period] || r42UsagePeriods(summary).month;
  const row = item.row || {};
  return [
    `<div class="personal-usage-overview-item"><span>${escapeHtml(item.title)}生成片段</span><strong>${Math.max(0, Number(row.generated_tasks || 0))} 段</strong></div>`,
    `<div class="personal-usage-overview-item"><span>${escapeHtml(item.title)} Tokens</span><strong>${escapeHtml(r38FormatTokens(row.tokens))}</strong></div>`,
    `<div class="personal-usage-overview-item"><span>${escapeHtml(item.title)}生成时长</span><strong>${escapeHtml(r38FormatDuration(row.generated_seconds))}</strong></div>`,
  ].join('');
}

function r42TooltipMarkup(row) {
  const models = Array.isArray(row?.models) ? row.models : [];
  const projectTypes = Array.isArray(row?.project_categories)
    ? row.project_categories
    : (Array.isArray(row?.project_types) ? row.project_types : []);
  const modelRows = models.length
    ? models.map(item => `<div class="usage-tip-row usage-tip-model"><span><i class="usage-tip-dot"></i>${escapeHtml(item.label || 'Seedance')}</span><b>¥${Math.max(0, Number(item.cost_cny || 0)).toFixed(2)} · ${Math.max(0, Number(item.share_pct || 0)).toFixed(1)}%</b></div>`).join('')
    : '<div class="usage-tip-row"><span>无已计费模型</span><b>—</b></div>';
  const projectRows = projectTypes.length
    ? projectTypes.map(item => `<div class="usage-tip-row"><span><i class="usage-tip-dot"></i>${escapeHtml(item.label || '其他')}</span><b>¥${Math.max(0, Number(item.cost_cny || 0)).toFixed(2)} · ${Math.max(0, Number(item.share_pct || 0)).toFixed(1)}%</b></div>`).join('')
    : '<div class="usage-tip-row"><span>无已计费项目</span><b>—</b></div>';
  return `<div class="usage-tip-top"><span>${escapeHtml(row?.full_label || row?.label || '--')}</span><strong>¥${Math.max(0, Number(row?.cost_cny || 0)).toFixed(2)}</strong></div>
    <div class="usage-tip-section"><strong>模型</strong>${modelRows}</div>
    <div class="usage-tip-section"><strong>项目占比（按花费）</strong>${projectRows}</div>`;
}

function r42RenderUsageChart(chart, summary) {
  const host = $('personal-usage-chart-host');
  if (!host) return;
  const period = chart?.period || r38RenderUsageSummary.selectedPeriod || 'month';
  const rows = r42VisibleBars(chart, summary);
  const maxCost = Math.max(0, ...rows.map(row => Number(row?.cost_cny || 0)));
  const yMax = maxCost > 0 ? Math.max(1, Math.ceil(maxCost * 1.15 * 10) / 10) : 1;
  const ticks = [yMax, yMax * 2 / 3, yMax / 3, 0];
  const showEvery = rows.length > 24 ? 5 : rows.length > 14 ? 3 : rows.length > 8 ? 2 : 1;
  const title = period === 'today' ? '今日消费金额（CNY）' : period === 'year' ? '本年消费金额（CNY）' : '本月消费金额（CNY）';
  const grainLabel = period === 'today' ? '今日 · 按小时' : period === 'year' ? '本年 · 按月' : '本月 · 按天';
  host.innerHTML = `<div class="personal-usage-chart-toolbar">
      <div class="personal-usage-chart-title"><strong>${title}</strong><span>鼠标悬停柱子查看模型与业务项目占比</span></div>
      <span class="personal-usage-period-chip">时间维度　${grainLabel}</span>
    </div>
    <div class="personal-usage-chart-wrap">
      <div class="personal-usage-y-axis">${ticks.map(v => `<span>${v >= 10 ? v.toFixed(0) : v.toFixed(1)}</span>`).join('')}</div>
      <div class="personal-usage-grid-lines"><i></i><i></i><i></i><i></i></div>
      <div class="personal-usage-bars">
        ${rows.map((row, index) => {
          const cost = Math.max(0, Number(row?.cost_cny || 0));
          const height = cost > 0 ? Math.max(4, (cost / yMax) * 100) : 0.6;
          const showLabel = index === 0 || index === rows.length - 1 || index % showEvery === 0;
          return `<div class="personal-usage-bar-slot" tabindex="0" data-usage-bar-index="${index}">
            <div class="personal-usage-bar${cost <= 0 ? ' is-zero' : ''}" style="height:${height.toFixed(2)}%"></div>
            ${showLabel ? `<span class="personal-usage-x-label">${escapeHtml(row?.label || '')}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${rows.some(row => Number(row?.cost_cny || 0) > 0) ? '' : '<div class="personal-usage-empty-chart">当前周期暂无已计费生成记录</div>'}
      <div id="personal-usage-tooltip" class="personal-usage-tooltip"></div>
    </div>`;

  const wrap = host.querySelector('.personal-usage-chart-wrap');
  const tip = host.querySelector('#personal-usage-tooltip');
  if (!wrap || !tip) return;

  const hide = () => {
    tip.classList.remove('is-visible');
    host.querySelectorAll('.personal-usage-bar-slot').forEach(node => node.classList.remove('is-active'));
  };
  const show = (slot, row) => {
    host.querySelectorAll('.personal-usage-bar-slot').forEach(node => node.classList.toggle('is-active', node === slot));
    tip.innerHTML = r42TooltipMarkup(row);
    tip.classList.add('is-visible');
    const wrapRect = wrap.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    const tipWidth = Math.min(286, wrapRect.width - 20);
    let left = slotRect.left - wrapRect.left + slotRect.width / 2 - tipWidth / 2;
    left = Math.max(8, Math.min(left, wrapRect.width - tipWidth - 8));
    const estimatedHeight = tip.offsetHeight || 220;
    let top = slotRect.top - wrapRect.top - estimatedHeight - 12;
    if (top < 6) top = Math.min(wrapRect.height - estimatedHeight - 6, slotRect.top - wrapRect.top + 12);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(6, top)}px`;
  };

  host.querySelectorAll('[data-usage-bar-index]').forEach(slot => {
    const index = Number(slot.dataset.usageBarIndex || 0);
    const row = rows[index] || {};
    slot.addEventListener('mouseenter', () => show(slot, row));
    slot.addEventListener('focus', () => show(slot, row));
    slot.addEventListener('click', () => show(slot, row));
    slot.addEventListener('mouseleave', hide);
    slot.addEventListener('blur', hide);
  });
}

async function r42LoadUsageChart(period = 'month', force = false) {
  if (!state.user?.id) return null;
  const safePeriod = ['today','month','year'].includes(period) ? period : 'month';
  r42LoadUsageChart.cache ||= {};
  r42LoadUsageChart.inFlight ||= {};
  const cached = r42LoadUsageChart.cache[safePeriod];
  if (!force && cached && Date.now() - cached.fetchedAt < 20_000) {
    r42RenderUsageChart(cached.data, r38LoadUsageSummary.lastSummary);
    return cached.data;
  }
  if (r42LoadUsageChart.inFlight[safePeriod]) return r42LoadUsageChart.inFlight[safePeriod];
  const host = $('personal-usage-chart-host');
  if (host) host.innerHTML = '<div class="personal-usage-loading">正在读取消费柱状图明细...</div>';
  r42LoadUsageChart.inFlight[safePeriod] = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_my_video_usage_chart', { p_period: safePeriod });
      if (error) throw error;
      const chart = data && typeof data === 'object' ? data : { period:safePeriod, bars:[] };
      r42LoadUsageChart.cache[safePeriod] = { data: chart, fetchedAt: Date.now() };
      r42RenderUsageChart(chart, r38LoadUsageSummary.lastSummary);
      return chart;
    } catch (error) {
      console.warn('[Davis Video R42] usage chart failed', error);
      if (host) host.innerHTML = `<div class="personal-usage-error">暂时无法读取柱状图明细：${escapeHtml(errorMessage(error, '未知错误'))}</div>`;
      return null;
    } finally {
      r42LoadUsageChart.inFlight[safePeriod] = null;
    }
  })();
  return r42LoadUsageChart.inFlight[safePeriod];
}



function r38RenderUsageSummary(summary, error = null) {
  const body = $('personal-usage-body');
  const date = $('personal-usage-date');
  const overview = $('personal-usage-overview');
  const foot = $('personal-usage-foot');
  const refresh = $('personal-usage-refresh');
  if (refresh) refresh.onclick = () => {
    r42LoadUsageChart.cache = {};
    void r38LoadUsageSummary(true);
  };
  if (!body || !date || !foot) return;

  if (error) {
    date.textContent = '个人用量读取失败';
    body.className = 'personal-usage-error';
    body.textContent = `暂时无法读取个人用量：${errorMessage(error, '未知错误')}`;
    if (overview) overview.hidden = true;
    foot.hidden = true;
    return;
  }

  if (!summary) {
    date.textContent = '正在读取当前日期...';
    body.className = 'personal-usage-loading';
    body.textContent = '正在读取 Ark 实际 usage...';
    if (overview) overview.hidden = true;
    foot.hidden = true;
    return;
  }

  const periods = r42UsagePeriods(summary);
  const safePeriod = periods[r38RenderUsageSummary.selectedPeriod] ? r38RenderUsageSummary.selectedPeriod : 'month';
  r38RenderUsageSummary.selectedPeriod = safePeriod;

  const cardMarkup = key => {
    const item = periods[key];
    const data = item.row || {};
    const cost = Math.max(0, Number(data.cost_cny || 0));
    const tasks = Math.max(0, Number(data.generated_tasks || 0));
    return `<button type="button" class="personal-usage-item${key === safePeriod ? ' is-active' : ''}" data-usage-period="${key}" aria-pressed="${key === safePeriod ? 'true' : 'false'}">
      <div class="label"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.sublabel || '')}</b></div>
      <strong>¥${cost.toFixed(2)}</strong>
      <span>生成 ${tasks} 段 · ${escapeHtml(r38FormatTokens(data.tokens))} · ${escapeHtml(r38FormatDuration(data.generated_seconds))}</span>
    </button>`;
  };

  date.textContent = `所有时间均为北京时间（UTC+8） · 当前日期 ${summary.as_of_date || '--'}`;
  body.className = 'personal-usage-shell';
  body.innerHTML = `<div class="personal-usage-grid">${cardMarkup('today')}${cardMarkup('month')}${cardMarkup('year')}</div>
    <section id="personal-usage-chart-host" class="personal-usage-chart-card"><div class="personal-usage-loading">正在读取消费柱状图明细...</div></section>`;

  if (overview) {
    overview.hidden = false;
    overview.innerHTML = r42UsageOverviewMarkup(summary, safePeriod);
  }

  const activatePeriod = period => {
    if (!periods[period]) return;
    r38RenderUsageSummary.selectedPeriod = period;
    body.querySelectorAll('[data-usage-period]').forEach(node => {
      const active = node.dataset.usagePeriod === period;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (overview) overview.innerHTML = r42UsageOverviewMarkup(summary, period);
    void r42LoadUsageChart(period, false);
  };

  body.querySelectorAll('[data-usage-period]').forEach(node => {
    node.addEventListener('click', () => activatePeriod(node.dataset.usagePeriod || 'month'));
  });

  const inProgress = summary.in_progress || {};
  const pendingTasks = Math.max(0, Number(inProgress.task_count || 0));
  const pendingCost = Math.max(0, Number(inProgress.estimated_cost_cny || 0));
  foot.hidden = false;
  foot.innerHTML = `<span class="basis">费用按 Ark 实际 usage × 对应 Seedance 模型单价换算；失败且无 usage 不计入，最终以火山方舟账单为准。</span>
    <span class="pending">${pendingTasks ? `进行中 ${pendingTasks} 段 · 预计约 ¥${pendingCost.toFixed(2)}` : '当前无进行中计费任务'}</span>`;

  void r42LoadUsageChart(safePeriod, false);
}


async function r38LoadUsageSummary(force = false) {
  if (!state.user?.id) return;
  const now = Date.now();
  const ttl = 20_000;
  if (!force && r38LoadUsageSummary.lastFetchAt && now - r38LoadUsageSummary.lastFetchAt < ttl) {
    if (r38LoadUsageSummary.lastSummary) r38RenderUsageSummary(r38LoadUsageSummary.lastSummary);
    return r38LoadUsageSummary.lastSummary || null;
  }
  if (r38LoadUsageSummary.inFlight) return r38LoadUsageSummary.inFlight;

  if (!r38LoadUsageSummary.lastSummary) r38RenderUsageSummary(null);
  r38LoadUsageSummary.inFlight = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_my_video_usage_summary');
      if (error) throw error;
      const summary = data && typeof data === 'object' ? data : null;
      if (!summary) throw new Error('个人用量接口没有返回数据');
      r38LoadUsageSummary.lastSummary = summary;
      r38LoadUsageSummary.lastFetchAt = Date.now();
      r38RenderUsageSummary(summary);
      return summary;
    } catch (error) {
      console.warn('[Davis Video R38] personal usage summary failed', error);
      r38RenderUsageSummary(r38LoadUsageSummary.lastSummary || null, r38LoadUsageSummary.lastSummary ? null : error);
      return r38LoadUsageSummary.lastSummary || null;
    } finally {
      r38LoadUsageSummary.inFlight = null;
    }
  })();
  return r38LoadUsageSummary.inFlight;
}

export function patchV46Source(source, { supabaseUrl, dbUrl, projectVersionUrl, accessControlSource }) {
  let patched = String(source || '');
  if (!patched.includes(ORIGINAL_BUILD)) throw new Error(`只支持 ${ORIGINAL_BUILD}，当前 app-v46.js 版本不匹配`);
  patched = patched.replace("from '../supabase-config.js'", `from '${supabaseUrl}'`)
    .replace("from './db.js'", `from '${dbUrl}';\nimport { parseProjectVersion, nextProjectVersionName, cloneDraftAsVersion } from '${projectVersionUrl}'`)
    .replace(ORIGINAL_BUILD, PRODUCTION_BUILD);

  const accessControlSupport = String(accessControlSource || '').replace(/\bexport\s+/g, '');
  const categorySupportSource = `const R44_INDEX_PROJECT_CATEGORIES = Object.freeze(${JSON.stringify(R44_INDEX_PROJECT_CATEGORIES)});`;
  const support = accessControlSupport + '\n\n' + categorySupportSource + '\n\n' + [r5ModeKey,r5ModeLabel,r5ModeSuffix,r5BaseProjectName,r5Clone,r5WorkspaceHasContent,r5CreateWorkspaceClone,
    r5BuildSplitDraft,r5MigrateDraftCollection,r5ContextSnapshot,r5ContextIsCurrent,r5ExactTaskIds,
    r53IsGenericProjectName,r53NormalizePrompt,r53PromptOverlap,r53ProjectCandidateScore,r5VerifyProjectId,
    r5ResolveFixedProject,r5TaskScore,r5OutputStableKey,r5CacheRequestUrl,r5ReadPersistentVideo,r5PrunePersistentVideoCache,
    r5WritePersistentVideo,r49ParentGroupIdForDraft,r49TaskDisplayName,r49DefaultTaskName,r49FindParentGroup,r49ExpandedParentGroups,r49SaveExpandedParentGroups,r49ExpandParentGroup,r50TreeSelection,r50SetTreeSelection,r50SelectParentGroup,r50SyncDeleteButton,r50SetChildTaskNameError,r50ValidateChildTaskName,r50RemoveParentProject,r50DeleteSelectedNode,r49GroupChildren,r49LoadParentGroups,r49EnsureDraftParentBindings,r49RenderTaskContext,r49RenderProjects,r49OpenParentModal,r49CloseParentModal,r49CreateParentProject,r49OpenChildTaskModal,r49CloseChildTaskModal,r49CreateChildTask,r49WireHierarchyUi,r49RenderSettings,r50ApplySelectedTaskDom,r49SelectDraft,r49RemoveTask,r49RestoreCloudDrafts,r49ReEditSegment,r49Init,r43NormalizeCategory,r43InferHistoricalCategory,r43ProjectCategoryValue,r43IncomingProjectCategory,r43SyncCategoryCustomVisibility,r43ApplyCategoryOptions,r43LoadCategoryOptions,r43ProjectCategoryFromControls,r45SetProjectFieldError,r45ClearProjectCreateErrors,r45ValidateProjectCreateFields,r5OpenCreateModal,r5CloseCreateModal,r5CreateProjectFromMode,r5WireCreateModal,
    r6ExistingProjectNames,r6ForkCurrentDraftForSubmit,r10StableUploadPlan,r10ApplyFrameBinding,
    r10SubmissionContext,r10AssertContext,r10RecoverFrameBindings,r10RecoverOrphan,r11RestoreCloudDrafts,r13MarkVersionForkForSubmit,r14NormalizeProjectName,r14ProjectNameExists,r15HasFilePayload,r15WireFileDropzone,r15PreventDocumentFileNavigation,
    r16ProjectOwnerId,r16ScopeProjectRead,r16CurrentProjectWritable,r16AssertCurrentProjectWritable,r16ApplyReadOnlyControls,
    r18PublicSegmentState,r18StatusText,r18JobStageMarkup,r37ModelCatalog,r37ModelConfig,r37ModelLabel,r37ResolutionPixels,r37InputProfile,r37EstimateCost,r37ValidateSegmentConfig,r37SetSelectOptions,r37ApplyModelControls,r37RenderSegmentCost,r37RenderProjectCost,r37ReadMediaDuration,r38FormatTokens,r38FormatDuration,r38UsagePeriodMarkup,r42UsagePeriods,r42VisibleBars,r42UsageOverviewMarkup,r42TooltipMarkup,r42RenderUsageChart,r42LoadUsageChart,r38RenderUsageSummary,r38LoadUsageSummary].map(fn => fn.toString()).join('\n\n');

  patched = patched.replace("const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';",
    "const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';\n\n" + support);
  if (!patched.includes('.map((segment, index) => ({ ...segment, index }));')) throw new Error('无法定位 Segment 身份稳定修复点');
  patched = patched.replace('.map((segment, index) => ({ ...segment, index }));', '.map((segment, index) => { segment.index = index; return segment; });');
  const r43ProjectPayloadMarker = "    frame_fit_mode: state.draft.fitMode,\n    status: 'draft',";
  if (!patched.includes(r43ProjectPayloadMarker)) throw new Error('无法定位 video_projects 项目类别写入点');
  patched = patched.replace(
    r43ProjectPayloadMarker,
    "    frame_fit_mode: state.draft.fitMode,\n    project_category: r43ProjectCategoryValue(state.draft),\n    parent_group_id: r49ParentGroupIdForDraft(state.draft),\n    task_name: r49TaskDisplayName(state.draft),\n    task_order: Number(state.draft.taskOrder || 0),\n    status: 'draft',"
  );
  patched = replaceSection(patched, 'function newDraft() {', 'function createWorkspaceState() {', renamedFunction(r5NewDraft, 'newDraft'));
  patched = replaceSection(patched, 'function migrateDraftWorkspaces(draft) {', 'function getWorkspace(', renamedFunction(r5MigrateDraftWorkspaces, 'migrateDraftWorkspaces'));
  patched = replaceSection(patched, 'function getWorkspace(', 'function bindCurrentWorkspace() {', renamedFunction(r5GetWorkspace, 'getWorkspace'));
  patched = replaceSection(patched, 'function bindCurrentWorkspace() {', 'function saveCurrentWorkspaceSelection() {', renamedFunction(r5BindCurrentWorkspace, 'bindCurrentWorkspace'));
  patched = replaceSection(patched, 'function saveCurrentWorkspaceSelection() {', 'function workspaceLabel(', renamedFunction(r5SaveCurrentWorkspaceSelection, 'saveCurrentWorkspaceSelection'));
  patched = replaceSection(patched, 'function setView(view) {', 'function orderedDrafts() {', renamedFunction(r5SetView, 'setView'));
  patched = replaceSection(patched, 'function renderProjects() {', 'function escapeHtml(', renamedFunction(r49RenderProjects, 'renderProjects'));
  patched = replaceSection(patched, 'function renderSettings() {', 'function buildStrictFrameLockPrompt(', renamedFunction(r49RenderSettings, 'renderSettings'));
  patched = replaceSection(patched, 'function renderInspector() {', 'function renderSummary() {', renamedFunction(r37RenderInspector, 'renderInspector'));
  patched = replaceSection(patched, 'function renderSummary() {', 'function renderSettings() {', renamedFunction(r37RenderSummary, 'renderSummary'));
  patched = replaceSection(patched, 'function buildStrictFrameLockPrompt(segment) {', 'function updateRatioTip() {', renamedFunction(r34BuildStrictFrameLockPrompt, 'buildStrictFrameLockPrompt'));
  patched = replaceSection(patched, 'async function selectDraft(id) {', 'async function createProject() {', renamedFunction(r49SelectDraft, 'selectDraft'));
  patched = replaceSection(patched, 'async function createProject() {', 'async function removeProject() {', renamedFunction(r49CreateParentProject, 'createProject'));
  patched = replaceSection(patched, 'async function removeProject() {', 'function statusText(', renamedFunction(r49RemoveTask, 'removeProject'));
  patched = replaceSection(patched, 'function statusText(', 'async function ensureRemoteProject() {', renamedFunction(r18StatusText, 'statusText'));
  patched = replaceSection(patched, 'async function fetchVideoBlobThroughProxy(output) {', 'async function hydrateProxyVideoElements() {', renamedFunction(r5FetchVideoBlobThroughProxy, 'fetchVideoBlobThroughProxy'));
  patched = replaceSection(patched, 'async function hydrateProxyVideoElements() {', 'function outputCardMarkup(', renamedFunction(r5HydrateProxyVideoElements, 'hydrateProxyVideoElements'));
  patched = replaceSection(patched, 'async function recoverLatestDriveOutputWhenEmpty(force = false) {', 'function renderJobs() {', renamedFunction(r5RecoverLatestDriveOutputWhenEmpty, 'recoverLatestDriveOutputWhenEmpty'));
  patched = replaceSection(patched, 'function renderJobs() {', 'function findSegmentIdByOutputIndex(', renamedFunction(r5RenderJobs, 'renderJobs'));
  patched = replaceSection(patched, 'function jobStageMarkup(', 'function frameCard(', renamedFunction(r18JobStageMarkup, 'jobStageMarkup'));
  patched = replaceSection(patched, 'function reEditSegment(segmentId) {', 'function renderAll() {', renamedFunction(r49ReEditSegment, 'reEditSegment'));
  patched = replaceSection(patched, 'async function syncRemoteTasks() {', 'async function bindProviderTaskAndRecover(', renamedFunction(r5SyncRemoteTasks, 'syncRemoteTasks'));
  patched = replaceSection(patched, 'async function addReferenceAssets(fileList) {', 'async function uploadReferenceVideo(projectId) {', renamedFunction(r37AddReferenceAssets, 'addReferenceAssets'));
  patched = replaceSection(
    patched,
    'async function uploadReferenceAssets(projectId, segmentsForProgress = []) {',
    'function extensionFromMime(type) {',
    renamedFunction(r35UploadReferenceAssets, 'uploadReferenceAssets')
  );
  patched = replaceSection(patched, 'async function uploadNeededFrames(', 'async function submitOne(', renamedFunction(r10UploadNeededFrames, 'uploadNeededFrames'));
  patched = replaceSection(patched, 'async function refreshJobs() {', 'async function loadOutputs() {', renamedFunction(r10RefreshJobs, 'refreshJobs'));
  patched = replaceSection(patched, 'async function loadOutputs() {', 'function startPolling() {', renamedFunction(r5LoadOutputs, 'loadOutputs'));
  patched = replaceSection(patched, 'async function init() {', 'init().catch(', renamedFunction(r49Init, 'init'));

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
