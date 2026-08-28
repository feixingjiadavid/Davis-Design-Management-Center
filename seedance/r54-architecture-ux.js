const BUILD = '20260828-direct-child-task-entry-v1';

function init() {
  if (!document.body || document.body.dataset.davisVideoArchitectureUxR54 === 'ready') return;

  // Compatibility shim only. The native R49 project tree owns task creation:
  // project -> new generation task. Do not hide or intercept its add buttons.
  document.body.dataset.davisVideoArchitectureUxR54 = 'ready';
  console.log('[Davis Video Direct Task Architecture]', BUILD);
}

export function initArchitectureUxR54() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
