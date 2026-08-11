import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeModelAlias,
  normalizeResolution,
  validateBatchRows,
} from './r54-deliverables-core.mjs';

test('maps official Seedance display names to runtime aliases', () => {
  assert.equal(normalizeModelAlias('Seedance 2.0'), 'v20');
  assert.equal(normalizeModelAlias('Seedance 2.0 Fast'), 'fast');
  assert.equal(normalizeModelAlias('Seedance 2.0 Mini'), 'mini');
  assert.equal(normalizeModelAlias('Seedance 1.5 Pro'), 'v15');
});

test('normalizes display resolution casing', () => {
  assert.equal(normalizeResolution('1080P'), '1080p');
  assert.equal(normalizeResolution('4K'), '4k');
});

test('batch validation returns runtime-safe aliases from official names', () => {
  const result = validateBatchRows([{
    '任务名称':'张三｜5周年互动',
    subject_key:'zhangsan_5y',
    '生成模式':'首尾帧',
    '历史照片':'zhangsan_old.jpg',
    '当前照片':'zhangsan_now.jpg',
    '模型':'Seedance 2.0',
    '分辨率':'1080P',
  }]);
  assert.equal(result.invalid.length, 0);
  assert.equal(result.valid[0].normalized.model, 'v20');
  assert.equal(result.valid[0].normalized.resolution, '1080p');
});

test('rejects invented or unsupported model names instead of silently spending', () => {
  const result = validateBatchRows([{
    '任务名称':'张三｜5周年互动',
    subject_key:'zhangsan_5y',
    '生成模式':'首尾帧',
    '历史照片':'zhangsan_old.jpg',
    '当前照片':'zhangsan_now.jpg',
    '模型':'Davis Video Ultra',
  }]);
  assert.equal(result.valid.length, 0);
  assert.match(result.invalid[0].errors.join(' '), /Seedance 2\.0/);
});
