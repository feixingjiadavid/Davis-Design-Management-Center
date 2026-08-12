const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const BUSINESS_STATUS = Object.freeze({
  accepted: '定版',
  backup: '备用',
  rejected: '废弃',
});

function currentReviewSelect() {
  return $('[data-r54-review-select]');
}

function currentReviewHost() {
  const select = currentReviewSelect();
  return select?.closest('.r54-review-control')?.parentElement || $('#r54-context-extra');
}

function syncReviewButtons(status = currentReviewSelect()?.value || '') {
  const group = $('.a-review-buttons');
  if (!group) return;
  $$('[data-a-review]', group).forEach(button => {
    button.classList.toggle('active', button.dataset.aReview === status);
  });
}

function syncSidebarPill(localId, status) {
  if (!localId) return;
  const task = $(`.project-child[data-project="${CSS.escape(String(localId))}"]`);
  const row = task?.closest('.r54-task-row');
  const pill = row?.querySelector(':scope > .r54-pill');
  if (!pill) return;
  pill.dataset.status = status;
  pill.textContent = BUSINESS_STATUS[status] || '';
}

function ensureReviewButtons() {
  const select = currentReviewSelect();
  const host = currentReviewHost();
  if (!select || !host) return false;

  const control = select.closest('.r54-review-control');
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
  }

  group.dataset.localId = select.dataset.localId || '';
  syncReviewButtons(select.value);
  return true;
}

function handleReviewClick(event) {
  const button = event.target.closest?.('[data-a-review]');
  if (!button) return;

  const select = currentReviewSelect();
  if (!select || select.disabled) return;

  const next = button.dataset.aReview;
  if (!BUSINESS_STATUS[next]) return;

  const localId = select.dataset.localId || $('.project-child.active')?.dataset?.project || '';
  select.value = next;
  syncReviewButtons(next);
  syncSidebarPill(localId, next);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function scheduleReviewMount() {
  requestAnimationFrame(() => ensureReviewButtons());
  setTimeout(() => ensureReviewButtons(), 50);
  setTimeout(() => ensureReviewButtons(), 140);
}

function installReviewUi() {
  const context = $('#child-task-context');
  if (!context) return;

  context.addEventListener('click', handleReviewClick);

  const observer = new MutationObserver(() => {
    ensureReviewButtons();
  });
  observer.observe(context, { childList: true, subtree: true });

  document.addEventListener('davis-video-review-status-changed', event => {
    const localId = event.detail?.localId || currentReviewSelect()?.dataset?.localId || '';
    const status = event.detail?.status || currentReviewSelect()?.value || '';
    syncReviewButtons(status);
    syncSidebarPill(localId, status);
  });

  scheduleReviewMount();
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
    pending = { top: scroller.scrollTop, at: Date.now() };
  };

  const restore = () => {
    if (!pending || Date.now() - pending.at > 1800) return;
    const scroller = sidebarScroller();
    if (scroller) scroller.scrollTop = pending.top;
  };

  const scheduleRestore = () => {
    const token = ++restoreToken;
    const run = () => {
      if (token === restoreToken) restore();
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 70);
    setTimeout(run, 180);
  };

  document.addEventListener('pointerdown', event => {
    const button = event.target.closest?.('.project-child[data-project]');
    if (button) remember(button);
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest?.('.project-child[data-project]');
    if (!button) return;
    remember(button);
    scheduleRestore();
    scheduleReviewMount();
  }, true);

  const list = sidebarScroller();
  if (!list) return;
  const observer = new MutationObserver(() => {
    if (pending) scheduleRestore();
  });
  observer.observe(list, { childList: true, subtree: true });
}

function start() {
  installStableTaskNavigation();
  installReviewUi();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
