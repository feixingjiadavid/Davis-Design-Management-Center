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
