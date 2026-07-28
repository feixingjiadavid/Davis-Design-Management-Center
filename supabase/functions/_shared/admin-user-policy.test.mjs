import {
  authorizeDisableUser,
  normalizeEnName,
} from './admin-user-policy.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(fn, expectedStatus, label) {
  try {
    fn();
  } catch (error) {
    assert(error.status === expectedStatus, `${label}: expected status ${expectedStatus}, got ${error.status}`);
    return;
  }
  throw new Error(`${label}: expected an error`);
}

assert(normalizeEnName('  DavidXXu  ') === 'davidxxu', 'normalizes the account name');
expectStatus(() => normalizeEnName('../bad'), 400, 'rejects unsafe account names');

assert(authorizeDisableUser({
  actorId: 'admin-id',
  actorRole: 'admin',
  actorDisabled: false,
  targetId: 'member-id',
}) === true, 'allows an enabled administrator to disable another member');

expectStatus(() => authorizeDisableUser({
  actorId: 'member-id',
  actorRole: 'user',
  actorDisabled: false,
  targetId: 'target-id',
}), 403, 'rejects non-admin users');

expectStatus(() => authorizeDisableUser({
  actorId: 'admin-id',
  actorRole: 'admin',
  actorDisabled: true,
  targetId: 'target-id',
}), 403, 'rejects disabled administrators');

expectStatus(() => authorizeDisableUser({
  actorId: 'same-id',
  actorRole: 'admin',
  actorDisabled: false,
  targetId: 'same-id',
}), 409, 'prevents self-disable');

expectStatus(() => authorizeDisableUser({
  actorId: 'admin-id',
  actorRole: 'admin',
  actorDisabled: false,
  targetId: null,
}), 404, 'rejects missing targets');

console.log('admin-user-policy: 7 tests passed');
