// sdk.cma errors cross the iframe postMessage bridge, so they may be plain objects whose
// `message` is Contentful's JSON error body - the status code has to be fished out of it.
const extractStatus = (error: unknown): number | null => {
  const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  if (typeof candidate?.status === 'number') return candidate.status;
  if (typeof candidate?.statusCode === 'number') return candidate.statusCode;

  const message = typeof candidate?.message === 'string' ? candidate.message : String(error ?? '');
  const jsonStatus = message.match(/"status"\s*:\s*(\d{3})/);
  if (jsonStatus) return Number(jsonStatus[1]);
  // OpenAI failures are re-thrown by the Function as "OpenAI request failed (429): ..."
  const parenthesizedStatus = message.match(/\((\d{3})\)/);
  if (parenthesizedStatus) return Number(parenthesizedStatus[1]);
  return null;
};

export const isVersionConflict = (error: unknown): boolean => {
  if (extractStatus(error) === 409) return true;
  const message = (error as { message?: unknown })?.message;
  return typeof message === 'string' && message.includes('VersionMismatch');
};

export const isTransientError = (error: unknown): boolean => {
  const status = extractStatus(error);
  if (status === 429 || (status !== null && status >= 500)) return true;
  const message = String((error as { message?: unknown })?.message ?? error ?? '');
  return /rate limit|timed? ?out|network|fetch failed/i.test(message);
};

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

export interface RetryOptions {
  attempts?: number;
  baseDelayMilliseconds?: number;
}

// Retries rate limits, server errors and network blips with exponential backoff plus jitter.
// Anything else (validation errors, missing API key) fails immediately.
export const withRetry = async <T>(
  operation: () => Promise<T>,
  { attempts = 4, baseDelayMilliseconds = 1000 }: RetryOptions = {}
): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientError(error)) throw error;
      const delay = baseDelayMilliseconds * 2 ** (attempt - 1) * (1 + Math.random() * 0.25);
      await wait(delay);
    }
  }
};

// Runs `worker` over every item with at most `concurrency` in flight. `shouldStop` is checked
// before each new item starts, so a stop request lets in-flight items finish cleanly.
export const runPool = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false
): Promise<void> => {
  let nextIndex = 0;
  const lane = async () => {
    while (nextIndex < items.length && !shouldStop()) {
      const index = nextIndex++;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
};
