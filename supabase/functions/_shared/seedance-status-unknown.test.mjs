import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArkResult } from './seedance-status-core.mjs';

test('normalizes every unrecognized provider status to unknown', () => {
  const result = normalizeArkResult({ status: 'provider_preparing_v2' }, 20);
  assert.equal(result.rawStatus, 'provider_preparing_v2');
  assert.equal(result.status, 'unknown');
});
