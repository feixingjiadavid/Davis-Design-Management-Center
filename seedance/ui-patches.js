const BUILD = '20260724-davis-video-ui-v1';

let activeQuickCard = null;
let activeAdvancedPrompt = null;

const $ = id => document.getElementById(id);

function injectStyles() {
  const style = document.createElement('style');
  style.id = 'davis-video-ui-patches';
  style.textContent = `
    body.quick-segment-open{overflow:hidden!important}
    .quick-segment-modal{position:fixed!important;inset:0!important;z-index:4200!important;padding:20px!important;display:grid!important;place-items:center!important;background:rgba(15,23,42,.46)!important;backdrop-filter:blur(13px) saturate(.84)!important;-webkit-backdrop-filter:blur(13px) saturate(.84)!important}
    .quick-segment-modal[hidden]{display:none!important}
    .quick-segment-dialog{width:min(720px,94vw)!important;overflow:hidden!important;border:1px solid #cbd4e1!important;border-top:4px solid #5263df!important;border-radius:15px!important;color:#111827!important;background:#fff!important;box-shadow:0 26px 76px rgba(15,23,42,.28)!important}
    .quick-segment-header{padding:18px 20px 15px!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:18px!important;border-bottom:1px solid #e1e6ee!important;background:#f7f8ff!important}
    .quick-segment-header span{display:block!important;margin-bottom:4px!important;color:#5263df!important;font-size:11px!important;font-weight:820!important;letter-spacing:.1em!important}
    .quick-segment-header h2{margin:0!important;color:#111827!important;font-size:21px!important;font-weight:820!important;letter-spacing:-.025em!important}
    .quick-segment-header p{margin:5px 0 0!important;color:#667085!important;font-size:12px!important}
    #quick-segment-close{width:35px!important;height:35px!important;min-height:35px!important;padding:0!important;border:1px solid #d1d8e3!important;border-radius:9px!important;color:#475467!important;font-size:20px!important;line-height:1!important;background:#fff!important;box-shadow:none!important}
    .quick-segment-body{padding:18px 20px!important;background:#f8fafc!important}
    .quick-segment-body>label{display:block!important;padding:14px!important;border:1px solid #e0e6ef!important;border-radius:11px!important;background:#fff!important}
    #quick-segment-prompt{width:100%!important;min-height:230px!important;padding:13px 14px!important;resize:vertical!important;border:1px solid #d4dce7!important;border-radius:9px!important;color:#111827!important;font-size:14px!important;line-height:1.68!important;background:#fff!important;box-shadow:none!important}
    #quick-segment-prompt:focus{border-color:#6878e3!important;outline:none!important;box-shadow:0 0 0 3px #eef0ff!important}
    .quick-segment-hint{margin-top:10px!important;color:#667085!important;font-size:12px!important}
    .quick-segment-actions{padding:13px 20px 16px!important;display:flex!important;justify-content:flex-end!important;gap:9px!important;border-top:1px solid #e1e6ee!important;background:#fff!important}
    .quick-segment-actions button{min-height:40px!important;padding:0 14px!important;border-radius:8px!important;font-size:14px!important;font-weight:760!important;box-shadow:none!important}
    @media(max-width:760px){.quick-segment-modal{padding:10px!important}.quick-segment-dialog{width:97vw!important}.quick-segment-body{padding:13px!important}#quick-segment-prompt{min-height:190px!important}}
  `;
  document.head.appendChild(style);
}

function applyVisibleBranding(root = document) {
  document.title = document.title
    .replaceAll('Seedance 视频生成中心', 'Davis Video 视频生成中心')
    .replaceAll('Seedance Studio', 'Davis Video Studio');

  const brand = document.querySelector('.brand strong');
  if (brand && brand.textContent.trim() === 'Seedance Studio') brand.textContent = 'Davis Video Studio';

  const heading = document.querySelector('.topbar h1');
  if (heading && heading.textContent.includes('Seedance')) {
    heading.textContent = heading.textContent.replaceAll('Seedance', 'Davis Video');
  }

  const projectName = $('project-name');
  if (projectName?.value === '未命名 Seedance 项目') {
    projectName.value = '未命名 Davis Video 项目';
    projectName.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.querySelectorAll('#segment-model option').forEach(option => {
    option.textContent = option.textContent
      .replaceAll('Seedance Mini', 'Davis Video Mini')
      .replaceAll('Seedance Fast', 'Davis Video Fast');
  });

  const safeRoot = root?.nodeType === Node.ELEMENT_NODE || root?.nodeType === Node.DOCUMENT_NODE
    ? root
    : document;

  safeRoot.querySelectorAll?.('[download^="seedance-"]').forEach(node => {
    node.download = node.download.replace(/^seedance-/i, 'davis-video-');
  });

  const walker = document.createTreeWalker(
    safeRoot,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('textarea,input,script,style,.segment-mini,.timeline-segment,.segment-row,.job-card p,.output-copy,.ai-prompt-column')) {
          return NodeFilter.FILTER_REJECT;
        }
        return /Seedance/.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    },
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    node.nodeValue = String(node.nodeValue || '')
      .replaceAll('Seedance 生成', 'Davis Video 生成')
      .replaceAll('Seedance Mini', 'Davis Video Mini')
      .replaceAll('Seedance Fast', 'Davis Video Fast')
      .replaceAll('Seedance 原生智能比例', 'Davis Video 原生智能比例')
      .replaceAll('适配 Seedance', '适配 Davis Video')
      .replaceAll('未命名 Seedance 项目', '未命名 Davis Video 项目')
      .replaceAll('Seedance Studio', 'Davis Video Studio')
      .replaceAll('Seedance 视频生成中心', 'Davis Video 视频生成中心');
  });
}

