import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterTravelGenerationDrafts,
  isTravelGenerationDraft,
} from './travel-history-cleanup.mjs';

test('recognizes a known travel generation project through nested workspace binding', () => {
  const draft = {
    id: 'local-draft',
    name: '未命名项目',
    workspaces: {
      first_last: { remoteProjectId: 'e28c6968-c374-4e08-8620-7eba4d479b5e' },
    },
  };

  assert.equal(isTravelGenerationDraft(draft), true);
});

test('recognizes explicit travel generation prompts even without a cloud id', () => {
  const draft = {
    id: 'local-only',
    name: '视频测试',
    workspaces: {
      text_only: { segments: [{ prompt: '生成冰岛旅行路线与机场候机动画' }] },
    },
  };

  assert.equal(isTravelGenerationDraft(draft), true);
});

test('does not remove non-travel anniversary map visuals', () => {
  const draft = {
    id: 'anniversary',
    name: '周年视频开场动画',
    workspaces: {
      multi_frame: { segments: [{ prompt: '地图上的蓝色路线象征五周年到十周年的成长历程' }] },
    },
  };

  assert.equal(isTravelGenerationDraft(draft), false);
});

test('returns kept and removed drafts separately', () => {
  const result = filterTravelGenerationDrafts([
    { id: 'travel', name: '卡通旅行科普风' },
    { id: 'keep', name: '周年活动开场' },
  ]);

  assert.deepEqual(result.kept.map(item => item.id), ['keep']);
  assert.deepEqual(result.removed.map(item => item.id), ['travel']);
});
