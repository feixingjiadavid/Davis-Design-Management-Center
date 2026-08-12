import { listDrafts } from './db.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = v => String(v ?? '').trim();

const STATUS_META = Object.freeze({
  draft: { label: '草稿', rank: 2 },
  pending_review: { label: '草稿', rank: 2 },
  accepted: { label: '定版', rank: 1 },
  backup: { label: '备用', rank: 3 },
  needs_retry: { label: '需重做', rank: 4 },
  rejected: { label: '废弃', rank: 5 },
});

function normalizeStatus(value) {
  const status = text(value || 'draft') || 'draft';
  return STATUS_META[status] ? status : 'draft';
}

function localIdForRow(row) {
  return $('.project-child', row)?.dataset?.project || '';
}

function unwrapLegacyBuckets() {
  $$('.a-status-bucket').forEach(bucket => {
    const host = bucket.parentElement;
    if (!host) return;
    const rows = $$('.r54-task-row', bucket);
    rows.forEach(row => host.insertBefore(row, bucket));
    bucket.remove();
  });

  $$('.a-legacy-status-holder').forEach(holder => {
    holder.classList.remove('a-legacy-status-holder');
    holder.classList.add('r54-legacy-task-holder');
  });
}

function renameInternalLabels() {
  $$('.r54-unclassified').forEach(node => {
    const title = $('.r54-deliverable-main strong', node);
    const subtitle = $('.r54-deliverable-main small', node);
    if (title) title.textContent = '其他任务';
    if (subtitle) subtitle.hidden = true;
  });

  $$('#r54-context-extra .r54-chip').forEach(chip => {
    if (/未归类|未分配/.test(text(chip.textContent))) chip.remove();
  });
}

function applyStatusBadge(row, status) {
  row.dataset.aClipStatus = status;
  const button = $('.project-child', row);
  if (!button) return;

  $('.r54-pill', row)?.remove();
  $('.a-clip-status-select', row)?.remove();
  $('.a-clip-status-control', row)?.remove();

  let badge = $('.a-task-status-badge', button);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'a-task-status-badge';
    button.appendChild(badge);
  }
  badge.dataset.status = status;
  badge.textContent = STATUS_META[status]?.label || '草稿';
}

async function refreshSidebarStatus() {
  unwrapLegacyBuckets();
  renameInternalLabels();

  const rows = $$('.r54-task-row');
  if (!rows.length) return;

  let drafts = [];
  try { drafts = await listDrafts(); } catch (error) {
    console.warn('[Davis Video A UI] local status refresh skipped', error);
  }
  const map = new Map(drafts.map(draft => [
    String(draft.id),
    normalizeStatus(draft.reviewStatus || draft.review_status || 'draft'),
  ]));

  rows.forEach(row => {
    const id = localIdForRow(row);
    const existing = normalizeStatus(row.dataset.aClipStatus || 'draft');
    applyStatusBadge(row, map.get(String(id)) || existing);
  });
}

function start() {
  let running = false;
  let lastSignature = '';

  const refresh = async () => {
    if (running) return;
    running = true;
    try { await refreshSidebarStatus(); }
    finally { running = false; }
  };

  const tick = () => {
    const signature = `${$$('.r54-task-row').length}|${$$('.r54-deliverable').length}|${$('.project-child.active')?.dataset?.project || ''}`;
    if (signature === lastSignature) return;
    lastSignature = signature;
    void refresh();
  };

  document.addEventListener('davis-video-review-status-changed', () => {
    lastSignature = '';
    void refresh();
  });

  setInterval(tick, 1400);
  tick();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
