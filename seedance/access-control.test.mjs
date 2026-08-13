import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isVideoSuperAdmin,
  isForeignVideoOwner,
  canMutateVideoOwner,
  canDeleteVideoOwner,
  scopeVideoRead,
} from './access-control.mjs';

test('authenticated system users receive shared video read scope', () => {
  const query = {
    eq() {
      throw new Error('shared authenticated reads must not be owner-filtered');
    },
  };

  for (const user of [
    { id: 'user-a', email: 'ordinary@webank.com' },
    { id: 'admin-id', email: 'davidxxu@webank.com' },
  ]) {
    assert.equal(scopeVideoRead(query, user), query);
  }
});

test('authenticated system users can collaborate on foreign video projects', () => {
  const user = { id: 'user-a', email: 'ordinary@webank.com' };
  assert.equal(canMutateVideoOwner(user, 'user-b'), true);
  assert.equal(canMutateVideoOwner(user, ''), true);
  assert.equal(isForeignVideoOwner(user, 'user-b'), true);
});

test('delete remains owner-only even though editing is collaborative', () => {
  const user = { id: 'user-a', email: 'ordinary@webank.com' };
  assert.equal(canDeleteVideoOwner(user, 'user-a'), true);
  assert.equal(canDeleteVideoOwner(user, 'user-b'), false);
  assert.equal(canDeleteVideoOwner(user, ''), false);
});

test('anonymous or missing authenticated identity fails closed', () => {
  const calls = [];
  const query = {
    eq(column, value) {
      calls.push([column, value]);
      return this;
    },
  };
  assert.equal(canMutateVideoOwner(null, 'user-a'), false);
  assert.equal(canDeleteVideoOwner(null, 'user-a'), false);
  assert.equal(scopeVideoRead(query, null), query);
  assert.deepEqual(calls, [['owner_id', '__missing_authenticated_user__']]);
});

test('super administrator recognition is preserved', () => {
  for (const email of ['davidxxu@webank.com', 'judyzzhang@webank.com', 'DavidXXu@Webank.com']) {
    assert.equal(isVideoSuperAdmin({ id: 'admin-id', email }), true);
  }
  assert.equal(isVideoSuperAdmin({ id: 'user-a', email: 'ordinary@webank.com' }), false);
});
