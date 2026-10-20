import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyTTSError, parseTTSRetryAfter, retryTTSRequest, TTSRequestError,
} from '@/lib/tts-request';

afterEach(() => vi.useRealTimers());

describe('speech request recovery policy', () => {
  it('distinguishes timeout, cancellation, permission, and invalid input', () => {
    expect(classifyTTSError({ name: 'AbortError' })).toBe('cancelled');
    expect(classifyTTSError({ name: 'TimeoutError' })).toBe('timeout');
    expect(classifyTTSError({ name: 'NotAllowedError' })).toBe('permission');
    expect(classifyTTSError(new TTSRequestError(400, 'invalid_ssml'))).toBe('invalid-ssml');
    expect(classifyTTSError(new TTSRequestError(400))).toBe('permanent');
    expect(classifyTTSError(new TTSRequestError(401))).toBe('unauthorized');
  });

  it('parses Retry-After seconds and dates without accepting invalid values', () => {
    expect(parseTTSRetryAfter('30')).toBe(30_000);
    expect(parseTTSRetryAfter('Tue, 20 Oct 2026 14:00:10 GMT',
      Date.parse('2026-10-20T14:00:00Z'))).toBe(10_000);
    expect(parseTTSRetryAfter('-1')).toBe(0);
    expect(parseTTSRetryAfter('nonsense')).toBe(0);
    expect(parseTTSRetryAfter(null)).toBe(0);
  });

  it('waits for Retry-After before recovering the same request', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const onRetry = vi.fn();
    const result = retryTTSRequest(async () => {
      if (++attempts === 1) throw new TTSRequestError(429, 'busy', 3000);
      return 'audio';
    }, { signal: new AbortController().signal, onRetry });
    await vi.advanceTimersByTimeAsync(2999);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('audio');
    expect(onRetry).toHaveBeenCalledWith(1, 3000, 'rate-limit');
  });

  it('retries a timeout with bounded backoff and propagates exhausted errors', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    const result = retryTTSRequest(async () => { attempts++; throw timeout; }, {
      signal: new AbortController().signal,
    });
    const rejected = expect(result).rejects.toBe(timeout);
    await vi.runAllTimersAsync();
    await rejected;
    expect(attempts).toBe(3);
  });

  it('cancels backoff immediately without making another request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let attempts = 0;
    const result = retryTTSRequest(async () => {
      attempts++;
      throw new TTSRequestError(503);
    }, { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    await vi.runAllTimersAsync();
    expect(attempts).toBe(1);
  });

  it.each([400, 401, 403, 404, 413, 422])('does not retry permanent HTTP %i', async status => {
    let attempts = 0;
    const error = new TTSRequestError(status);
    await expect(retryTTSRequest(async () => { attempts++; throw error; }, {
      signal: new AbortController().signal,
    })).rejects.toBe(error);
    expect(attempts).toBe(1);
  });

  it('surfaces a long rate-limit delay instead of retrying before the allowed time', async () => {
    let attempts = 0;
    const error = new TTSRequestError(429, 'busy', 120_000);
    await expect(retryTTSRequest(async () => { attempts++; throw error; }, {
      signal: new AbortController().signal,
    })).rejects.toBe(error);
    expect(attempts).toBe(1);
  });
});
