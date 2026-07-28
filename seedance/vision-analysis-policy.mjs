export class VisionAnalysisError extends Error {
  constructor(failures) {
    const detail = failures.map(item => `${item.name}：${item.reason}`).join('；');
    super(`图片视觉理解未全部完成：${detail}`);
    this.name = 'VisionAnalysisError';
    this.failures = failures;
  }
}

export async function analyzeAllImages(images, analyzeOne, options = {}) {
  const list = Array.isArray(images) ? images : [];
  if (typeof analyzeOne !== 'function') throw new TypeError('analyzeOne must be a function');
  if (!list.length) return [];

  const concurrency = Math.max(1, Math.min(list.length, Number(options.concurrency) || 3));
  const attempts = Math.max(1, Number(options.attempts) || 3);
  const retryDelay = typeof options.retryDelay === 'function' ? options.retryDelay : (() => 0);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : (() => {});
  const results = new Array(list.length);
  const failures = [];
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      const image = list[index];
      let lastError = null;
      let usedAttempts = 0;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        usedAttempts = attempt;
        try {
          results[index] = await analyzeOne(image, index, attempt);
          lastError = null;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error || '未知错误'));
          if (attempt < attempts) {
            const delay = Math.max(0, Number(await retryDelay({ image, index, attempt, error: lastError })) || 0);
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      completed += 1;
      if (lastError) {
        failures.push({
          index,
          name: String(image?.label || image?.name || `图片${index + 1}`),
          reason: lastError.message || '视觉理解失败',
          attempts: usedAttempts,
        });
      }
      await onProgress({
        completed,
        total: list.length,
        index,
        image,
        ok: !lastError,
        attempts: usedAttempts,
        error: lastError,
      });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (failures.length) {
    failures.sort((a, b) => a.index - b.index);
    throw new VisionAnalysisError(failures);
  }
  return results;
}
