const PRODUCTION_BUILD = '20260810-jianying-project-bridge-r53';
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
 * R32 FFmpeg Worker 鍚屾簮鍏煎灞傘€? * 涓嶅啀淇敼 app-v46.js 鐢熸垚鍚庣殑 mergeAll 婧愮爜銆? */
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
  "Smart鏂囧寲-OpenTalk",
  "Smart鏂囧寲-1024",
  "Smart鏂囧寲-鍚庡嫟灏忕瀹?,
  "Smart鏂囧寲-灏忚摑涔﹁繍钀?,
  "Smart鏂囧寲-閫佺墿鏈哄櫒浜?,
  "鑽ｈ獕浣撶郴-鍗虫椂婵€鍔?,
  "鑽ｈ獕浣撶郴-鑽ｈ獕濂栭」",
  "鑽ｈ獕浣撶郴-AI濂栭」",
  "鑽ｈ獕浣撶郴-鏈€浣虫媿妗?,
  "鑽ｈ獕浣撶郴-绉戞妧鍚堜綔绀?,
  "鑽ｈ獕浣撶郴-鏋佸鍥?,
  "骞村害澶т細-姝︽眽",
  "骞村害澶т細-涓婃捣",
  "骞村害澶т細-琛屽簡",
  "HR渚х浉鍏?鍛ㄥ勾搴?,
  "HR渚х浉鍏?鍒濆叓鍥㈡嫓",
  "宸ヤ細鐩稿叧-鍥㈠缓鏃呮父",
  "宸ヤ細鐩稿叧-杩愬姩瀛?,
  "宸ヤ細鐩稿叧-鏂囦綋娲诲姩",
  "甯歌娲诲姩-鏂颁汉鍏ヨ亴",
  "甯歌娲诲姩-绉戞妧鍚堣閾剁洃浜鸿绫绘敮鎸?,
  "甯歌娲诲姩-骞村喅",
  "甯歌娲诲姩-绠＄悊鍥㈤槦娲诲姩",
  "甯歌娲诲姩-澶栫睄鍛樺伐鏀寔",
  "鍝佸鏀寔",
  "绉戞妧瀛愭敮鎸?,
  "琛屽搧瀹ｈ璁″鎺?,
  "閮ㄩ棬-鍩虹",
  "閮ㄩ棬-鏁颁笟",
  "閮ㄩ棬-璐锋",
  "閮ㄩ棬-瀛樻",
  "閮ㄩ棬-浼佸悓",
  "閮ㄩ棬-璐㈠瘜",
  "閮ㄩ棬-鏀跨",
  "閮ㄩ棬-鏁板彂",
  "閮ㄩ棬-瀹夊叏",
  "閮ㄩ棬-涓婃捣",
  "閮ㄩ棬-姝︽眽",
  "閮ㄩ棬-鎴愰兘",
  "閮ㄩ棬-绉戠"
]);

