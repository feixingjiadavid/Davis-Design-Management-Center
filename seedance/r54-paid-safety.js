import { listDrafts } from './db.js';

let deliverableTaskCreationPending = false;
let creationBeforeIds = null;

async function rememberBeforeCreate() {
  const drafts = await listDrafts();
  creationBeforeIds = new Set(drafts.map(draft => String(draft.id)));
}

async function reloadAfterAssignedTaskAppears() {
  const before = creationBeforeIds;
  if (!before) return;
  for (let i = 0; i < 60; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 180));
    const drafts = await listDrafts();
    if (drafts.some(draft => !before.has(String(draft.id)))) {
      // 给 R54 主模块一点时间把 deliverableId 写入新草稿，再刷新让三级树立即按新归属显示。
      await new Promise(resolve => setTimeout(resolve, 500));
      location.reload();
      return;
    }
  }
  creationBeforeIds = null;
}

function init() {
  // 监听“在某个成片单元里新增任务”，创建后刷新一次，让三级树马上显示正确归属。
  document.addEventListener('click', event => {
    const deliverableAdd = event.target.closest?.('[data-r54-add-task]');
    if (deliverableAdd) {
      deliverableTaskCreationPending = true;
      void rememberBeforeCreate();
      return;
    }

    const modeButton = event.target.closest?.('[data-create-child-mode]');
    if (modeButton && deliverableTaskCreationPending) {
      deliverableTaskCreationPending = false;
      void reloadAfterAssignedTaskAppears();
      return;
    }

    if (event.target.closest?.('#child-task-cancel')) {
      deliverableTaskCreationPending = false;
      creationBeforeIds = null;
    }
  }, true);

  document.body.dataset.davisVideoPaidSafetyR54 = 'ready';
  console.log('[Davis Video R54] task creation safety ready');
}

export function initPaidSafetyR54() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
}
