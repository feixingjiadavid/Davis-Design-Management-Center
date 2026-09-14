import assert from 'node:assert/strict';
import test from 'node:test';

import normalizer from '../assets/manager-identity-normalizer.js';

const { buildSystemUsers, resolveSystemUser } = normalizer;

const profiles = [
  { en_name: 'davidxxu', cn_name: '许博文', display_name: '文哥' },
  { en_name: 'v_lijuangchen', cn_name: '陈荔鹃', display_name: '荔鹃' },
];

const aliases = [
  { en_name: 'davidxxu', alias: 'davidxxu@webank.com', display_name: '文哥', email: 'davidxxu@webank.com' },
  { en_name: 'davidxxu', alias: '文哥', display_name: '文哥', email: 'davidxxu@webank.com' },
  { en_name: 'v_lijuangchen', alias: '陈荔鹃', display_name: '荔鹃', email: 'v_lijuangchen@webank.com' },
];

test('merges profile names and notification aliases under one English account', () => {
  const users = buildSystemUsers(profiles, aliases);

  assert.equal(users.length, 2);
  assert.equal(resolveSystemUser('davidxxu', users)?.en, 'davidxxu');
  assert.equal(resolveSystemUser('文哥', users)?.en, 'davidxxu');
  assert.equal(resolveSystemUser('许博文', users)?.en, 'davidxxu');
  assert.equal(resolveSystemUser('davidxxu@webank.com', users)?.en, 'davidxxu');
  assert.equal(resolveSystemUser('陈荔鹃', users)?.en, 'v_lijuangchen');
});

test('does not use partial substring matching between different people', () => {
  const users = buildSystemUsers([
    { en_name: 'ann', cn_name: '安', display_name: '安' },
    { en_name: 'anna', cn_name: '安娜', display_name: '安娜' },
  ], []);

  assert.equal(resolveSystemUser('anna', users)?.en, 'anna');
  assert.equal(resolveSystemUser('ann', users)?.en, 'ann');
});
