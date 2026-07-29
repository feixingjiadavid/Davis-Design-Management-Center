import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isVideoSuperAdmin,
  isForeignVideoOwner,
  canMutateVideoOwner,
  scopeVideoRead,
} from './access-control.mjs';

test('ordinary user read scope adds the authenticated owner filter', () => {
  const calls = [];
  const query = {
    eq(column, value) {
      calls.push([column, value]);
      return this;
    },
  };

  const result = scopeVideoRead(query, {
    id: 'user-a',
    email: 'ordinary@webank.com',
  });

  assert.equal(result, query);
  assert.deepEqual(calls, [['owner_id', 'user-a']]);
});

test('both super administrators receive unfiltered read scope', () => {
  for (const email of [
    'davidxxu@webank.com',
    'judyzzhang@webank.com',
  ]) {
    const query = {
      eq() {
        throw new Error('administrator read scope must not add an owner filter');
      },
    };

    assert.equal(scopeVideoRead(query, { id: email, email }), query);
    assert.equal(isVideoSuperAdmin({ id: email, email }), true);
  }
});

test('administrator cannot mutate a foreign owner project', () => {
  assert.equal(
    canMutateVideoOwner(
      { id: 'admin-id', email: 'davidxxu@webank.com' },
      'other-user-id',
    ),
    false,
  );
  assert.equal(
    isForeignVideoOwner(
      { id: 'admin-id', email: 'davidxxu@webank.com' },
      'other-user-id',
    ),
    true,
  );
});

test('administrator can mutate only their own project', () => {
  const admin = { id: 'admin-id', email: 'judyzzhang@webank.com' };
  assert.equal(canMutateVideoOwner(admin, 'admin-id'), true);
  assert.equal(isForeignVideoOwner(admin, 'admin-id'), false);
});

test('ordinary users cannot read or mutate foreign ownership', () => {
  const ordinary = { id: 'user-a', email: 'ordinary@webank.com' };
  assert.equal(isVideoSuperAdmin(ordinary), false);
  assert.equal(canMutateVideoOwner(ordinary, 'user-b'), false);
  assert.equal(isForeignVideoOwner(ordinary, 'user-b'), true);
});

test('missing identity or ownership fails closed', () => {
  assert.equal(isVideoSuperAdmin(null), false);
  assert.equal(canMutateVideoOwner(null, 'user-a'), false);
  assert.equal(canMutateVideoOwner({ id: 'user-a' }, ''), false);
  assert.equal(isForeignVideoOwner({ id: 'user-a' }, ''), true);
});

test('administrator email comparison is case insensitive', () => {
  assert.equal(
    isVideoSuperAdmin({
      id: 'admin-id',
      email: 'DavidXXu@Webank.com',
    }),
    true,
  );
});
