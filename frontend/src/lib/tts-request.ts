export type TTSErrorKind = 'cancelled' | 'timeout' | 'network' | 'rate-limit' |
  'invalid-ssml' | 'unauthorized' | 'permission' | 'transient' | 'permanent';

export class TTSRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly retryAfterMs = 0,
  ) {
    super(status === 429 ? '语音服务繁忙，请稍后重试' : `语音请求失败（${status}）`);
    this.name = 'TTSRequestError';
  }
}

export function classifyTTSError(error: unknown): TTSErrorKind {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'AbortError') return 'cancelled';
  if (name === 'TimeoutError') return 'timeout';
  if (name === 'NotAllowedError') return 'permission';
  if (error instanceof TTSRequestError) {
    if (error.status === 401 || error.status === 403) return 'unauthorized';
    if (error.code === 'invalid_ssml' && [400, 422].includes(error.status)) return 'invalid-ssml';
    if (error.status === 429) return 'rate-limit';
    if (error.status === 408 || error.status === 504) return 'timeout';
    if ([500, 502, 503].includes(error.status)) return 'transient';
    return 'permanent';
  }
  if (name === 'TypeError') return 'network';
  return 'permanent';
}

export function parseTTSRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  // Reject signed numeric strings, which Date.parse can interpret as calendar dates.
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return 0;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

function cancelled(): Error {
  return Object.assign(new Error('朗读操作已取消'), { name: 'AbortError' });
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return; }
    const abort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function retryTTSRequest<T>(
  request: () => Promise<T>,
  options: {
    signal: AbortSignal;
    onRetry?: (attempt: number, delayMs: number, kind: TTSErrorKind) => void;
  },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (options.signal.aborted) throw cancelled();
    try {
      const result = await request();
      if (options.signal.aborted) throw cancelled();
      return result;
    } catch (error) {
      if (options.signal.aborted) throw cancelled();
      const kind = classifyTTSError(error);
      const retryable = ['timeout', 'network', 'rate-limit', 'transient'].includes(kind);
      const delay = Math.max(500 * 2 ** attempt,
        error instanceof TTSRequestError ? error.retryAfterMs : 0);
      // Do not retry earlier than a provider's long Retry-After instruction.
      if (!retryable || attempt >= 2 || delay > 60_000) throw error;
      options.onRetry?.(attempt + 1, delay, kind);
      await waitForRetry(delay, options.signal);
    }
  }
}
