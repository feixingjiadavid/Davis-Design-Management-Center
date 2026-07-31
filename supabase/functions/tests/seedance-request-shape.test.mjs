import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSeedanceRequestShape } from '../_shared/seedance-request-shape.mjs';

test('one reference image is not reinterpreted as first_frame', () => {
  const shape = buildSeedanceRequestShape({
    isTextOnly: true,
    promptText: '保持参考图人物和场景',
    referenceItems: [{
      url: 'https://example.test/group.png',
      mime_type: 'image/png',
      direction: 'overall'
    }]
  });
  assert.equal(shape.taskType, 'reference_image_video');
  assert.deepEqual(shape.imageRoles, ['reference_image']);
  assert.equal(shape.content[1].role, 'reference_image');
});
