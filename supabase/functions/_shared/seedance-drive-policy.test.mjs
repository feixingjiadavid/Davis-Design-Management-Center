import assert from "node:assert/strict";
import { classifyDriveFailure } from "./seedance-drive-policy.mjs";

{
  const result = classifyDriveFailure(
    'GOOGLE_ACCESS_TOKEN_FAILED: HTTP 400 {"error":"invalid_grant","error_description":"Token has been expired or revoked."}',
    428,
    Date.parse("2026-07-30T00:00:00.000Z"),
  );
  assert.equal(result.terminal, true);
  assert.equal(result.code, "GOOGLE_OAUTH_REAUTH_REQUIRED");
  assert.equal(result.nextRetryAt, null);
  assert.equal(result.publicStatus, "drive_failed");
}

{
  const result = classifyDriveFailure(
    "GOOGLE_DRIVE_UPLOAD_FAILED: HTTP 503 backendError",
    2,
    Date.parse("2026-07-30T00:00:00.000Z"),
  );
  assert.equal(result.terminal, false);
  assert.equal(result.code, "GOOGLE_DRIVE_TRANSIENT_FAILURE");
  assert.ok(result.nextRetryAt);
}

{
  const result = classifyDriveFailure(
    "GOOGLE_DRIVE_UPLOAD_FAILED: HTTP 503 backendError",
    5,
    Date.parse("2026-07-30T00:00:00.000Z"),
  );
  assert.equal(result.terminal, true);
  assert.equal(result.code, "GOOGLE_DRIVE_RETRY_LIMIT_REACHED");
  assert.equal(result.nextRetryAt, null);
}

console.log("seedance drive policy tests passed");
