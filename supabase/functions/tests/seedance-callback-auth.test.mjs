import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callbackSignature,
  verifyCallbackSignature,
  safetyIdentifier,
} from '../_shared/seedance-callback-auth.mjs';

test('callback signature is stable and task-bound', async () => {
  const one = await callbackSignature('task-1', 'secret');
  assert.equal(one, await callbackSignature('task-1', 'secret'));
  assert.notEqual(one, await callbackSignature('task-2', 'secret'));
  assert.equal(await verifyCallbackSignature('task-1', one, 'secret'), true);
  assert.equal(await verifyCallbackSignature('task-2', one, 'secret'), false);
});

test('safety identifier is anonymous, stable and user-bound', async () => {
  const one = await safetyIdentifier('user-1', 'safety-secret');
  assert.equal(one, await safetyIdentifier('user-1', 'safety-secret'));
  assert.notEqual(one, await safetyIdentifier('user-2', 'safety-secret'));
  assert.doesNotMatch(one, /user-1/);
});