function showToast(title, message) {
  const toast = $('toast');
  const titleEl = $('toast-title');
  const messageEl = $('toast-message');
  if (!toast || !titleEl || !messageEl) return;
  titleEl.textContent = title;
  messageEl.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function openQuickEditor(trigger) {
  const original = trigger?.onclick;
  if (typeof original !== 'function') {
    showToast('片段尚未准备好', '请稍后再点击编辑。');
    return;
  }

  original.call(trigger, {
    stopPropagation() {},
    preventDefault() {},
    target: trigger,
    currentTarget: trigger,
  });

  activeAdvancedPrompt = $('segment-prompt');
  if (!activeAdvancedPrompt) {
    showToast('无法打开编辑器', '没有找到当前片段提示词。');
    return;
  }

  activeQuickCard = trigger.closest('.segment-mini');
  const modal = $('quick-segment-modal');
  const textarea = $('quick-segment-prompt');
  if (!modal || !textarea) return;

  $('quick-segment-index').textContent = $('inspector-index')?.textContent || 'SEGMENT';
  $('quick-segment-context').textContent = $('inspector-name')?.textContent || '当前片段';
  textarea.value = activeAdvancedPrompt.value || '';

  document.querySelector('.view-tab[data-view="quick"]')?.click();
  modal.hidden = false;
  document.body.classList.add('quick-segment-open');
  setTimeout(() => textarea.focus(), 0);
}

function closeQuickEditor() {
  const modal = $('quick-segment-modal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('quick-segment-open');
  activeQuickCard = null;
  activeAdvancedPrompt = null;
}

function saveQuickEditor() {
  const value = String($('quick-segment-prompt')?.value || '').trim();
  if (!value) {
    showToast('提示词不能为空', '请先填写片段动画、镜头和画面变化。');
    $('quick-segment-prompt')?.focus();
    return;
  }
  if (!activeAdvancedPrompt) {
    showToast('保存失败', '当前片段已经失去绑定，请重新打开编辑。');
    return;
  }

  activeAdvancedPrompt.value = value;
  activeAdvancedPrompt.dispatchEvent(new Event('input', { bubbles: true }));
  activeAdvancedPrompt.dispatchEvent(new Event('change', { bubbles: true }));

  if (activeQuickCard) {
    const spans = [...activeQuickCard.querySelectorAll(':scope > span')];
    const promptSpan = spans[spans.length - 1];
    if (promptSpan) promptSpan.textContent = value;
  }

  closeQuickEditor();
  showToast('提示词已保存', '已写回当前 Davis Video 项目。');
}

function wireQuickEditor() {
  document.addEventListener('click', event => {
    const trigger = event.target.closest(
      '#quick-timeline [data-edit-segment], #quick-timeline [data-select-segment]',
    );
    if (!trigger) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openQuickEditor(trigger);
  }, true);

  $('quick-segment-close')?.addEventListener('click', closeQuickEditor);
  $('quick-segment-cancel')?.addEventListener('click', closeQuickEditor);
  $('quick-segment-save')?.addEventListener('click', saveQuickEditor);
  $('quick-segment-modal')?.addEventListener('click', event => {
    if (event.target === $('quick-segment-modal')) closeQuickEditor();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('quick-segment-modal')?.hidden && $('ai-prompt-modal')?.hidden !== false) {
      closeQuickEditor();
    }
  });
}

function init() {
  injectStyles();
  applyVisibleBranding(document);
  wireQuickEditor();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) applyVisibleBranding(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.body.dataset.davisVideoUiBuild = BUILD;
  console.log('[Davis Video UI]', BUILD);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
