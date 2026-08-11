const BUILD = '20260811-r54-architecture-ux';
const ONBOARD_KEY = 'davis_video_r54_onboard_group';
let parentCreateBefore = null;
let pendingDeliverableLabel = '';

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parentIdsInDom() {
  return new Set([...document.querySelectorAll('[data-select-parent]')]
    .map(node => String(node.dataset.selectParent || ''))
    .filter(Boolean));
}

function injectStyle() {
  if ($('r54-architecture-style')) return;
  const style = document.createElement('style');
  style.id = 'r54-architecture-style';
  style.textContent = `
    body[data-davis-video-deliverables-r54="ready"] .project-parent-add,
    body[data-davis-video-deliverables-r54="ready"] .project-child-list > .project-child-add {
      display:none!important;
    }
    .r54-child-deliverable-context{
      margin:0 0 12px;padding:9px 11px;border:1px solid #e4e8f5;border-radius:10px;
      background:#f8f9ff;color:#59647b;font-size:11px;line-height:1.5
    }
    .r54-child-deliverable-context b{color:#4657dc}
  `;
  document.head.appendChild(style);
}

function patchProjectCreateCopy() {
  const modal = $('project-mode-modal');
  if (!modal) return;
  const title = modal.querySelector('h2');
  if (title) title.textContent = '新建视频业务项目';
  const nameLabel = modal.querySelector('label[for="new-project-name"]');
  if (nameLabel && !/业务项目/.test(nameLabel.textContent || '')) nameLabel.textContent = '业务项目名称 *';
}

function injectDeliverableContext(label) {
  const modal = $('child-task-modal');
  if (!modal || modal.hidden) return;
  let context = modal.querySelector('.r54-child-deliverable-context');
  if (!context) {
    context = document.createElement('div');
    context.className = 'r54-child-deliverable-context';
    const firstField = modal.querySelector('label,.field,.form-field');
    if (firstField) firstField.insertAdjacentElement('beforebegin', context);
    else modal.querySelector('.modal-card,.child-task-dialog,.project-mode-dialog')?.prepend(context);
  }
  const safe = String(label || '当前成片单元').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
  context.innerHTML = `归属成片单元：<b>${safe}</b><br>这里创建的是该成片的一次具体视频生成任务。`;
}

async function resumeOnboarding() {
  const groupId = sessionStorage.getItem(ONBOARD_KEY) || '';
  if (!groupId) return;
  for (let i = 0; i < 100; i += 1) {
    await sleep(100);
    const button = document.querySelector(`[data-r54-create-deliverable="${CSS.escape(groupId)}"]`);
    if (button) {
      sessionStorage.removeItem(ONBOARD_KEY);
      button.click();
      return;
    }
  }
}

async function redirectNewParentToDeliverable() {
  const before = parentCreateBefore;
  parentCreateBefore = null;
  if (!before) return;

  let newGroupId = '';
  for (let i = 0; i < 80; i += 1) {
    await sleep(100);
    const now = parentIdsInDom();
    newGroupId = [...now].find(id => !before.has(id)) || '';
    if (newGroupId) break;
  }
  if (!newGroupId) return;

  // R50 会自动打开“子任务”弹窗；R54 先关掉它，禁止绕过成片单元。
  for (let i = 0; i < 30; i += 1) {
    await sleep(70);
    const childModal = $('child-task-modal');
    if (childModal && !childModal.hidden) {
      $('child-task-cancel')?.click();
      break;
    }
  }

  // 新一级项目刚进入数据库，R54 的云端缓存需要刷新一次；自动恢复并继续打开成片单元创建。
  sessionStorage.setItem(ONBOARD_KEY, newGroupId);
  location.reload();
}

function enhance() {
  injectStyle();
  patchProjectCreateCopy();
  if (pendingDeliverableLabel) injectDeliverableContext(pendingDeliverableLabel);
}

function init() {
  enhance();
  void resumeOnboarding();

  document.addEventListener('click', event => {
    if (event.target.closest?.('#project-create-submit')) {
      parentCreateBefore = parentIdsInDom();
      setTimeout(() => { void redirectNewParentToDeliverable(); }, 0);
      return;
    }

    const addTask = event.target.closest?.('[data-r54-add-task]');
    if (addTask) {
      const section = addTask.closest('.r54-deliverable');
      pendingDeliverableLabel = section?.querySelector('.r54-deliverable-main strong')?.textContent?.replace(/^▾\s*/, '').trim() || '当前成片单元';
      setTimeout(() => injectDeliverableContext(pendingDeliverableLabel), 80);
      return;
    }

    if (event.target.closest?.('#child-task-cancel,[data-create-child-mode]')) {
      setTimeout(() => { pendingDeliverableLabel = ''; }, 600);
    }
  }, true);

  const observer = new MutationObserver(() => queueMicrotask(enhance));
  observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['hidden','data-davis-video-deliverables-r54'] });
  document.body.dataset.davisVideoArchitectureUxR54 = 'ready';
  console.log('[Davis Video R54 Architecture]', BUILD);
}

export function initArchitectureUxR54() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
}
