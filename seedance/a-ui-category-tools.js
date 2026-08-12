import { supabase } from '../supabase-config.js';
import { listDrafts, saveDraft } from './db.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = v => String(v ?? '').trim();

function workspaceOf(draft) {
  const key = draft?.lockedMode || draft?.mode;
  return draft?.workspaces?.[key] || draft || null;
}
function remoteProjectId(draft) {
  const w = workspaceOf(draft);
  return text(w?.remoteProjectId || draft?.remoteProjectId || w?.bindingCandidateProjectId) || null;
}
function groupId(draft) {
  return text(draft?.parentGroupId || draft?.parent_group_id) || null;
}
function taskName(draft, fallback='这个任务') {
  return text(draft?.taskName || draft?.task_name || draft?.name) || fallback;
}

function ensureModal() {
  if ($('#a-organize-modal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="a-organize-modal" class="a-organize-modal" hidden>
      <div class="a-organize-backdrop" data-a-organize-close></div>
      <section class="a-organize-dialog" role="dialog" aria-modal="true" aria-labelledby="a-organize-title">
        <header>
          <div>
            <h2 id="a-organize-title">整理任务</h2>
            <p id="a-organize-subtitle">把这个生成任务放进一个成片单元，后面会更容易查找和批量管理。</p>
          </div>
          <button type="button" class="a-organize-x" data-a-organize-close>×</button>
        </header>
        <div class="a-organize-body">
          <label class="a-organize-field">
            <span>放到哪个成片单元？</span>
            <select id="a-organize-select"></select>
          </label>
          <label id="a-organize-new-wrap" class="a-organize-field" hidden>
            <span>新成片单元名称</span>
            <input id="a-organize-new-name" type="text" maxlength="80" placeholder="例如：互动暖场视频 / 开场视频 / 采访包装视频" />
            <small>成片单元就是这个业务项目里最终要交付的一类视频。</small>
          </label>
          <div class="a-organize-example">
            <b>怎么分？</b>
            <span>同一批、同一种用途的视频放在一起即可。例如 45 位员工互动视频，都放进「互动暖场视频」。</span>
          </div>
        </div>
        <footer>
          <button type="button" data-a-organize-close>取消</button>
          <button type="button" id="a-organize-confirm" class="primary">确认移动</button>
        </footer>
      </section>
    </div>
  `);

  $$('[data-a-organize-close]').forEach(btn => btn.addEventListener('click', closeModal));
  $('#a-organize-select').addEventListener('change', syncNewField);
  $('#a-organize-confirm').addEventListener('click', confirmMove);
}

const modalState = { draft: null, row: null, deliverables: [] };

function closeModal() {
  const modal = $('#a-organize-modal');
  if (modal) modal.hidden = true;
  modalState.draft = null;
  modalState.row = null;
  modalState.deliverables = [];
}
function syncNewField() {
  const isNew = $('#a-organize-select')?.value === '__new__';
  const wrap = $('#a-organize-new-wrap');
  if (wrap) wrap.hidden = !isNew;
  if (isNew) setTimeout(() => $('#a-organize-new-name')?.focus(), 0);
}

async function openMoveModal(row) {
  ensureModal();
  const child = $('.project-child', row);
  const draftId = child?.dataset?.project;
  if (!draftId) return;

  const drafts = await listDrafts();
  const draft = drafts.find(d => String(d.id) === String(draftId));
  if (!draft) {
    alert('没有找到这个任务的本地记录，请刷新页面后再试。');
    return;
  }
  const gid = groupId(draft);
  if (!gid) {
    alert('这个旧任务还没有绑定业务项目，暂时不能整理。');
    return;
  }

  const { data, error } = await supabase
    .from('video_deliverables')
    .select('id,name,sort_order')
    .eq('parent_group_id', gid)
    .neq('status', 'deleted')
    .order('sort_order', { ascending: true });
  if (error) {
    alert(`读取成片单元失败：${error.message || error}`);
    return;
  }

  modalState.draft = draft;
  modalState.row = row;
  modalState.deliverables = data || [];

  const select = $('#a-organize-select');
  select.innerHTML = '';
  for (const item of modalState.deliverables) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  }
  const create = document.createElement('option');
  create.value = '__new__';
  create.textContent = modalState.deliverables.length ? '＋ 新建成片单元' : '＋ 新建第一个成片单元';
  select.appendChild(create);
  if (!modalState.deliverables.length) select.value = '__new__';

  $('#a-organize-title').textContent = `整理「${taskName(draft)}」`;
  $('#a-organize-new-name').value = '';
  syncNewField();
  $('#a-organize-modal').hidden = false;
}

async function confirmMove() {
  const draft = modalState.draft;
  if (!draft) return;
  const confirm = $('#a-organize-confirm');
  confirm.disabled = true;
  confirm.textContent = '正在移动…';

  try {
    let deliverableId = $('#a-organize-select').value;
    if (deliverableId === '__new__') {
      const name = text($('#a-organize-new-name').value);
      if (!name) {
        alert('请输入成片单元名称。');
        return;
      }
      const session = await supabase.auth.getSession();
      const user = session.data?.session?.user;
      if (!user) throw new Error('登录状态已失效');
      const gid = groupId(draft);
      const { data, error } = await supabase
        .from('video_deliverables')
        .insert({ owner_id: user.id, parent_group_id: gid, name, status: 'active' })
        .select('id,name')
        .single();
      if (error) throw error;
      deliverableId = data.id;
    }

    const remoteId = remoteProjectId(draft);
    if (remoteId) {
      const { error } = await supabase
        .from('video_projects')
        .update({ deliverable_id: deliverableId })
        .eq('id', remoteId);
      if (error) throw error;
    }

    draft.deliverableId = deliverableId;
    draft.deliverable_id = deliverableId;
    const w = workspaceOf(draft);
    if (w && w !== draft) {
      w.deliverableId = deliverableId;
      w.deliverable_id = deliverableId;
    }
    await saveDraft(draft);

    closeModal();
    location.reload();
  } catch (error) {
    alert(`移动失败：${error?.message || error}`);
  } finally {
    confirm.disabled = false;
    confirm.textContent = '确认移动';
  }
}

function decorateUnclassified(box) {
  if (!box || box.dataset.aFriendly === '1') return;
  box.dataset.aFriendly = '1';
  const title = $('.r54-deliverable-main strong', box);
  const small = $('.r54-deliverable-main small', box);
  if (title) title.textContent = '待整理任务';
  if (small) small.textContent = '这些是旧任务，还没有放进具体成片单元';
  const head = $('.r54-deliverable-head', box);
  if (head && !$('.a-organize-hint', head)) {
    head.insertAdjacentHTML('afterend', '<div class="a-organize-hint">先把旧任务整理到具体成片单元。整理后，批量生成、审核和版本管理会更清楚。</div>');
  }
}

function decorateRows() {
  $$('.r54-unclassified').forEach(decorateUnclassified);
  $$('.r54-unclassified .r54-task-row').forEach(row => {
    if ($('.a-move-task-btn', row)) return;
    const actions = document.createElement('div');
    actions.className = 'a-task-organize-actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'a-move-task-btn';
    btn.textContent = '移动到成片单元';
    btn.title = '把这个旧任务整理到一个具体的成片单元';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void openMoveModal(row);
    });
    actions.appendChild(btn);
    row.appendChild(actions);
  });
}

function start() {
  ensureModal();
  let lastSignature = '';
  setInterval(() => {
    const signature = $$('.r54-unclassified').map(x => `${x.querySelectorAll('.r54-task-row').length}`).join(',');
    if (signature !== lastSignature || $$('.r54-unclassified .r54-task-row:not(:has(.a-task-organize-actions))').length) {
      lastSignature = signature;
      decorateRows();
    }
  }, 500);
  decorateRows();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
