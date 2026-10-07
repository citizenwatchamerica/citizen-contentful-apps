import { describe, expect, it, vi } from 'vitest';
import { isTransientError, isVersionConflict, runPool, withRetry } from './retry';

describe('error classification', () => {
  it('recognises Contentful version conflicts from the bridged JSON error body', () => {
    expect(isVersionConflict({ message: JSON.stringify({ status: 409, message: 'VersionMismatch' }) })).toBe(true);
    expect(isVersionConflict(new Error('Validation error'))).toBe(false);
  });

  it('treats rate limits and server errors as transient, validation errors as permanent', () => {
    expect(isTransientError({ message: JSON.stringify({ status: 429 }) })).toBe(true);
    expect(isTransientError(new Error('OpenAI request failed (503): overloaded'))).toBe(true);
    expect(isTransientError({ message: JSON.stringify({ status: 422 }) })).toBe(false);
    expect(isTransientError(new Error('OpenAI API key is not configured'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('retries transient failures then succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('OpenAI request failed (429): slow down'))
      .mockResolvedValue('ok');
    await expect(withRetry(operation, { baseDelayMilliseconds: 1 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent failures', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('bad input'));
    await expect(withRetry(operation, { baseDelayMilliseconds: 1 })).rejects.toThrow('bad input');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('runPool', () => {
  it('never runs more than the concurrency limit at once and processes every item', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const processed: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async item => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 2));
      processed.push(item);
      inFlight--;
    });
    expect(maxInFlight).toBe(3);
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('stops starting new items once a stop is requested', async () => {
    const processed: number[] = [];
    let stop = false;
    await runPool(
      [1, 2, 3, 4, 5],
      1,
      async item => {
        processed.push(item);
        if (item === 2) stop = true;
      },
      () => stop
    );
    expect(processed).toEqual([1, 2]);
  });
});
