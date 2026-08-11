const BUILD = '20260811-r54-selection-tools';

function enhanceDeliverableHeaders() {
  document.querySelectorAll('.r54-deliverable[data-deliverable]').forEach(section => {
    const head = section.querySelector('.r54-deliverable-head');
    if (!head || head.querySelector('[data-r54-select-visible]')) return;
    const actions = head.querySelector('.r54-deliverable-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.r54SelectVisible = '1';
    button.textContent = '全选';
    button.title = '勾选这个成片单元下当前全部任务';
    actions.prepend(button);
  });
}

function enhanceReviewControls() {
  const actions = document.querySelector('#r54-context-extra .r54-context-actions');
  if (!actions || actions.querySelector('[data-r54-review="rejected"]')) return;
  const existing = actions.querySelector('[data-r54-review]');
  const localId = existing?.dataset?.localId;
  if (!localId) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.r54Review = 'rejected';
  button.dataset.localId = localId;
  button.textContent = '废弃';
  const retry = actions.querySelector('[data-r54-retry]');
  if (retry) actions.insertBefore(button, retry);
  else actions.appendChild(button);
}

function toggleSection(section, check) {
  section.querySelectorAll('input[data-r54-task-check]').forEach(input => {
    if (input.checked === check) return;
    input.checked = check;
    input.dispatchEvent(new Event('change', { bubbles:true }));
  });
}

function syncHeaderLabel(section) {
  const button = section.querySelector('[data-r54-select-visible]');
  if (!button) return;
  const inputs = [...section.querySelectorAll('input[data-r54-task-check]')];
  const allChecked = inputs.length > 0 && inputs.every(input => input.checked);
  button.textContent = allChecked ? '清空' : '全选';
  button.title = allChecked ? '取消这个成片单元下全部任务的勾选' : '勾选这个成片单元下全部任务';
}

function enhance() {
  enhanceDeliverableHeaders();
  enhanceReviewControls();
  document.querySelectorAll('.r54-deliverable[data-deliverable]').forEach(syncHeaderLabel);
}

function init() {
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-r54-select-visible]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const section = button.closest('.r54-deliverable[data-deliverable]');
    if (!section) return;
    const inputs = [...section.querySelectorAll('input[data-r54-task-check]')];
    const allChecked = inputs.length > 0 && inputs.every(input => input.checked);
    toggleSection(section, !allChecked);
    syncHeaderLabel(section);
  });

  document.addEventListener('change', event => {
    if (!event.target.closest?.('input[data-r54-task-check]')) return;
    const section = event.target.closest('.r54-deliverable[data-deliverable]');
    if (section) syncHeaderLabel(section);
  });

  const observer = new MutationObserver(() => queueMicrotask(enhance));
  observer.observe(document.body, { childList:true, subtree:true });
  enhance();
  document.body.dataset.davisVideoSelectionToolsR54 = 'ready';
  console.log('[Davis Video R54 Selection]', BUILD);
}

export function initSelectionToolsR54() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
}
