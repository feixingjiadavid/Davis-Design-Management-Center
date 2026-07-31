const REAL_PERSON_PRIVACY_CODE =
  'InputImageSensitiveContentDetected.PrivacyInformation';

export function isRetryableArkStatus(status) {
  const code = Number(status || 0);
  return code === 408 || code === 409 || code === 425 || code === 429 || code >= 500;
}

function providerRequestId(providerError, payload, message) {
  const direct = providerError?.request_id || providerError?.requestId ||
    payload?.request_id || payload?.requestId || "";
  if (direct) return String(direct);
  const match = String(message || "").match(/request\s*id\s*[:：]\s*([a-zA-Z0-9._-]+)/i);
  return match ? match[1] : null;
}

function contentReferenceNumber(param) {
  const match = String(param || '').match(/content\[(\d+)\]/);
  if (!match) return null;
  const contentIndex = Number(match[1]);
  return Number.isFinite(contentIndex) && contentIndex >= 1 ? contentIndex : null;
}

export function normalizeArkCreateFailure(payload, status) {
  const httpStatus = Number(status || 0);
  const providerError = payload?.error && typeof payload.error === 'object'
    ? payload.error
    : {};
  const providerCode = String(providerError.code || payload?.code || 'ARK_CREATE_REJECTED');
  const providerMessage = String(
    providerError.message || payload?.message || payload?.detail ||
    JSON.stringify(payload || {}),
  );
  const param = String(providerError.param || payload?.param || '');
  const referenceNumber = contentReferenceNumber(param) ??
    contentReferenceNumber(providerMessage);
  const requestId = providerRequestId(providerError, payload, providerMessage);

  if (providerCode === REAL_PERSON_PRIVACY_CODE ||
      /may contain real person|PrivacyInformation/i.test(providerMessage)) {
    const target = referenceNumber
      ? `第 ${referenceNumber} 张参考图`
      : '参考图';
    return {
      code: 'PROVIDER_POLICY_BLOCKED',
      httpStatus,
      retryable: false,
      referenceNumber,
      providerCode,
      requestId,
      message:
        `当前视频模型对${target}进行了安全限制。素材和项目已保存，你可以更换参考图片后重新生成。`,
    };
  }

  return {
    code: providerCode,
    httpStatus,
    retryable: isRetryableArkStatus(httpStatus),
    referenceNumber,
    providerCode,
    requestId,
    message: providerMessage || `Ark 创建任务失败（HTTP ${httpStatus || 'unknown'}）`,
  };
}
