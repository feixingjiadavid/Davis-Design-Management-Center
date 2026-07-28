import test from 'node:test';
import assert from 'node:assert/strict';
import { createArkTask, isRetryableArkStatus } from './seedance-ark-submit.mjs';

test('classifies throttling and provider errors for durable retry', () => {
  assert.equal(isRetryableArkStatus(429), true);
  assert.equal(isRetryableArkStatus(503), true);
  assert.equal(isRetryableArkStatus(400), false);
});

test('returns provider task id from Ark create response', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ id: 'cgt-test' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const result = await createArkTask('key', { model: 'seedance' }, { fetchImpl, timeoutMs: 1000 });
  assert.equal(result.providerTaskId, 'cgt-test');
  assert.equal(result.httpStatus, 200);
});

test('marks Ark 429 rejection retryable', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'busy' } }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(
    () => createArkTask('key', { model: 'seedance' }, { fetchImpl, timeoutMs: 1000 }),
    error => error.retryable === true && error.httpStatus === 429,
  );
});
