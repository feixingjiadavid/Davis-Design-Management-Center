import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArkResult } from './seedance-status-core.mjs';

const cases = [
  ['queued', 'queued', 20],
  ['processing', 'running', 60],
  ['running', 'running', 60],
  ['succeeded', 'succeeded', 100],
  ['completed', 'succeeded', 100],
  ['failed', 'failed', 100],
  ['rejected', 'failed', 100],
  ['cancelled', 'failed', 100],
  ['content_policy', 'failed', 100],
];

for (const [raw, expected, progress] of cases) {
  test('maps Ark status ' + raw + ' to ' + expected, () => {
    const result = normalizeArkResult({ status: raw }, 7);
    assert.equal(result.status, expected);
    assert.equal(result.progress, progress);
  });
}

test('treats a sensitive prompt error as terminal failure even without status', () => {
  const result = normalizeArkResult({
    error: {
      code: 'InputTextSensitiveContentDetected',
      message: 'The request failed because the input text may contain sensitive information.',
    },
  }, 20);

  assert.equal(result.status, 'failed');
  assert.match(result.errorMessage, /sensitive/i);
});

test('extracts nested Chinese moderation details', () => {
  const result = normalizeArkResult({
    data: { task_status: 'rejected' },
    detail: { message: '提示词敏感，内容审核失败' },
  }, 20);

  assert.equal(result.status, 'failed');
  assert.equal(result.errorMessage, '提示词敏感，内容审核失败');
});

test('extracts the official content.video_url on success', () => {
  const result = normalizeArkResult({
    status: 'succeeded',
    content: { video_url: 'https://ark.example/output.mp4?token=1' },
  }, 60);

  assert.equal(result.videoUrl, 'https://ark.example/output.mp4?token=1');
});

