import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProjectVersion,
  nextProjectVersionName,
  cloneDraftAsVersion,
} from './project-version-policy.mjs';

test('parses anchored V-N suffixes and allocates the highest local/remote next version', () => {
  assert.deepEqual(parseProjectVersion('冰岛视频 V-2'), { baseName: '冰岛视频', version: 2 });
  assert.deepEqual(parseProjectVersion('冰岛视频 V-2 说明'), { baseName: '冰岛视频 V-2 说明', version: 1 });
  assert.equal(nextProjectVersionName('冰岛视频', []), '冰岛视频 V-2');
  assert.equal(
    nextProjectVersionName('冰岛视频 V-2', ['冰岛视频', '冰岛视频 V-2', '冰岛视频 V-3', '别的项目 V-9']),
    '冰岛视频 V-4',
  );
});

test('clones editable content while clearing every remote task/output binding', () => {
  const blob = new Blob(['image'], { type: 'image/png' });
  const source = {
    id: 'old',
    name: '冰岛视频',
    mode: 'first_last',
    lockedMode: 'first_last',
    ratio: '16:9',
    finalWidth: 1920,
    finalHeight: 1080,
    fitMode: 'contain',
    remoteProjectId: 'remote-old',
    workspaces: {
      first_last: {
        remoteProjectId: 'remote-old',
        frames: [{ id: 'f1', blob, remoteAssetId: 'asset-old', remotePath: 'old/path' }],
        segments: [{
          id: 's1',
          prompt: '保留这段编辑后的提示词',
          status: 'completed',
          progress: 100,
          providerTaskId: 'ark-old',
          remoteTaskId: 'task-old',
          remoteSegmentId: 'segment-old',
          outputPath: 'drive-old',
        }],
        outputs: [{ id: 'output-old' }],
        outputHistory: [{ id: 'history-old' }],
        jobs: [{ id: 'job-old' }],
        referenceAssets: [],
      },
    },
  };
  source.frames = source.workspaces.first_last.frames;
  source.segments = source.workspaces.first_last.segments;

  const fork = cloneDraftAsVersion(source, '冰岛视频 V-2', () => 'new', 99);
  assert.equal(fork.id, 'new');
  assert.equal(fork.name, '冰岛视频 V-2');
  assert.equal(fork.versionSourceDraftId, 'old');
  assert.equal(fork.versionNumber, 2);
  assert.equal(fork.remoteProjectId, null);
  assert.equal(fork.workspaces.first_last.remoteProjectId, null);
  assert.equal(fork.frames[0].blob.size, blob.size);
  assert.equal(fork.frames[0].remoteAssetId, null);
  assert.equal(fork.frames[0].remotePath, null);
  assert.equal(fork.segments[0].prompt, '保留这段编辑后的提示词');
  assert.equal(fork.segments[0].status, 'draft');
  assert.equal(fork.segments[0].providerTaskId, null);
  assert.equal(fork.segments[0].remoteTaskId, null);
  assert.equal(fork.segments[0].remoteSegmentId, null);
  assert.deepEqual(fork.workspaces.first_last.outputs, []);
  assert.deepEqual(fork.workspaces.first_last.outputHistory, []);
  assert.deepEqual(fork.workspaces.first_last.jobs, []);
  assert.equal(source.workspaces.first_last.segments[0].status, 'completed');
});
