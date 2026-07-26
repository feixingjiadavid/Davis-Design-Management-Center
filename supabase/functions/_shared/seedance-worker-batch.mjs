export async function mapWithConcurrency(items, concurrency, worker) {
  const input = Array.from(items || []);
  const results = new Array(input.length);
  const width = Math.max(1, Math.min(input.length || 1, Number(concurrency) || 1));
  let cursor = 0;

  async function runLane() {
    while (cursor < input.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(input[index], index);
    }
  }

  await Promise.all(Array.from({ length: width }, () => runLane()));
  return results;
}
