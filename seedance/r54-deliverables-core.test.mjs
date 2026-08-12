import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_STATUSES,
  normalizeReviewStatus,
  resolveDraftReviewStatus,
  groupTasksByDeliverable,
  validateBatchRows,
  nextAttemptNo,
  parseEstimatedRmb,
  buildPaidConfirmation,
  parseCsvText,
} from './r54-deliverables-core.mjs';

test('normalizes review states and falls back to draft', () => {
  assert.equal(normalizeReviewStatus('accepted'), 'accepted');
  assert.equal(normalizeReviewStatus(' needs_retry '), 'needs_retry');
  assert.equal(normalizeReviewStatus('unknown'), 'draft');
  assert.deepEqual(REVIEW_STATUSES, ['draft','pending_review','accepted','backup','rejected','needs_retry']);
});

test('keeps review state isolated when legacy local tasks share one remote project', () => {
  assert.equal(resolveDraftReviewStatus({ draftStatus:'accepted', cloudStatus:'backup', remoteShareCount:3 }), 'accepted');
  assert.equal(resolveDraftReviewStatus({ draftStatus:'', cloudStatus:'accepted', remoteShareCount:3 }), 'draft');
  assert.equal(resolveDraftReviewStatus({ draftStatus:null, cloudStatus:'backup', remoteShareCount:1 }), 'backup');
  assert.equal(resolveDraftReviewStatus({ draftStatus:'', cloudStatus:'rejected', remoteShareCount:0 }), 'draft');
});

test('groups tasks by deliverable and preserves historical tasks as unclassified', () => {
  const deliverables = [
    { id:'d1', name:'互动暖场视频', sort_order:0 },
    { id:'d2', name:'开场视频', sort_order:1 },
  ];
  const tasks = [
    { id:'t1', deliverable_id:'d1', task_order:2 },
    { id:'t2', deliverable_id:null, task_order:1 },
    { id:'t3', deliverable_id:'d2', task_order:0 },
    { id:'t4', deliverable_id:'missing', task_order:3 },
  ];
  const grouped = groupTasksByDeliverable(tasks, deliverables);
  assert.equal(grouped.sections.length, 2);
  assert.deepEqual(grouped.sections[0].tasks.map(task => task.id), ['t1']);
  assert.deepEqual(grouped.sections[1].tasks.map(task => task.id), ['t3']);
  assert.deepEqual(grouped.unclassified.map(task => task.id), ['t2','t4']);
});

test('accepts anniversary batch of 45 unique draft rows', () => {
  const rows = [];
  for (let i = 1; i <= 25; i += 1) rows.push({
    taskName:`5周年员工${i}`,
    subjectKey:`5y-${i}`,
    mode:'first_last',
    oldPhoto:`5y-${i}-old.jpg`,
    currentPhoto:`5y-${i}-now.jpg`,
  });
  for (let i = 1; i <= 20; i += 1) rows.push({
    taskName:`10周年员工${i}`,
    subjectKey:`10y-${i}`,
    mode:'first_last',
    oldPhoto:`10y-${i}-old.jpg`,
    currentPhoto:`10y-${i}-now.jpg`,
  });
  const result = validateBatchRows(rows);
  assert.equal(result.valid.length, 45);
  assert.equal(result.invalid.length, 0);
});

test('reports row-level validation errors and duplicate subject keys', () => {
  const result = validateBatchRows([
    { taskName:'', subjectKey:'a', mode:'first_last', oldPhoto:'old.jpg', currentPhoto:'now.jpg' },
    { taskName:'B', subjectKey:'', mode:'first_last', oldPhoto:'old.jpg', currentPhoto:'now.jpg' },
    { taskName:'C', subjectKey:'dup', mode:'wrong', oldPhoto:'old.jpg', currentPhoto:'now.jpg' },
    { taskName:'D', subjectKey:'dup', mode:'first_last', oldPhoto:'', currentPhoto:'now.jpg' },
  ]);
  assert.equal(result.valid.length, 0);
  assert.equal(result.invalid.length, 4);
  assert.match(result.invalid[0].errors.join(' '), /任务名称/);
  assert.match(result.invalid[1].errors.join(' '), /subject_key/);
  assert.match(result.invalid[2].errors.join(' '), /生成模式/);
  assert.match(result.invalid[2].errors.join(' '), /重复/);
  assert.match(result.invalid[3].errors.join(' '), /历史照片/);
});

test('calculates next attempt number for same subject and deliverable', () => {
  const tasks = [
    { deliverable_id:'d1', subject_key:'alice', attempt_no:1 },
    { deliverable_id:'d1', subject_key:'alice', attempt_no:3 },
    { deliverable_id:'d2', subject_key:'alice', attempt_no:7 },
    { deliverable_id:'d1', subject_key:'bob', attempt_no:9 },
  ];
  assert.equal(nextAttemptNo(tasks, 'alice', 'd1'), 4);
  assert.equal(nextAttemptNo(tasks, 'new-person', 'd1'), 1);
});

test('parses visible RMB estimates and builds explicit paid confirmation totals', () => {
  assert.equal(parseEstimatedRmb('预计费用 ¥3.82'), 3.82);
  assert.equal(parseEstimatedRmb('本段预计：￥ 12.50 元'), 12.5);
  assert.equal(parseEstimatedRmb('¥1,234.56'), 1234.56);
  assert.equal(parseEstimatedRmb('费用暂不可计算'), null);

  const summary = buildPaidConfirmation([
    { name:'张三', estimateRmb:3.82 },
    { name:'李四', estimateRmb:4.65 },
  ], 100);
  assert.equal(summary.count, 2);
  assert.equal(summary.incrementalTotal, 8.47);
  assert.equal(summary.projectAfterTotal, 108.47);
  assert.match(summary.confirmLabel, /2 项/);
  assert.match(summary.confirmLabel, /8\.47/);
});

test('rejects paid confirmation when any estimate is missing', () => {
  const summary = buildPaidConfirmation([
    { name:'张三', estimateRmb:3.82 },
    { name:'李四', estimateRmb:null },
  ], 20);
  assert.equal(summary.ok, false);
  assert.equal(summary.incrementalTotal, null);
});

test('parses quoted CSV fields used by bulk import', () => {
  const rows = parseCsvText('任务名称,subject_key,生成模式,历史照片,当前照片\n"张三,五周年",zs,首尾帧,old.jpg,now.jpg\n李四,ls,first_last,old2.jpg,now2.jpg');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['任务名称'], '张三,五周年');
  assert.equal(rows[1]['subject_key'], 'ls');
});
