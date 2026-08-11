import { listDrafts } from './db.js';

const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';
let deliverableTaskCreationPending = false;
let creationBeforeIds = null;

const $ = id => document.getElementById(id);
const text = value => String(value ?? '').trim();

function toast(title, message = '') {
  const box = $('toast');
  const titleEl = $('toast-title');
  const messageEl = $('toast-message');
  if (!box || !titleEl || !messageEl) return;
  titleEl.textContent = title;
  messageEl.textContent = message;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 4500);
}

function modeKey(value) {
  return value === 'first_last' ? 'first_last' : value === 'text_only' ? 'text_only' : 'multi_frame';
}

function workspaceOf(draft) {
  if (!draft) return null;
  const key = modeKey(draft.lockedMode || draft.mode);
  return draft.workspaces?.[key] || draft;
}

function hasExistingGeneration(segment) {
  const status = String(segment?.status || '').toLowerCase();
  return Boolean(
    segment?.providerTaskId ||
    segment?.remoteTaskId ||
    segment?.remoteSegmentId ||
    segment?.outputPath ||
    segment?.outputUrl ||
    ['submitted','queued','running','processing','succeeded','completed','success','failed','cancelled'].includes(status)
  );
}

async function currentDraft() {
  const selected = document.querySelector('.project-child.active')?.dataset?.project
    || localStorage.getItem(LAST_SELECTED_DRAFT_KEY)
    || '';
  if (!selected) return null;
  const drafts = await listDrafts();
  return drafts.find(draft => String(draft.id) === String(selected)) || null;
}

async function guardExistingPaidGeneration(event) {
  const button = event.target.closest?.('#generate-all,#generate-segment');
  if (!button) return;

  const draft = await currentDraft();
  if (!draft) return;
  const workspace = workspaceOf(draft);
  const segments = workspace?.segments || draft.segments || [];

  let existing = false;
  if (button.id === 'generate-all') {
    existing = segments.some(hasExistingGeneration);
  } else {
    const selectedId = workspace?.selectedSegmentId || draft.selectedSegmentId || null;
    const segment = segments.find(item => String(item.id) === String(selectedId)) || segments[0] || null;
    existing = hasExistingGeneration(segment);
  }

  if (!existing) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  toast(
    '已阻止覆盖式重新生成',
    button.id === 'generate-all'
      ? '当前任务已经存在生成记录。“全部生成”可能让已生成片段再次扣费。需要重做时请先点击“重新生成草稿”；如果只是补未生成片段，请在高级 Storyboard 中单独选择未生成片段。'
      : '这个片段已经存在生成记录。为保留历史与费用链路，请先点击“重新生成草稿”，再在新任务中确认费用后生成。'
  );
}

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
  // 这道保护必须比 R54 主模块的付费确认监听器更早注册。
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

  document.addEventListener('click', event => {
    if (event.target.closest?.('#generate-all,#generate-segment')) {
      // async lookup happens before any paid handler is allowed to act because this listener is registered first.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void (async () => {
        const draft = await currentDraft();
        const button = event.target.closest('#generate-all,#generate-segment');
        if (!draft || !button) return;
        const workspace = workspaceOf(draft);
        const segments = workspace?.segments || draft.segments || [];
        const selectedId = workspace?.selectedSegmentId || draft.selectedSegmentId || null;
        const selectedSegment = segments.find(item => String(item.id) === String(selectedId)) || segments[0] || null;
        const existing = button.id === 'generate-all'
          ? segments.some(hasExistingGeneration)
          : hasExistingGeneration(selectedSegment);
        if (existing) {
          toast(
            '已阻止覆盖式重新生成',
            button.id === 'generate-all'
              ? '当前任务已经存在生成记录。“全部生成”可能让已生成片段再次扣费。需要重做时请先点击“重新生成草稿”；如果只是补未生成片段，请在高级 Storyboard 中单独生成未生成片段。'
              : '这个片段已经存在生成记录。请先创建“重新生成草稿”，再在新任务中确认费用后生成。'
          );
          return;
        }
        // 没有历史生成时，把一次点击重新派发给后续 R54 费用确认监听器。
        button.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
      })();
    }
  }, true);

  document.body.dataset.davisVideoPaidSafetyR54 = 'ready';
  console.log('[Davis Video R54] paid overwrite protection ready');
}

export function initPaidSafetyR54() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
}
