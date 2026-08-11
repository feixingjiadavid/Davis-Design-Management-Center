const BUILD = '20260811-r54-architecture-ux';
const ONBOARD_KEY = 'davis_video_r54_onboard_group';
let parentCreateBefore = null;
let pendingDeliverableLabel = '';

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function toast(title, message='') {
  const box=$('toast'), titleEl=$('toast-title'), messageEl=$('toast-message');
  if(!box||!titleEl||!messageEl)return;
  titleEl.textContent=title; messageEl.textContent=message; box.hidden=false;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>{box.hidden=true;},4200);
}

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
  const lead = modal.querySelector('.project-mode-dialog > p');
  if (lead) lead.textContent = '先创建一级业务项目。创建完成后，先建立“成片单元”（例如互动暖场视频、开场视频），再在对应成片单元里创建多个独立生成任务。';
  const nameField = $('new-project-name')?.closest('.project-create-field');
  const nameTitle = nameField?.querySelector('span');
  if (nameTitle) nameTitle.innerHTML = '业务项目名称 <em class="required-mark">*</em>';
  const nameHint = nameField?.querySelector('small:not(.project-create-error)');
  if (nameHint) nameHint.textContent = '这是左侧树形列表的一级业务项目名称；一个项目下面可以建立多个成片单元。';
  const note = modal.querySelector('.project-create-note');
  if (note) note.textContent = '这里只创建一级业务项目。下一步会先创建成片单元，不会直接创建付费生成任务。';
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

function currentDeliverableAddButton() {
  const active = document.querySelector('.project-child.active');
  const section = active?.closest('.r54-deliverable[data-deliverable]');
  return section?.querySelector('[data-r54-add-task]') || null;
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

    // 旧 R50 的“当前任务旁新建任务”必须改走当前成片单元，不能创建未归类任务。
    if (event.target.closest?.('#new-child-task-current')) {
      const add = currentDeliverableAddButton();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!add) {
        toast('请先创建成片单元', '当前是历史未归类任务。请回到一级项目，先新建“互动暖场视频 / 开场视频”等成片单元，再在成片单元内创建任务。');
        return;
      }
      add.click();
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
