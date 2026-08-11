const BUILD = '20260811-r54-tree-stability';

function flattenTaskButtons(childList) {
  if (!childList || childList.dataset.r54 === '1') return;
  const nestedButtons = [...childList.querySelectorAll('.r54-task-row > .project-child, .r54-deliverable-body .project-child')];
  if (!nestedButtons.length) return;

  // r54-deliverables.js 的刷新器只读取 childList 的直接 .project-child。
  // 在它下一帧重建树之前，把现有按钮临时提升为直接子节点，保留 app.js 已绑定的 onclick。
  const addButton = childList.querySelector(':scope > .project-child-add');
  const fragment = document.createDocumentFragment();
  for (const button of nestedButtons) fragment.appendChild(button);
  if (addButton) childList.insertBefore(fragment, addButton);
  else childList.appendChild(fragment);
}

function scan() {
  document.querySelectorAll('.project-child-list:not([data-r54="1"])').forEach(flattenTaskButtons);
}

function init() {
  scan();
  const root = document.getElementById('project-list');
  if (!root) return;

  const observer = new MutationObserver(records => {
    let needsScan = false;
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'data-r54') {
        const node = record.target;
        if (node instanceof HTMLElement && node.classList.contains('project-child-list') && node.dataset.r54 !== '1') {
          flattenTaskButtons(node);
        }
      }
      if (record.type === 'childList') needsScan = true;
    }
    if (needsScan) queueMicrotask(scan);
  });
  observer.observe(root, { subtree:true, childList:true, attributes:true, attributeFilter:['data-r54'] });
  document.body.dataset.davisVideoTreeStabilityR54 = 'ready';
  console.log('[Davis Video R54 Tree Stability]', BUILD);
}

export function initTreeStabilityR54() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
}
