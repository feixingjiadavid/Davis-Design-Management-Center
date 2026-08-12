import { supabase } from '../supabase-config.js';
import { listDrafts, saveDraft } from './db.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = v => String(v ?? '').trim();

const STATUS_GROUPS = [
  { key: 'accepted', title: '定版片段', desc: '已确认，可用于最终成片', statuses: ['accepted'] },
  { key: 'draft', title: '草稿片段', desc: '未定版，继续调整或等待确认', statuses: ['draft', 'pending_review'] },
  { key: 'backup', title: '备用片段', desc: '保留备用，不作为当前最终版本', statuses: ['backup'] },
  { key: 'needs_retry', title: '需重做', desc: '只做标记，不会自动重新生成', statuses: ['needs_retry'] },
  { key: 'rejected', title: '废弃片段', desc: '不再使用，但保留历史记录', statuses: ['rejected'] },
];

const STATUS_OPTIONS = [
  ['draft', '草稿'],
  ['accepted', '定版'],
  ['backup', '备用'],
  ['needs_retry', '需重做'],
  ['rejected', '废弃'],
];

function workspaceOf(draft) {
  const key = draft?.lockedMode || draft?.mode;
  return draft?.workspaces?.[key] || draft || null;
}
function remoteProjectId(draft) {
  const w = workspaceOf(draft);
  return text(w?.remoteProjectId || draft?.remoteProjectId || w?.bindingCandidateProjectId) || null;
}
function localIdForRow(row) {
  return $('.project-child', row)?.dataset?.project || '';
}
function normalizeStatus(value) {
  const status = text(value || 'draft') || 'draft';
  return status === 'pending_review' ? 'draft' : status;
}
function statusFromRow(row) {
  return normalizeStatus(row.dataset.aClipStatus || $('.r54-pill', row)?.dataset?.status || 'draft');
}
function bucketForStatus(status) {
  return STATUS_GROUPS.find(group => group.statuses.includes(status)) || STATUS_GROUPS[1];
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

function mountStatusSelect(row) {
  const localId = localIdForRow(row);
  if (!localId) return;
  let select = $('.a-clip-status-select', row);
  if (!select) {
    select = document.createElement('select');
    select.className = 'a-clip-status-select';
    select.setAttribute('aria-label', '片段状态');
    select.innerHTML = STATUS_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    select.addEventListener('pointerdown', event => event.stopPropagation());
    select.addEventListener('click', event => event.stopPropagation());
    select.addEventListener('change', async event => {
      event.stopPropagation();
      const next = select.value;
      const previous = statusFromRow(row);
      if (next === previous) return;
      select.disabled = true;
      try {
        await setStatus(localId, next);
        row.dataset.aClipStatus = next;
        const pill = $('.r54-pill', row);
        if (pill) pill.dataset.status = next;
        await regroupAll();
      } catch (error) {
        select.value = previous;
        alert(`状态更新失败：${error?.message || error}`);
      } finally {
        select.disabled = false;
      }
    });
    row.appendChild(select);
  }
  select.value = statusFromRow(row);
}

async function hydrateStatuses(rows) {
  const drafts = await listDrafts();
  const map = new Map(drafts.map(draft => [String(draft.id), normalizeStatus(draft.reviewStatus || draft.review_status || 'draft')]));
  rows.forEach(row => {
    const id = localIdForRow(row);
    if (!id) return;
    const status = map.get(String(id)) || statusFromRow(row);
    row.dataset.aClipStatus = status;
    const pill = $('.r54-pill', row);
    if (pill) pill.dataset.status = status;
  });
}

function buildStatusSection(group, rows) {
  const section = document.createElement('section');
  section.className = `a-status-bucket a-status-${group.key}`;
  section.dataset.aStatusBucket = group.key;
  section.innerHTML = `
    <header class="a-status-bucket-head">
      <div><strong>${group.title}</strong><small>${group.desc}</small></div>
      <span>${rows.length}</span>
    </header>
    <div class="a-status-bucket-body"></div>
  `;
  const body = $('.a-status-bucket-body', section);
  rows.forEach(row => {
    mountStatusSelect(row);
    body.appendChild(row);
  });
  return section;
}

function regroupBody(body) {
  if (!body) return;
  const rows = $$('.r54-task-row', body);
  if (!rows.length) return;
  const grouped = new Map(STATUS_GROUPS.map(group => [group.key, []]));
  rows.forEach(row => grouped.get(bucketForStatus(statusFromRow(row)).key).push(row));
  body.replaceChildren();
  for (const group of STATUS_GROUPS) {
    const groupRows = grouped.get(group.key) || [];
    if (groupRows.length) body.appendChild(buildStatusSection(group, groupRows));
  }
  body.dataset.aStatusGrouped = '1';
}

function transformLegacyBucket(box) {
  if (!box) return;
  const rows = $$('.r54-task-row', box);
  if (!rows.length) return;
  const parent = box.parentElement;
  if (!parent) return;
  const holder = document.createElement('div');
  holder.className = 'a-legacy-status-holder';
  rows.forEach(row => holder.appendChild(row));
  parent.insertBefore(holder, box);
  box.remove();
  regroupBody(holder);
}

let regrouping = false;
async function regroupAll() {
  if (regrouping) return;
  regrouping = true;
  try {
    const rows = $$('.r54-task-row');
    await hydrateStatuses(rows);
    $$('.r54-unclassified').forEach(transformLegacyBucket);
    $$('.r54-deliverable:not(.r54-unclassified) > .r54-deliverable-body').forEach(regroupBody);
    $$('.a-legacy-status-holder').forEach(regroupBody);
    $$('.r54-task-row').forEach(mountStatusSelect);
  } finally {
    regrouping = false;
  }
}

function start() {
  let lastSignature = '';
  const tick = () => {
    const signature = `${$$('.r54-unclassified').length}|${$$('.r54-task-row').length}|${$$('.r54-deliverable-body').length}`;
    if (signature !== lastSignature || $$('.r54-task-row:not(:has(.a-clip-status-select))').length) {
      lastSignature = signature;
      void regroupAll();
    }
  };
  setInterval(tick, 800);
  tick();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
