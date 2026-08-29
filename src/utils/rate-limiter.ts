/**
 * Promisified execution pause.
 * @param ms - Duration to sleep in milliseconds
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

/**
 * Retries an asynchronous operation with exponential backoff and randomized jitter.
 * Handles rate limits (429) and transient network failures gracefully.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const backoffFactor = options.backoffFactor ?? 2;

  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;

      // Determine if error is a rate limit or standard failure
      const isRateLimit =
        error?.status === 429 ||
        error?.response?.status === 429 ||
        String(error?.message).includes("429");

      if (attempt >= maxRetries) {
        console.error(
          `❌ Max retries (${maxRetries}) reached. Failing operation.`,
        );
        throw error;
      }

      // Add random jitter (+/- 200ms) to avoid simultaneous retry bursts
      const jitter = Math.floor(Math.random() * 200);
      const delay =
        initialDelayMs * Math.pow(backoffFactor, attempt - 1) + jitter;

      console.warn(
        `⚠️ ${isRateLimit ? "Rate limit hit (429)" : "API call failed"}. Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delay)}ms...`,
      );

      await sleep(delay);
    }
  }

  throw new Error("Unexpected end of retry loop.");
}

/**
 * Simple queue process to enforce rate limits across array processing
 */
export async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  delayBetweenBatchesMs: number,
  taskFn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(
      `⏳ Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(items.length / batchSize)}...`,
    );

    const batchResults = await Promise.allSettled(
      batch.map((item) => taskFn(item)),
    );

    for (const res of batchResults) {
      if (res.status === "fulfilled") {
        results.push(res.value);
      } else {
        console.error(
          `❌ Item processing failed:`,
          res.reason?.message || res.reason,
        );
      }
    }

    // Pause between batches to respect free tier per-minute quotas
    if (i + batchSize < items.length) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return results;
}
