export const ARK_CREATE_URL =
  "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";

async function readJsonSafe(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export function isRetryableArkStatus(status) {
  const code = Number(status || 0);
  return code === 408 || code === 409 || code === 425 || code === 429 || code >= 500;
}

export async function createArkTask(
  arkApiKey,
  payload,
  { fetchImpl = fetch, timeoutMs = 45_000 } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("ark-submit-timeout"), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(ARK_CREATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + arkApiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await readJsonSafe(response);
    if (!response.ok || !data?.id) {
      const error = new Error(
        "Ark create rejected: HTTP " + response.status + " " +
        JSON.stringify(data).slice(0, 800),
      );
      error.httpStatus = response.status;
      error.retryable = isRetryableArkStatus(response.status);
      error.payload = data;
      throw error;
    }
    return {
      data,
      providerTaskId: String(data.id),
      httpStatus: response.status,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error?.httpStatus) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(
      message.includes("ark-submit-timeout") || message.toLowerCase().includes("timed out")
        ? "无法连接 Ark API：ark-submit-timeout"
        : "无法连接 Ark API：" + message
    );
    wrapped.httpStatus = 0;
    wrapped.retryable = true;
    wrapped.cause = error;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}
