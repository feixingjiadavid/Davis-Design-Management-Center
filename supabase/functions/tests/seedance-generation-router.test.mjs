import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationRoute } from '../_shared/seedance-generation-router.mjs';

test('2-person photo uses the temporary multi-person route', () => {
  const route = buildGenerationRoute({
    submitMode: 'temporary_reference_person',
    taskType: 'multi_person_reference_video',
    imageRole: 'reference_image',
    prompt: '保持两人合影与生活场景',
    imageUrl: 'https://example.test/two-people.png',
    imageCount: 1,
    containsRealPerson: true,
    realPersonCount: 2,
    multiPersonDetected: true,
    isGroupPhoto: true
  });
  assert.equal(route.submitMode, 'temporary_reference_person');
  assert.equal(route.taskType, 'multi_person_reference_video');
  assert.equal(route.content[1].role, 'reference_image');
  assert.equal(route.content[1].image_url.url, 'https://example.test/two-people.png');
  assert.equal(route.providerCreateLimit, 1);
  assert.deepEqual(route.diagnostics, {
    image_count: 1,
    contains_real_person: true,
    multi_person_detected: true,
    submit_mode: 'temporary_reference_person',
    task_type: 'multi_person_reference_video',
    image_role: 'reference_image'
  });
});

for (const scenario of [
  ['多人活动照片', 8, true],
  ['旅行合影', 4, true],
  ['人物较小但多人存在', 3, true]
]) {
  test(`${scenario[0]} stays on temporary multi-person reference`, () => {
    const route = buildGenerationRoute({
      submitMode: 'temporary_reference_person',
      imageRole: 'reference_image',
      prompt: scenario[0],
      imageUrl: 'https://example.test/group.png',
      imageCount: 1,
      containsRealPerson: true,
      realPersonCount: scenario[1],
      multiPersonDetected: scenario[2],
      isGroupPhoto: scenario[2]
    });
    assert.equal(route.taskType, 'multi_person_reference_video');
    assert.equal(route.submitMode, 'temporary_reference_person');
    assert.equal(route.providerCreateLimit, 1);
    assert.equal(route.assetRequired, false);
  });
}

test('one real person is a temporary person reference task', () => {
  const route = buildGenerationRoute({
    submitMode: 'temporary_reference_person',
    imageRole: 'first_frame',
    prompt: '生活照',
    imageUrl: 'https://example.test/person.png',
    imageCount: 1,
    containsRealPerson: true,
    realPersonCount: 1
  });
  assert.equal(route.taskType, 'temporary_person_reference_video');
  assert.equal(route.content[1].role, 'first_frame');
});

test('first-frame intent is never inferred from image count', () => {
  const route = buildGenerationRoute({
    submitMode: 'temporary_reference_person',
    taskType: 'multi_person_reference_video',
    imageRole: 'first_frame',
    prompt: '保持多人场景',
    imageUrl: 'https://example.test/group.png'
  });
  assert.equal(route.content[1].role, 'first_frame');
});

test('missing role fails before provider submission', () => {
  assert.throws(() => buildGenerationRoute({
    submitMode: 'temporary_reference_person',
    taskType: 'multi_person_reference_video',
    prompt: 'p',
    imageUrl: 'https://example.test/group.png'
  }), /IMAGE_ROLE_REQUIRED/);
});

test('text-to-video has no image content', () => {
  const route = buildGenerationRoute({
    submitMode: 'text_to_video',
    taskType: 'text_to_video',
    prompt: '海面日出'
  });
  assert.equal(route.content.length, 1);
  assert.equal(route.content[0].type, 'text');
});

test('first-last-frame preserves both explicit roles', () => {
  const route = buildGenerationRoute({
    submitMode: 'first_last_frame_video',
    taskType: 'first_last_frame_video',
    imageRole: 'first_frame',
    prompt: '转场',
    imageUrl: 'https://example.test/first.png',
    lastFrameUrl: 'https://example.test/last.png'
  });
  assert.deepEqual(route.content.slice(1).map((item) => item.role), ['first_frame', 'last_frame']);
});
