import { listDrafts } from './db.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const text = v => String(v ?? '').trim();

const STATUS_META = Object.freeze({
  accepted: { label: '定版' },
  backup: { label: '备用' },
  rejected: { label: '废弃' },
});
const BUSINESS_STATUSES = new Set(Object.keys(STATUS_META));
const statusByDraftId = new Map();
let activeReviewStatus = '';

function normalizeBusinessStatus(value) {
  const status = text(value);
  return BUSINESS_STATUSES.has(status) ? status : '';
}

function localIdForRow(row) {
  return $('.project-child', row)?.dataset?.project || '';
}

function activeLocalId() {
  return $('.project-child.active')?.dataset?.project || '';
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

function setReviewButtonVisual(status) {
  activeReviewStatus = normalizeBusinessStatus(status);
  const group = $('.a-review-buttons');
  if (!group) return;
  $$('[data-a-review]', group).forEach(button => {
    button.classList.toggle('active', button.dataset.aReview === activeReviewStatus);
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
      const next = normalizeBusinessStatus(button.dataset.aReview);
      const localId = activeLocalId();
      if (!next || !localId) return;

      // Optimistic UI first: the user must see the result immediately and steadily.
      statusByDraftId.set(String(localId), next);
      setReviewButtonVisual(next);
      ensureBusinessBadges();

      const liveSelect = $('[data-r54-review-select]');
      if (!liveSelect || liveSelect.disabled) return;
      liveSelect.value = next;
      liveSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  const localId = activeLocalId();
  const cached = normalizeBusinessStatus(statusByDraftId.get(String(localId)));
  const selectStatus = normalizeBusinessStatus(select.value);
  setReviewButtonVisual(cached || selectStatus);
}

function applyBusinessBadge(row, status) {
  const button = $('.project-child', row);
  if (!button) return;

  $('.r54-pill', row)?.remove();
  $('.a-clip-status-select', row)?.remove();
  $('.a-clip-status-control', row)?.remove();

  const businessStatus = normalizeBusinessStatus(status);
  let badge = $('.a-task-status-badge', button);

  // Internal states such as 草稿 / 待审核 / 需重做 are intentionally invisible in the sidebar.
  if (!businessStatus) {
    badge?.remove();
    row.dataset.aClipStatus = '';
    return;
  }

  row.dataset.aClipStatus = businessStatus;
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'a-task-status-badge';
    button.appendChild(badge);
  }
  badge.dataset.status = businessStatus;
  badge.textContent = STATUS_META[businessStatus].label;
}

function ensureBusinessBadges() {
  $$('.r54-task-row').forEach(row => {
    const id = localIdForRow(row);
    const status = normalizeBusinessStatus(statusByDraftId.get(String(id)));
    applyBusinessBadge(row, status);
  });
}

async function refreshStatusCache() {
  let drafts = [];
  try { drafts = await listDrafts(); }
  catch (error) { console.warn('[Davis Video A UI] local status refresh skipped', error); return; }

  drafts.forEach(draft => {
    const id = String(draft.id);
    const status = normalizeBusinessStatus(draft.reviewStatus || draft.review_status);
    if (status) statusByDraftId.set(id, status);
    else if (!statusByDraftId.has(id)) statusByDraftId.set(id, '');
  });

  ensureBusinessBadges();
  const active = activeLocalId();
  if (active) setReviewButtonVisual(statusByDraftId.get(String(active)) || '');
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
    setTimeout(() => {
      const id = String(button.dataset.project || activeLocalId());
      setReviewButtonVisual(statusByDraftId.get(id) || '');
    }, 20);
  }, true);

  const observer = new MutationObserver(() => {
    if (pending) scheduleRestore();
    // R54 may replace task-card DOM nodes. Re-apply only the tiny badges, never rebuild the tree.
    queueMicrotask(() => ensureBusinessBadges());
  });
  const list = sidebarScroller();
  if (list) observer.observe(list, { childList: true, subtree: true });
}

function start() {
  installStableTaskNavigation();
  unwrapLegacyBuckets();
  normalizeVisibleLabels();
  enhanceReviewButtons();
  void refreshStatusCache();

  // Idempotent maintenance only. No async reload, no tree rebuild, no visual flashing.
  setInterval(() => {
    normalizeVisibleLabels();
    enhanceReviewButtons();
    ensureBusinessBadges();
  }, 500);

  // Reconcile persistent data quietly, much less often than the UI maintenance loop.
  setInterval(() => { void refreshStatusCache(); }, 5000);

  document.addEventListener('davis-video-review-status-changed', event => {
    const localId = String(event.detail?.localId || activeLocalId());
    const status = normalizeBusinessStatus(event.detail?.status);
    if (localId) statusByDraftId.set(localId, status);
    setReviewButtonVisual(status);
    ensureBusinessBadges();
    // Read persisted IndexedDB shortly after save, but never rebuild the tree.
    setTimeout(() => { void refreshStatusCache(); }, 120);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