function r43NormalizeCategory(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function r43InferHistoricalCategory(name) {
  const value = String(name || '').toLocaleLowerCase('zh-CN');
  if (value.includes('鍛ㄥ勾')) return 'HR渚х浉鍏?鍛ㄥ勾搴?;
  if (value.includes('鑽ｈ獕') || value.includes('婵€鍔?)) return '鑽ｈ獕浣撶郴-鍗虫椂婵€鍔?;
  if (value.includes('灏忚摑涔?)) return 'Smart鏂囧寲-灏忚摑涔﹁繍钀?;
  if (value.includes('鍥㈠缓') || value.includes('鏃呮父')) return '宸ヤ細鐩稿叧-鍥㈠缓鏃呮父';
  if (value.includes('opentalk') || value.includes('waic')) return 'Smart鏂囧寲-OpenTalk';
  if (value.includes('鏈哄櫒浜?)) return 'Smart鏂囧寲-閫佺墿鏈哄櫒浜?;
  if (value.includes('璐锋')) return '閮ㄩ棬-璐锋';
  if (value.includes('璐㈠瘜')) return '閮ㄩ棬-璐㈠瘜';
  if (value.includes('涓婃捣')) return '閮ㄩ棬-涓婃捣';
  if (value.includes('鎴愰兘')) return '閮ㄩ棬-鎴愰兘';
  return '鍏朵粬';
}

function r43ProjectCategoryValue(draft = state.draft) {
  if (!draft) return '鍏朵粬';
  return r43NormalizeCategory(draft.projectCategory || draft.project_category)
    || r43InferHistoricalCategory(draft.name)
    || '鍏朵粬';
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
  // R44锛氫笅鎷夐€夐」蹇呴』涓?index.html 鐨?PROJECT_LIST 涓€瀛椾笉宸€侀『搴忎竴鑷淬€?  // Supabase RPC 璐熻矗杩斿洖寤鸿鍊硷紱鍗充娇 RPC 鏆傛椂澶辫触锛屽畬鏁寸被鍒篃涓嶈兘缂哄け銆?  const values = [...R44_INDEX_PROJECT_CATEGORIES];

  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  const other = document.createElement('option');
  other.value = '__other__';
  other.textContent = '鍏朵粬锛堟墜鍔ㄥ～鍐欙級';
  select.appendChild(other);

  const incoming = r43IncomingProjectCategory();
  const suggested = r43NormalizeCategory(payload?.suggested_category);
  let preferred = '';
  if (!resetSelection && currentValue && currentValue !== '__other__' && values.includes(currentValue)) {
    preferred = currentValue;
  } else if (!resetSelection && currentValue === '__other__' && currentCustom) {
    preferred = currentCustom;
  } else {
    preferred = incoming || suggested || '鍏朵粬';
  }

  if (values.includes(preferred)) {
    select.value = preferred;
    if (custom) custom.value = '';
  } else {
    select.value = '__other__';
    if (custom) custom.value = preferred && preferred !== '鍏朵粬' ? preferred : '';
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
    loading.textContent = '姝ｅ湪璇诲彇璁捐闇€姹傞」鐩被鍒?..';
    select.appendChild(loading);
  }

  r43LoadCategoryOptions.inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_video_project_category_options');
      if (error) throw error;
      const result = data && typeof data === 'object'
        ? data
        : { options: R44_INDEX_PROJECT_CATEGORIES.map(value => ({ value, label: value })), suggested_category: null, fallback: '鍏朵粬', source: 'index.PROJECT_LIST' };
      r43LoadCategoryOptions.cache = result;
      return result;
    } catch (error) {
      console.warn('[Davis Video R44] project category options failed; using index PROJECT_LIST fallback', error);
      const fallback = { options: R44_INDEX_PROJECT_CATEGORIES.map(value => ({ value, label: value })), suggested_category: null, fallback: '鍏朵粬', source: 'index.PROJECT_LIST' };
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
  if (!select || select.value === '__loading__') return '鍏朵粬';
  if (select.value === '__other__') {
    return r43NormalizeCategory(custom?.value) || '鍏朵粬';
  }
  return r43NormalizeCategory(select.value) || '鍏朵粬';
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
      selectValue === '__loading__' ? '椤圭洰绫诲埆浠嶅湪鍔犺浇锛岃绋嶅悗鍐嶉€夋嫨銆? : '璇烽€夋嫨椤圭洰绫诲埆銆?
    );
    missing.push('椤圭洰绫诲埆');
    firstInvalid ||= select;
  } else if (selectValue === '__other__' && !customValue) {
    r45SetProjectFieldError(
      'new-project-category-custom',
      'new-project-category-custom-error',
      '閫夋嫨鈥滃叾浠栤€濆悗蹇呴』濉啓鑷畾涔夐」鐩被鍒€?
    );
    missing.push('鑷畾涔夐」鐩被鍒?);
    firstInvalid ||= custom;
  }

  if (!nameValue) {
    r45SetProjectFieldError(
      'new-project-name',
      'new-project-name-error',
      '璇峰～鍐欓」鐩悕绉帮紝涓嶈兘浣跨敤鏈懡鍚嶉」鐩洿鎺ュ垱寤恒€?
    );
    missing.push('椤圭洰鍚嶇О');
    firstInvalid ||= nameInput;
  }

  if (missing.length) {
    const unique = [...new Set(missing)];
    toast('璇峰厛濉啓鐢熸垚褰掑睘', `${unique.join('銆?)}涓哄繀濉」銆傚～鍐欏畬鏁村悗鍐嶅垱寤洪」鐩€俙);
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
  return mode === 'first_last' ? '棣栧熬甯т换鍔? : (mode === 'text_only' ? '绾枃瀛椾换鍔? : '澶氬抚 Storyboard 浠诲姟');
}
function r49DefaultTaskName(mode, index = 1) {
  const n = String(Math.max(1, Number(index) || 1)).padStart(2,'0');
  const key = r5ModeKey(mode);
  return key === 'first_last' ? `棣栧熬甯т换鍔?${n}` : (key === 'text_only' ? `绾枃瀛椾换鍔?${n}` : `澶氬抚 Storyboard 浠诲姟 ${n}`);
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
    button.textContent = '鍒犻櫎褰撳墠椤圭洰';
    const foreign = Boolean(group && String(group.owner_id || '') !== String(state.user?.id || ''));
    button.disabled = !group || foreign;
    button.title = foreign ? '鍏朵粬鐢ㄦ埛鐨勯」鐩粎鍏佽鏌ョ湅' : '鍒犻櫎褰撳墠涓€绾ч」鐩強鍏跺瓙浠诲姟鍏ュ彛';
    return;
  }

  button.textContent = '鍒犻櫎褰撳墠浠诲姟';
  const draft = state.draft;
  const writable = Boolean(draft) && r16CurrentProjectWritable(draft);
  button.disabled = !writable;
  button.title = draft && !writable ? '鍏朵粬鐢ㄦ埛鐨勪换鍔′粎鍏佽鏌ョ湅' : '鍒犻櫎褰撳墠瀛愮敓鎴愪换鍔?;
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
  r50SetChildTaskNameError('璇峰～鍐欎换鍔″悕绉板悗鍐嶉€夋嫨鐢熸垚妯″紡銆?);
  toast('璇峰～鍐欎换鍔″悕绉?, '浠诲姟鍚嶇О涓哄繀濉」銆傚～鍐欏悗鎵嶈兘鍒涘缓棣栧熬甯с€佸甯?Storyboard 鎴栫函鏂囧瓧浠诲姟銆?);
  input?.focus();
  return '';
}

async function r50RemoveParentProject(groupId) {
  const group = r49FindParentGroup(groupId);
  if (!group) return toast('鍒犻櫎澶辫触','娌℃湁鎵惧埌褰撳墠涓€绾ч」鐩紝璇峰埛鏂板悗閲嶈瘯銆?);
  if (String(group.owner_id || '') !== String(state.user?.id || '')) return toast('鍙椤圭洰','涓嶈兘鍒犻櫎鍏朵粬鐢ㄦ埛鐨勪竴绾ч」鐩€?);

  const children = r49GroupChildren(group.id);
  if (!await confirmBox(
    '鍒犻櫎褰撳墠椤圭洰',
    `纭畾鍒犻櫎鈥?{group.name}鈥濆悧锛熻椤圭洰涓?${children.length} 涓敓鎴愪换鍔′細涓€骞朵粠椤圭洰鏍戠Щ闄わ紱宸茬敓鎴愮殑瑙嗛銆丄rk 浠诲姟鍜岃緭鍑鸿褰曚粛淇濈暀鍦ㄤ簯绔巻鍙茶褰曚腑銆俙
  )) return;

  const ownerId = String(group.owner_id || state.user.id);

  const childCloud = await supabase.from('video_projects')
    .update({ status:'deleted', updated_at:new Date().toISOString() })
    .eq('owner_id', ownerId)
    .eq('parent_group_id', group.id)
    .neq('status','deleted');
  if (childCloud.error) {
    console.error('[Davis Video R50] delete project children failed', childCloud.error);
    return toast('鍒犻櫎澶辫触', errorMessage(childCloud.error,'椤圭洰涓嬪瓙浠诲姟鍒犻櫎澶辫触锛岃閲嶈瘯銆?));
  }

  const parentCloud = await supabase.from('video_project_groups')
    .update({ status:'deleted', updated_at:new Date().toISOString() })
    .eq('id', group.id)
    .eq('owner_id', ownerId)
    .select('id,status')
    .maybeSingle();
  if (parentCloud.error || !parentCloud.data || String(parentCloud.data.status || '').toLowerCase() !== 'deleted') {
    console.error('[Davis Video R50] delete parent project failed', parentCloud.error || parentCloud.data);
    return toast('鍒犻櫎澶辫触', parentCloud.error ? errorMessage(parentCloud.error,'涓€绾ч」鐩垹闄ゅけ璐?) : '涓€绾ч」鐩病鏈夋垚鍔熸爣璁颁负宸插垹闄わ紝璇烽噸璇曘€?);
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
  state.projectGroups = (sta…48303 tokens truncated…ew-project').onclick = r49OpenParentModal;");
  const modeSwitchBlock = `  qsa('#mode-switch button').forEach(btn => btn.onclick = async () => {
    saveCurrentWorkspaceSelection();
    state.draft.mode = btn.dataset.mode === 'first_last' ? 'first_last' : (btn.dataset.mode === 'text_only' ? 'text_only' : 'multi_frame');
    bindCurrentWorkspace();
    normalizeSegments(state.draft);
    saveCurrentWorkspaceSelection();
    renderAll();
    await persist();
    toast('宸插垏鎹㈠伐浣滃尯', \`\${workspaceLabel()} 鐨勫浘鐗囥€佹彁绀鸿瘝銆佷换鍔″拰杈撳嚭鐙珛淇濆瓨銆俓`);
  });
`;
  if (!patched.includes(modeSwitchBlock)) throw new Error('鏃犳硶瀹氫綅鏃фā寮忓垏鎹簨浠?);
  patched = patched.replace(modeSwitchBlock, '');

  patched = patched.replaceAll(
    "      mime_type: item.type,\n      usage: 'free_prompt_reference',",
    "      mime_type: item.type,\n      duration_seconds: Number(item.durationSeconds || item.duration_seconds || 0) || null,\n      usage: 'free_prompt_reference',"
  );

  const framePromptModeMarker = "    prompt_mode: isTextOnly ? 'text_reference_video_v14' : 'strict_frame_lock_v14',";
  const framePromptModeReplacement = "    prompt_mode: isTextOnly ? 'text_reference_video_v14' : 'strict_first_last_client_v28',";
  if (!patched.includes(framePromptModeMarker)) throw new Error('鏃犳硶瀹氫綅棣栧熬甯?prompt_mode');
  patched = patched.replace(framePromptModeMarker, framePromptModeReplacement);

  const frameLockBodyMarker = "    frame_fit_mode: state.draft.fitMode,\n    final_width: Number(state.draft.finalWidth),";
  const frameLockBodyReplacement = "    frame_fit_mode: state.draft.fitMode,\n    frame_lock_policy: isTextOnly ? null : 'strict_first_last_server_v2',\n    storyboard_parent_mode: state.draft.mode,\n    segment_position: Number(segment.index || 0),\n    final_width: Number(state.draft.finalWidth),";
  if (!patched.includes(frameLockBodyMarker)) throw new Error('鏃犳硶瀹氫綅棣栧熬甯ф彁浜ゅ厓鏁版嵁');
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
  const statement = payload.statement || '鎴戠‘璁ゅ凡鑾峰緱璇ュ浘鐗?瑙嗛绱犳潗鐨勫悎娉曚娇鐢ㄦ潈锛屽苟鎵挎媴鐢辨浜х敓鐨勮矗浠汇€?;
  const accepted = await confirmBox('绱犳潗浣跨敤鏉冪‘璁?, statement);
  if (!accepted) throw new Error('宸插彇娑堢礌鏉愪娇鐢ㄦ潈纭');
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
    "      if (!data.task_id || !data.provider_task_id) throw new Error(data.error || 'Seedance 鎻愪氦鎺ュ彛娌℃湁杩斿洖 task_id / provider_task_id');",
    "      if (!data.task_id) throw new Error(data.error || 'Seedance 鎻愪氦鎺ュ彛娌℃湁杩斿洖 task_id');"
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
  if (generateStart < 0 || generateEnd < 0) throw new Error('鏃犳硶瀹氫綅 generateSegments 瀹屾暣鍖烘');
  const generateSource = patched.slice(generateStart, generateEnd)
    .replace('  const segments = state.draft.segments.filter(s => segmentIds.includes(s.id));',
      '  let segments = state.draft.segments.filter(s => segmentIds.includes(s.id));');
  patched = patched.slice(0, generateStart) + generateSource + patched.slice(generateEnd);
  const destructiveFrameReset = `        frame.remoteAssetId = null;
        frame.remotePath = null;
        frame.arkSafeVersion = null;
        frame.wasAspectPadded = false;`;
  const safeFrameReset = `        // R27锛氫繚鐣欐棫 asset/path 浣滀负鍘熷浘鎭㈠鏉ユ簮锛涘彧璁╁畨鍏ㄧ増鏈け鏁堬紝寮哄埗閲嶆柊琛ヨ竟涓婁紶銆?        // 鏂板畨鍏?asset 鍐欏叆鎴愬姛鍚?uploadFrame 鎵嶆浛鎹㈢粦瀹氾紝閬垮厤 persist() 鍦ㄤ笂浼犲墠鍗℃銆?        frame.arkSafeVersion = null;
        frame.wasAspectPadded = false;`;
  if (!patched.includes(destructiveFrameReset)) throw new Error('鏃犳硶瀹氫綅鏃х殑寮哄埗鍥剧墖閲嶄紶娓呯悊閫昏緫');
  patched = patched.replace(destructiveFrameReset, safeFrameReset);
  const oldGenerateCatch = `  } catch (error) {
    const message = errorMessage(error, '鎻愪氦澶辫触');
    segments.forEach(segment => {
      if (['preparing','uploading','submitting','submitted','queued'].includes(segment.status)) {
        segment.status = 'failed';
        segment.progress = 0;
        segment.error = message;
      }
    });`;
  const newGenerateCatch = `  } catch (error) {
    const message = errorMessage(error, '鎻愪氦澶辫触');
    segments.forEach(segment => {
      if (!['completed','succeeded','success','running','processing','generating','uploading_drive'].includes(String(segment.status || '').toLowerCase())) {
        segment.status = 'failed';
        segment.progress = 0;
        segment.uploadStage = null;
        segment.error = message;
      }
    });`;
  if (!patched.includes(oldGenerateCatch)) throw new Error('鏃犳硶瀹氫綅鐢熸垚澶辫触鍙嶉閫昏緫');
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
      toast('灏嗗湪褰撳墠浠诲姟鏂板鐢熸垚', '褰撳墠瀛愪换鍔″凡鏈夊巻鍙蹭换鍔℃垨瑙嗛锛涙湰娆＄敓鎴愪粛褰掑睘浜庡綋鍓嶅瓙浠诲姟锛屼笉浼氬垱寤烘柊鐨勪竴绾ч」鐩垨 V-N 椤圭洰銆?);
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
  if (!patched.includes(autoReset)) throw new Error('鏃犳硶瀹氫綅鏃ц嚜鍔ㄩ噸缃唬鐮?);
  patched = patched.replace(autoReset, guard);
  const versionForkMarker = "  if (!await confirmBox('纭鎻愪氦鐪熷疄浠诲姟', `灏嗘彁浜?${segments.length} 涓棰戠墖娈点€備负閬垮厤 Ark 杩炴帴瓒呮椂锛屽甯т細閫愭鎻愪氦锛屽彲鑳戒骇鐢?Ark API 璐圭敤銆俙)) return;";
  if (!patched.includes(versionForkMarker)) throw new Error('鏃犳硶瀹氫綅鐗堟湰鍒嗗弶鎻愪氦鐐?);
  const r37PaidConfirm = `  const modelIssue = segments.map(segment => r37ValidateSegmentConfig(segment)).find(Boolean);
  if (modelIssue) return toast('褰撳墠妯″瀷閰嶇疆涓嶅彲鎻愪氦', modelIssue);
  const costRows = segments.map(segment => r37EstimateCost(segment));
  const estimatedTotal = costRows.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const lowerBoundCost = costRows.some(item => item.lowerBound);
  const costSummary = costRows.map((item, index) => 'SEG ' + String(index + 1).padStart(2,'0') + '锛? + item.model + ' 路 ' + item.duration + 's 路 ' + (item.resolution === '4k' ? '4K' : item.resolution.toUpperCase()) + ' 路 ' + item.inputLabel + ' 路 ' + (item.generateAudio ? '鏈夊０' : '鏃犲０') + ' 鈮?楼' + item.cost.toFixed(2)).join('锛?);
  if (!await confirmBox('纭鎻愪氦鐪熷疄浠诲姟', '灏嗘彁浜?' + segments.length + ' 涓棰戠墖娈点€俓\n\\n鏈棰勪及璐圭敤' + (lowerBoundCost ? '鑷冲皯' : '绾?) + ' 楼' + estimatedTotal.toFixed(2) + '銆俓\n' + costSummary + '\\n\\n鏈€缁堣垂鐢ㄤ互 Ark usage / 鐏北鏂硅垷璐﹀崟涓哄噯銆?)) return;`;
  patched = patched.replace(versionForkMarker, r37PaidConfirm);
  const r37ConfirmEndMarker = "  if (!await confirmBox('纭鎻愪氦鐪熷疄浠诲姟', '灏嗘彁浜?' + segments.length + ' 涓棰戠墖娈点€俓\n\\n鏈棰勪及璐圭敤' + (lowerBoundCost ? '鑷冲皯' : '绾?) + ' 楼' + estimatedTotal.toFixed(2) + '銆俓\n' + costSummary + '\\n\\n鏈€缁堣垂鐢ㄤ互 Ark usage / 鐏北鏂硅垷璐﹀崟涓哄噯銆?)) return;";
  if (!patched.includes(r37ConfirmEndMarker)) throw new Error('鏃犳硶瀹氫綅 R37 璐圭敤纭鐐?);
  patched = patched.replace(r37ConfirmEndMarker, r37ConfirmEndMarker + '\n' + "  if (state.draft?.pendingVersionFork) {\n    try {\n      const versionFork = await r6ForkCurrentDraftForSubmit(segmentIds);\n      if (versionFork) {\n        segmentIds = versionFork.segmentIds;\n        segments = state.draft.segments.filter(segment => segmentIds.includes(segment.id));\n        options = { ...options, allowResubmit: false, versionForked: true };\n        if (!segments.length) return toast('鏃犳硶鍒涘缓鏂扮増鏈换鍔?, '鏂扮増鏈腑娌℃湁鎵惧埌瑕佹彁浜ょ殑鐗囨銆?);\n      }\n    } catch (error) {\n      console.error('[Davis Video Studio] version fork failed', error);\n      return toast('鏂扮増鏈垱寤哄け璐?, errorMessage(error, '鏃犳硶鍒涘缓鐙珛鐗堟湰锛岃绋嶅悗閲嶈瘯'));\n    }\n  }");
  patched = patched.replace("    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; });",
    "    segments.forEach(s => { s.status = 'preparing'; s.progress = 1; s.error = null; s.submissionStartedAt = Date.now(); if (options.allowResubmit) { s.remoteTaskId = null; s.providerTaskId = null; s.remoteSegmentId = null; s.outputPath = null; } });");
  const fileDropEvents = `  const zone = $('upload-zone');
  ['dragenter','dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', event => addFiles(event.dataTransfer.files));`;
  if (!patched.includes(fileDropEvents)) throw new Error('鏃犳硶瀹氫綅鏂囦欢鎷栨斁浜嬩欢缁戝畾');
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
  if (!patched.includes(projectPayloadMarker)) throw new Error('鏃犳硶瀹氫綅杩滅椤圭洰鐗堟湰瀛楁');
  patched = patched.replace(projectPayloadMarker, projectPayloadReplacement);
  const projectBindingMarker = `  state.draft.remoteProjectId = result.data.id;
  workspace.remoteProjectId = result.data.id;`;
  const projectBindingReplacement = `  state.draft.remoteProjectId = result.data.id;
  state.draft.versionSourceProjectId = result.data.version_source_project_id || state.draft.versionSourceProjectId || null;
  state.draft.versionRootProjectId = result.data.version_root_id || state.draft.versionRootProjectId || result.data.id;
  state.draft.versionNumber = Math.max(1, Number(result.data.version_number) || Number(state.draft.versionNumber) || 1);
  workspace.remoteProjectId = result.data.id;`;
  if (!patched.includes(projectBindingMarker)) throw new Error('鏃犳硶瀹氫綅杩滅椤圭洰缁戝畾鐐?);
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
  // R25锛氫繚鐣?app-v46.js 鐨?makeArkSafeFrameBlob 鑷姩琛ヨ竟锛屼笉鍐嶆妸鍘熷瓒呭/瓒呴珮鍥剧墖缁曡繃棰勫鐞嗙洿鎺ヤ笂浼犮€?  // R29锛氱函鏂囧瓧鍙傝€冪礌鏉愭彁绀哄凡鍐呯疆鍒?r28BuildStrictFrameLockPrompt锛涚姝㈠啀瀵瑰凡鏇挎崲鍑芥暟鍋氫簩娆?marker patch銆?  return `${patched}
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
  if (!response.ok) throw new Error(`璇诲彇 app-v46.js 澶辫触锛欻TTP ${response.status}`);
  if (!accessControlResponse.ok) throw new Error(`璇诲彇 access-control.mjs 澶辫触锛欻TTP ${accessControlResponse.status}`);
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
    box.innerHTML = `<strong>Davis Video 鍚姩澶辫触</strong><br>${String(error?.message || error).replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}<br><br>璇蜂繚鐣?seedance/app-v46.js锛屽苟瑕嗙洊鏈寘涓殑 ai-assistant.html 涓?seedance/app.js锛涢殢鍚?Ctrl+F5 寮哄埗鍒锋柊銆俙;
    document.body.appendChild(box);
  });
}

