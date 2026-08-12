import { listDrafts } from './db.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = v => String(v ?? '').trim();

const STATUS_META = Object.freeze({
  draft: { label: '草稿' },
  pending_review: { label: '草稿' },
  accepted: { label: '定版' },
  backup: { label: '备用' },
  needs_retry: { label: '需重做' },
  rejected: { label: '废弃' },
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

function normalizeVisibleLabels() {
  $$('.r54-unclassified').forEach(node => {
    const title = $('.r54-deliverable-main strong', node);
    const subtitle = $('.r54-deliverable-main small', node);
    if (title && text(title.textContent) !== '默认成片单元') title.textContent = '默认成片单元';
    if (subtitle) subtitle.hidden = true;
  });

  $$('#r54-context-extra .r54-chip').forEach(chip => {
    if (/未归类|未分类|未分配|其他任务/.test(text(chip.textContent))) chip.remove();
  });
}

function enhanceReviewButtons() {
  const select = $('[data-r54-review-select]');
  if (!select) return;
  const control = select.closest('.r54-review-control');
  const host = control?.parentElement || $('#r54-context-extra');
  if (!host) return;

  if (control) control.hidden = true;

  let group = $('.a-review-buttons', host);
  if (!group) {
    group = document.createElement('div');
    group.className = 'a-review-buttons';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '状态');
    group.innerHTML = `
      <button type="button" data-a-review="accepted">定版</button>
      <button type="button" data-a-review="backup">备用</button>
      <button type="button" data-a-review="rejected">废弃</button>`;
    host.appendChild(group);

    group.addEventListener('click', event => {
      const button = event.target.closest('[data-a-review]');
      if (!button) return;
      const liveSelect = $('[data-r54-review-select]');
      if (!liveSelect || liveSelect.disabled) return;
      liveSelect.value = button.dataset.aReview;
      liveSelect.dispatchEvent(new Event('change', { bubbles: true }));
      updateReviewButtons();
    });
  }

  updateReviewButtons();
}

function updateReviewButtons() {
  const select = $('[data-r54-review-select]');
  const group = $('.a-review-buttons');
  if (!group) return;
  const current = select?.value || '';
  $$('[data-a-review]', group).forEach(button => {
    button.classList.toggle('active', button.dataset.aReview === current);
    button.disabled = Boolean(select?.disabled);
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
  normalizeVisibleLabels();
  enhanceReviewButtons();

  const rows = $$('.r54-task-row');
  if (!rows.length) return;

  let drafts = [];
  try { drafts = await listDrafts(); }
  catch (error) { console.warn('[Davis Video A UI] local status refresh skipped', error); }

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

function sidebarScroller() {
  return $('#project-list') || $('.project-list');
}

function installStableTaskNavigation() {
  let pending = null;
  let restoreToken = 0;

  const remember = button => {
    const scroller = sidebarScroller();
    if (!scroller || !button?.dataset?.project) return;
    pending = { top: scroller.scrollTop, projectId: String(button.dataset.project), at: Date.now() };
  };

  const restore = () => {
    if (!pending || Date.now() - pending.at > 1800) return;
    const scroller = sidebarScroller();
    if (!scroller) return;
    scroller.scrollTop = pending.top;
  };

  const scheduleRestore = () => {
    const token = ++restoreToken;
    const run = () => {
      if (token !== restoreToken) return;
      restore();
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 60);
    setTimeout(run, 180);
    setTimeout(run, 420);
  };

  document.addEventListener('pointerdown', event => {
    const button = event.target.closest?.('.project-child[data-project]');
    if (!button) return;
    remember(button);
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest?.('.project-child[data-project]');
    if (!button) return;
    remember(button);
    scheduleRestore();
  }, true);

  const observer = new MutationObserver(() => {
    if (!pending) return;
    scheduleRestore();
  });
  const list = sidebarScroller();
  if (list) observer.observe(list, { childList: true, subtree: true });
}

function start() {
  let running = false;
  let lastSignature = '';

  installStableTaskNavigation();

  const refresh = async () => {
    if (running) return;
    running = true;
    try { await refreshSidebarStatus(); }
    finally { running = false; }
  };

  const tick = () => {
    normalizeVisibleLabels();
    enhanceReviewButtons();
    updateReviewButtons();
    const signature = `${$$('.r54-task-row').length}|${$$('.r54-deliverable').length}|${$('.project-child.active')?.dataset?.project || ''}`;
    if (signature === lastSignature) return;
    lastSignature = signature;
    void refresh();
  };

  document.addEventListener('davis-video-review-status-changed', () => {
    lastSignature = '';
    setTimeout(() => { enhanceReviewButtons(); updateReviewButtons(); void refresh(); }, 30);
  });

  setInterval(tick, 350);
  tick();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
