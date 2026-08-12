import { listDrafts } from './db.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = v => String(v ?? '').trim();

const STATUS_GROUPS = [
  { key: 'accepted', title: '定版', statuses: ['accepted'] },
  { key: 'draft', title: '草稿', statuses: ['draft', 'pending_review'] },
  { key: 'backup', title: '备用', statuses: ['backup'] },
  { key: 'needs_retry', title: '需重做', statuses: ['needs_retry'] },
  { key: 'rejected', title: '废弃', statuses: ['rejected'] },
];

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
    $('.a-clip-status-select', row)?.remove();
    $('.a-clip-status-control', row)?.remove();
  });
}

function buildStatusSection(group, rows) {
  const section = document.createElement('section');
  section.className = `a-status-bucket a-status-${group.key}`;
  section.dataset.aStatusBucket = group.key;
  section.innerHTML = `
    <header class="a-status-bucket-head">
      <strong>${group.title}</strong>
      <span>${rows.length}</span>
    </header>
    <div class="a-status-bucket-body"></div>
  `;
  const body = $('.a-status-bucket-body', section);
  rows.forEach(row => body.appendChild(row));
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
  } finally {
    regrouping = false;
  }
}

function start() {
  let lastSignature = '';
  const tick = () => {
    const signature = `${$$('.r54-unclassified').length}|${$$('.r54-task-row').length}|${$$('.r54-deliverable-body').length}`;
    if (signature !== lastSignature) {
      lastSignature = signature;
      void regroupAll();
    }
  };
  document.addEventListener('davis-video-review-status-changed', () => void regroupAll());
  setInterval(tick, 1200);
  tick();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
