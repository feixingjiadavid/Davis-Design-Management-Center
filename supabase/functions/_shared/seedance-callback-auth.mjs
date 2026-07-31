const encoder = new TextEncoder();

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(value, secret) {
  if (!secret) throw new Error('SECRET_REQUIRED');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(String(value))
  );
  return hex(new Uint8Array(signature));
}

function constantTimeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function callbackSignature(taskId, secret) {
  return await hmac(`seedance-callback:${String(taskId)}`, secret);
}

export async function verifyCallbackSignature(taskId, signature, secret) {
  if (!taskId || !signature || !secret) return false;
  const expected = await callbackSignature(taskId, secret);
  return constantTimeEqual(expected, signature);
}

export async function safetyIdentifier(userId, secret) {
  const digest = await hmac(`seedance-safety:${String(userId)}`, secret);
  return `davis_${digest.slice(0, 40)}`;
}
