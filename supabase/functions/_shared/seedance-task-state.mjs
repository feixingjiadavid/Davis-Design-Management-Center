export const PRIVACY_INFORMATION_CODE =
  'InputImageSensitiveContentDetected.PrivacyInformation';

const POLICY_MESSAGE =
  '当前视频模型对该真人参考图片进行了安全限制。素材和项目已保存，你可以更换参考图片后重新生成。';

function requestIdFrom(payload = {}) {
  const error = payload?.error && typeof payload.error === 'object'
    ? payload.error
    : {};
  return String(
    payload.request_id || payload.requestId ||
    error.request_id || error.requestId || ''
  ) || null;
}

function codeFrom(payload = {}) {
  const error = payload?.error && typeof payload.error === 'object'
    ? payload.error
    : {};
  return String(error.code || payload.code || '');
}

export function classifyArkFailure(payload = {}, httpStatus = 0) {
  const code = codeFrom(payload);
  const message = String(payload?.error?.message || payload.message || '');
  const privacyBlocked = code === PRIVACY_INFORMATION_CODE ||
    /PrivacyInformation|may contain real person/i.test(message);

  if (privacyBlocked) {
    return {
      status: 'provider_policy_blocked',
      errorType: PRIVACY_INFORMATION_CODE,
      requestId: requestIdFrom(payload),
      retryable: false,
      retryCount: 0,
      projectTerminal: false,
      publicMessage: POLICY_MESSAGE
    };
  }

  const status = Number(httpStatus || 0);
  return {
    status: 'provider_error',
    errorType: code || 'provider_error',
    requestId: requestIdFrom(payload),
    retryable: status === 408 || status === 409 || status === 425 ||
      status === 429 || status >= 500,
    retryCount: 0,
    projectTerminal: false,
    publicMessage: '视频模型暂时无法完成本次生成，请稍后重试。'
  };
}

export function reduceTaskState(current = {}, signal = {}) {
  const next = { ...current };
  switch (signal.type) {
    case 'provider_generating':
      return {
        ...next,
        status: 'generating',
        progress: Math.max(Number(next.progress || 0), Number(signal.progress || 1))
      };
    case 'provider_succeeded':
      return { ...next, status: 'uploading_drive', progress: 90 };
    case 'drive_completed':
      return { ...next, status: 'completed', progress: 100 };
    case 'drive_failure':
      return {
        ...next,
        status: 'drive_sync_failed',
        retryable: true,
        projectTerminal: false
      };
    case 'provider_failure': {
      const failure = classifyArkFailure({
        code: signal.code,
        request_id: signal.requestId,
        message: signal.message
      }, signal.httpStatus);
      return {
        ...next,
        status: failure.status,
        progress: 0,
        retryable: failure.retryable,
        retryCount: failure.retryCount,
        projectTerminal: failure.projectTerminal,
        publicMessage: failure.publicMessage,
        provider_request_id: failure.requestId,
        provider_error_code: failure.errorType
      };
    }
    default:
      return next;
  }
}

export function reduceSegmentStates(segments = [], segmentId, signal) {
  return segments.map((segment) => (
    String(segment?.id) === String(segmentId)
      ? reduceTaskState(segment, signal)
      : segment
  ));
}
