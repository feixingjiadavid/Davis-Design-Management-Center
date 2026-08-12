import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

test('A-version self-writing UI helpers do not use page-wide MutationObserver loops', () => {
  for (const path of [
    'seedance/r54-architecture-ux.js',
    'seedance/r54-cost-context.js',
    'seedance/r54-selection-tools.js',
  ]) {
    const source = read(path);
    assert.equal(source.includes('new MutationObserver'), false, `${path} must stay event-driven`);
  }
});

test('paid generation safety remains explicit and automatic quality retry is absent', () => {
  const deliverables = read('seedance/r54-deliverables.js');
  const paidSafety = read('seedance/r54-paid-safety.js');
  assert.match(deliverables, /费用暂不可计算/);
  assert.match(deliverables, /系统不会因为质量问题自动重新生成/);
  assert.match(paidSafety, /已阻止覆盖式重新生成/);
  assert.equal(/auto.*retry.*quality/i.test(deliverables), false);
});

test('batch import is draft-only before paid submission', () => {
  const source = read('seedance/r54-deliverables.js');
  assert.match(source, /创建草稿不调用 Seedance，不产生模型费用/);
  assert.match(source, /创建草稿（不产生费用）/);
});

test('review status save never rebuilds the project tree', () => {
  const source = read('seedance/r54-deliverables.js');
  const match = source.match(/async function setReview\([\s\S]*?\nasync function retryDraft/);
  assert.ok(match, 'setReview implementation must be present');
  assert.doesNotMatch(match[0], /await loadData\(\)/, 'status save must not reload all project data');
  assert.doesNotMatch(match[0], /queueEnhance\(\)/, 'status save must not rebuild the sidebar tree');
  assert.match(match[0], /saveDraft\(draft\)/, 'status save must persist the local draft');
});

test('review UI is event-driven and exposes only three business states', () => {
  const source = read('seedance/a-ui-category-tools.js');
  assert.equal(source.includes('setInterval('), false, 'review UI must not poll the page');
  assert.match(source, /data-a-review="accepted"[^>]*>定版</);
  assert.match(source, /data-a-review="backup"[^>]*>备用</);
  assert.match(source, /data-a-review="rejected"[^>]*>废弃</);
  assert.doesNotMatch(source, /data-a-review="draft"/);
  assert.doesNotMatch(source, /data-a-review="pending_review"/);
  assert.doesNotMatch(source, /data-a-review="needs_retry"/);
});

test('sidebar business status uses native persisted R54 pill and hides internal states', () => {
  const css = read('seedance/a-ui-layout-fix.css');
  assert.match(css, /\.r54-pill\[data-status="accepted"\][\s\S]*display:inline-flex/);
  assert.match(css, /\.r54-pill\[data-status="backup"\][\s\S]*display:inline-flex/);
  assert.match(css, /\.r54-pill\[data-status="rejected"\][\s\S]*display:inline-flex/);
  assert.match(css, /\.r54-pill\[data-status="draft"\][\s\S]*display:none/);
  assert.match(css, /\.r54-pill\[data-status="pending_review"\][\s\S]*display:none/);
  assert.match(css, /\.r54-pill\[data-status="needs_retry"\][\s\S]*display:none/);
});

// R12: task selection and status are isolated per child task.
test('selecting a child task does not rebuild the whole sidebar', () => {
  const source = read('seedance/app.js');
  const match = source.match(/async function r49SelectDraft\([\s\S]*?\nasync function r49RemoveTask/);
  assert.ok(match, 'r49SelectDraft implementation must be present');
  assert.doesNotMatch(match[0], /renderProjects\(\)/, 'task selection must not rebuild project-list');
  assert.match(match[0], /davis-video-task-selected/, 'task selection must emit one explicit selection event');
});

test('R54 does not run periodic whole-tree sync after startup', () => {
  const source = read('seedance/r54-deliverables.js');
  assert.doesNotMatch(source, /state\.syncTimer\s*=\s*setInterval/, 'periodic sync timer causes hidden project-tree rewrites');
});

test('review toolbar follows explicit task-selected event', () => {
  const source = read('seedance/a-ui-category-tools.js');
  assert.match(source, /davis-video-task-selected/, 'toolbar must sync when a child task selection completes');
});
