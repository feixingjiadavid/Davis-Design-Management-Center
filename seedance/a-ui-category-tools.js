import { supabase } from '../supabase-config.js';
import { listDrafts, saveDraft } from './db.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = v => String(v ?? '').trim();
const STATUS_GROUPS = [
  { key: 'accepted', title: '定版片段', desc: '已确认可以用于最终成片', statuses: ['accepted'] },
  { key: 'draft', title: '草稿片段', desc: '还没有最终确认的片段', statuses: ['draft', 'pending_review'] },
  { key: 'backup', title: '备用片段', desc: '保留备用，不作为当前最终版本', statuses: ['backup'] },
  { key: 'needs_retry', title: '需重做', desc: '只做标记，不会自动重新生成', statuses: ['needs_retry'] },
  { key: 'rejected', title: '废弃片段', desc: '不再使用，但保留历史记录', statuses: ['rejected'] },
];

function workspaceOf(draft) {
  const key = draft?.lockedMode || draft?.mode;
  return draft?.workspaces?.[key] || draft || null;
}
function remoteProjectId(draft) {
  const w = workspaceOf(draft);
  return text(w?.remoteProjectId || draft?.remoteProjectId || w?.bindingCandidateProjectId) || null;
}
function reviewStatus(draft) {
  return text(draft?.reviewStatus || draft?.review_status || 'draft') || 'draft';
}
function localIdForRow(row) {
  return $('.project-child', row)?.dataset?.project || '';
}

async function setStatus(localId, status) {
  const drafts = await listDrafts();
  const draft = drafts.find(d => String(d.id) === String(localId));
  if (!draft) throw new Error('没有找到这个片段，请刷新页面后再试。');

  draft.reviewStatus = status;
  draft.review_status = status;
  await saveDraft(draft);

  const remoteId = remoteProjectId(draft);
  if (remoteId) {
    const session = await supabase.auth.getSession();
    const user = session.data?.session?.user;
    if (!user) throw new Error('登录状态已失效');
    const { error } = await supabase
      .from('video_projects')
      .update({ review_status: status, updated_at: new Date().toISOString() })
      .eq('id', remoteId)
      .eq('owner_id', user.id);
    if (error) throw error;
  }
}

function makeQuickActions(row) {
  if ($('.a-clip-status-actions', row)) return;
  const localId = localIdForRow(row);
  if (!localId) return;
  const actions = document.createElement('div');
  actions.className = 'a-clip-status-actions';
  actions.innerHTML = `
    <span class="a-clip-status-label">片段状态</span>
    <button type="button" data-a-status="accepted">✓ 定版</button>
    <button type="button" data-a-status="draft">未定版</button>
    <button type="button" data-a-status="backup">备用</button>
    <button type="button" data-a-status="needs_retry">需重做</button>
  `;
  actions.addEventListener('click', event => {
    const btn = event.target.closest('[data-a-status]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '保存中…';
    void setStatus(localId, btn.dataset.aStatus)
      .then(() => location.reload())
      .catch(error => {
        alert(`状态更新失败：${error?.message || error}`);
        btn.disabled = false;
        btn.textContent = old;
      });
  });
  row.appendChild(actions);
}

function bucketForStatus(status) {
  return STATUS_GROUPS.find(group => group.statuses.includes(status)) || STATUS_GROUPS[1];
}

function statusFromRow(row) {
  const pill = $('.r54-pill', row);
  return text(pill?.dataset?.status || 'draft') || 'draft';
}

function buildStatusSection(group, rows) {
  const section = document.createElement('section');
  section.className = `a-status-bucket a-status-${group.key}`;
  section.dataset.aStatusBucket = group.key;
  section.innerHTML = `
    <header class="a-status-bucket-head">
      <div>
        <strong>${group.title}</strong>
        <small>${group.desc}</small>
      </div>
      <span>${rows.length}</span>
    </header>
    <div class="a-status-bucket-body"></div>
  `;
  const body = $('.a-status-bucket-body', section);
  rows.forEach(row => {
    makeQuickActions(row);
    body.appendChild(row);
  });
  return section;
}

function transformLegacyBucket(box) {
  if (!box || box.dataset.aAutoGrouped === '1') return;
  const rows = $$('.r54-task-row', box);
  if (!rows.length) return;
  box.dataset.aAutoGrouped = '1';
  box.classList.add('a-auto-status-root');

  const grouped = new Map(STATUS_GROUPS.map(group => [group.key, []]));
  rows.forEach(row => {
    const bucket = bucketForStatus(statusFromRow(row));
    grouped.get(bucket.key).push(row);
  });

  const parent = box.parentElement;
  if (!parent) return;
  const anchor = box;
  for (const group of STATUS_GROUPS) {
    const groupRows = grouped.get(group.key) || [];
    if (!groupRows.length) continue;
    parent.insertBefore(buildStatusSection(group, groupRows), anchor);
  }
  box.remove();
}

function decorateExistingDeliverables() {
  $$('.r54-deliverable:not(.r54-unclassified)').forEach(deliverable => {
    $$('.r54-task-row', deliverable).forEach(makeQuickActions);
  });
}

function run() {
  $$('.r54-unclassified').forEach(transformLegacyBucket);
  decorateExistingDeliverables();
}

function start() {
  let previous = '';
  setInterval(() => {
    const signature = `${$$('.r54-unclassified').length}|${$$('.r54-task-row').length}|${$$('.a-clip-status-actions').length}`;
    if (signature !== previous) {
      previous = signature;
      run();
    }
  }, 450);
  run();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
