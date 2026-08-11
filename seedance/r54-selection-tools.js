const BUILD = '20260812-a-selection-tools-safe';

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

function downloadBatchTemplate() {
  const csv = [
    ['任务名称','subject_key','生成模式','历史照片','当前照片','提示词','模型','时长','分辨率','比例'],
    ['张三｜5周年互动','zhangsan_5y','首尾帧','zhangsan_old.jpg','zhangsan_now.jpg','5年前的自己与现在的自己自然走近并握手，身份与五官保持一致','Seedance 2.0','5','1080P','16:9'],
    ['李四｜10周年互动','lisi_10y','首尾帧','lisi_old.jpg','lisi_now.jpg','10年前的自己与现在的自己自然拥抱，人物身份、服装和面部特征稳定','Seedance 2.0','5','1080P','16:9'],
  ].map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Davis_Video_批量生成任务模板.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function enhanceBatchTemplate() {
  const input = document.getElementById('r54-sheet');
  const box = input?.closest('.r54-file');
  if (!box || box.querySelector('[data-r54-download-template]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.r54DownloadTemplate = '1';
  button.textContent = '下载 CSV 模板';
  button.style.cssText = 'margin-top:9px;min-height:30px;padding:0 10px;border:1px solid #dfe4ed;border-radius:8px;background:#fff;color:#5567ef;font-size:11px;font-weight:700;cursor:pointer';
  box.appendChild(button);
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
  const label = allChecked ? '清空' : '全选';
  const title = allChecked ? '取消这个成片单元下全部任务的勾选' : '勾选这个成片单元下全部任务';
  if (button.textContent !== label) button.textContent = label;
  if (button.title !== title) button.title = title;
}

function enhance() {
  enhanceDeliverableHeaders();
  enhanceReviewControls();
  enhanceBatchTemplate();
  document.querySelectorAll('.r54-deliverable[data-deliverable]').forEach(syncHeaderLabel);
}

function init() {
  document.addEventListener('click', event => {
    const template = event.target.closest?.('[data-r54-download-template]');
    if (template) {
      event.preventDefault();
      event.stopPropagation();
      downloadBatchTemplate();
      return;
    }

    const button = event.target.closest?.('[data-r54-select-visible]');
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      const section = button.closest('.r54-deliverable[data-deliverable]');
      if (!section) return;
      const inputs = [...section.querySelectorAll('input[data-r54-task-check]')];
      const allChecked = inputs.length > 0 && inputs.every(input => input.checked);
      toggleSection(section, !allChecked);
      syncHeaderLabel(section);
      return;
    }

    // Deliverable/task actions rebuild small parts of the tree; enhance after the action settles.
    if (event.target.closest?.('[data-r54-create-deliverable],[data-r54-add-task],[data-r54-review],[data-r54-retry],[data-r54-batch-import],[data-select-parent],.project-child')) {
      setTimeout(enhance, 120);
    }
  });

  document.addEventListener('change', event => {
    if (!event.target.closest?.('input[data-r54-task-check]')) return;
    const section = event.target.closest('.r54-deliverable[data-deliverable]');
    if (section) syncHeaderLabel(section);
  });

  // Deliberately no page-wide MutationObserver. A low-frequency idempotent refresh catches
  // base-tree rerenders without creating observer/write feedback loops.
  const timer = setInterval(enhance, 1200);
  window.addEventListener('beforeunload', () => clearInterval(timer), { once:true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) enhance(); });
  enhance();
  document.body.dataset.davisVideoSelectionToolsR54 = 'ready';
  console.log('[Davis Video A Selection]', BUILD);
}

export function initSelectionToolsR54() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
}
