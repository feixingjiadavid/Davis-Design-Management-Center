export const DRIVE_MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 5 * 60 * 1000;
const MAX_DELAY_MS = 60 * 60 * 1000;

export function classifyDriveFailure(message, attempts, nowMs = Date.now()) {
  const text = String(message || "");
  const count = Math.max(1, Number(attempts || 1));

  if (/invalid_grant|expired or revoked/i.test(text)) {
    return {
      terminal: true,
      code: "GOOGLE_OAUTH_REAUTH_REQUIRED",
      publicStatus: "drive_failed",
      nextRetryAt: null,
    };
  }

  if (/GOOGLE_OAUTH_SECRETS_MISSING|GOOGLE_DRIVE_FOLDER_ID_MISSING/i.test(text)) {
    return {
      terminal: true,
      code: "GOOGLE_DRIVE_CONFIGURATION_REQUIRED",
      publicStatus: "drive_failed",
      nextRetryAt: null,
    };
  }

  if (count >= DRIVE_MAX_ATTEMPTS) {
    return {
      terminal: true,
      code: "GOOGLE_DRIVE_RETRY_LIMIT_REACHED",
      publicStatus: "drive_failed",
      nextRetryAt: null,
    };
  }

  const retryable = /HTTP\s+(408|409|425|429|5\d\d)\b|timed?\s*out|network|fetch/i.test(text);
  if (!retryable) {
    return {
      terminal: true,
      code: "GOOGLE_DRIVE_NON_RETRYABLE_FAILURE",
      publicStatus: "drive_failed",
      nextRetryAt: null,
    };
  }

  const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (2 ** Math.max(0, count - 1)));
  return {
    terminal: false,
    code: "GOOGLE_DRIVE_TRANSIENT_FAILURE",
    publicStatus: "uploading_drive",
    nextRetryAt: new Date(nowMs + delay).toISOString(),
  };
}
