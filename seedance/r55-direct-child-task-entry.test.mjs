import test from 'node:test';
import assert from 'node:assert/strict';

test('project task entry stays visible and opens the native child-task flow', async () => {
  const nodesById = new Map();
  const listeners = new Map();
  const appendedStyles = [];

  globalThis.sessionStorage = {
    getItem: () => '',
    removeItem: () => {},
    setItem: () => {},
  };
  globalThis.document = {
    readyState: 'complete',
    hidden: false,
    body: { dataset: {} },
    head: {
      appendChild(node) {
        appendedStyles.push(node);
        if (node.id) nodesById.set(node.id, node);
      },
    },
    createElement: () => ({ id: '', textContent: '' }),
    getElementById: id => nodesById.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };

  const module = await import(`./r54-architecture-ux.js?test=${Date.now()}`);
  module.initArchitectureUxR54();

  const combinedStyle = appendedStyles.map(node => node.textContent).join('\n');
  assert.doesNotMatch(
    combinedStyle,
    /\.project-(?:parent-add|child-add)[\s\S]*?display\s*:\s*none/i,
    'the architecture layer must not hide either native new-task entry',
  );

  let prevented = false;
  let stopped = false;
  listeners.get('click')?.({
    target: {
      closest(selector) {
        return selector.includes('#new-child-task-current') ? this : null;
      },
    },
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
    stopImmediatePropagation() { stopped = true; },
  });

  assert.equal(prevented, false, 'native new-task click must not be intercepted');
  assert.equal(stopped, false, 'native new-task click must reach the base task creator');
});
