const VALID_IMAGE_ROLES = new Set(['first_frame', 'reference_image']);

function asBoolean(value) {
  return value === true;
}

function positiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function imageItem(url, role) {
  return {
    type: 'image_url',
    image_url: { url: String(url || '') },
    role
  };
}

export function inferTemporaryTaskType(input = {}) {
  if (input.taskType) return String(input.taskType);
  if (input.submitMode === 'text_to_video') return 'text_to_video';
  if (input.submitMode === 'first_last_frame_video' || input.lastFrameUrl) {
    return 'first_last_frame_video';
  }
  const count = positiveInteger(input.realPersonCount);
  if (asBoolean(input.multiPersonDetected) || asBoolean(input.isGroupPhoto) || count >= 2) {
    return 'multi_person_reference_video';
  }
  if (asBoolean(input.containsRealPerson) || count === 1) {
    return 'temporary_person_reference_video';
  }
  return input.imageRole === 'first_frame'
    ? 'image_first_frame'
    : 'reference_image_video';
}

export function buildGenerationRoute(input = {}) {
  const submitMode = String(input.submitMode || '');
  const taskType = inferTemporaryTaskType(input);
  const prompt = String(input.prompt || '');
  const text = { type: 'text', text: prompt };

  if (taskType === 'text_to_video' || submitMode === 'text_to_video') {
    return {
      submitMode: submitMode || 'text_to_video',
      taskType: 'text_to_video',
      providerCreateLimit: 1,
      assetRequired: false,
      content: [text],
      diagnostics: {
        image_count: 0,
        contains_real_person: false,
        multi_person_detected: false,
        submit_mode: submitMode || 'text_to_video',
        task_type: 'text_to_video',
        image_role: null
      }
    };
  }

  const requestedImageRole = String(input.imageRole || '');
  const temporaryReferenceTask = taskType === 'multi_person_reference_video' ||
    taskType === 'temporary_person_reference_video';
  // Ordinary real-person photos are multimodal references, not timeline
  // keyframes. Keep this server-authoritative so stale clients cannot route a
  // group photo back through first_frame.
  const imageRole = temporaryReferenceTask ? 'reference_image' : requestedImageRole;
  if (!VALID_IMAGE_ROLES.has(imageRole)) {
    throw new Error('IMAGE_ROLE_REQUIRED');
  }
  if (!input.imageUrl) throw new Error('IMAGE_URL_REQUIRED');

  const content = [text, imageItem(input.imageUrl, imageRole)];
  if (taskType === 'first_last_frame_video') {
    if (!input.lastFrameUrl) throw new Error('LAST_FRAME_URL_REQUIRED');
    content.push(imageItem(input.lastFrameUrl, 'last_frame'));
  }

  const effectiveMode = submitMode ||
    (taskType === 'first_last_frame_video'
      ? 'first_last_frame_video'
      : 'temporary_reference_person');
  const personCount = positiveInteger(input.realPersonCount);
  const multiPersonDetected = asBoolean(input.multiPersonDetected) ||
    asBoolean(input.isGroupPhoto) || personCount >= 2;

  return {
    submitMode: effectiveMode,
    taskType,
    providerCreateLimit: 1,
    assetRequired: false,
    content,
    diagnostics: {
      image_count: positiveInteger(input.imageCount, content.length - 1),
      contains_real_person: asBoolean(input.containsRealPerson) || personCount > 0,
      multi_person_detected: multiPersonDetected,
      submit_mode: effectiveMode,
      task_type: taskType,
      image_role: imageRole
    }
  };
}
