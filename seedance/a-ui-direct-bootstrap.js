const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForBaseTree(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const root = document.getElementById('project-list');
    const ready = root && (root.querySelector('.project-tree-group, .project-child') || root.children.length === 0);
    if (ready) {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    }
    await sleep(100);
  }
  return false;
}

async function bootDirectly() {
  await waitForBaseTree();

  if (document.body?.dataset?.davisVideoDeliverablesR54 !== 'ready') {
    const { initPaidSafetyR54 } = await import('./r54-paid-safety.js');
    initPaidSafetyR54();

    const { initDeliverablesR54 } = await import('./r54-deliverables.js');
    initDeliverablesR54();
  }

  for (let i = 0; i < 60; i += 1) {
    if (document.body?.dataset?.davisVideoDeliverablesR54 === 'ready') break;
    await sleep(100);
  }

  const modules = [
    ['./r54-tree-stability.js', 'initTreeStabilityR54'],
    ['./r54-architecture-ux.js', 'initArchitectureUxR54'],
    ['./r54-selection-tools.js', 'initSelectionToolsR54'],
    ['./r54-cost-context.js', 'initCostContextR54'],
  ];

  for (const [path, fn] of modules) {
    const mod = await import(path);
    if (typeof mod[fn] === 'function') mod[fn]();
  }

  document.body.dataset.davisVideoADirectBootstrap = 'ready';
  console.log('[Davis Video A] direct fail-open bootstrap ready');
}

setTimeout(() => {
  void bootDirectly().catch(error => console.error('[Davis Video A] direct fail-open bootstrap failed', error));
}, 1200);
