const REAL_PERSON_PRIVACY_CODE =
  'InputImageSensitiveContentDetected.PrivacyInformation';

export function isRetryableArkStatus(status) {
  const code = Number(status || 0);
  return code === 408 || code === 409 || code === 425 || code === 429 || code >= 500;
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

  if (providerCode === REAL_PERSON_PRIVACY_CODE ||
      /may contain real person|PrivacyInformation/i.test(providerMessage)) {
    const target = referenceNumber
      ? `第 ${referenceNumber} 张参考图`
      : '参考图';
    return {
      code: 'ARK_REAL_PERSON_AUTH_REQUIRED',
      httpStatus,
      retryable: false,
      referenceNumber,
      providerCode,
      message:
        `${target}被 Seedance 2.0 检测为可能包含真人肖像，普通图片链接无法直接用于真人视频生成。` +
        '请先在火山方舟“可信素材库 → 真人人像”完成本人授权，并使用授权后的 Asset ID；' +
        '如果不需要保留该人物，请移除真人参考图后重新提交。',
    };
  }

  return {
    code: providerCode,
    httpStatus,
    retryable: isRetryableArkStatus(httpStatus),
    referenceNumber,
    providerCode,
    message: providerMessage || `Ark 创建任务失败（HTTP ${httpStatus || 'unknown'}）`,
  };
}
