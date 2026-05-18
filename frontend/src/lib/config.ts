const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim() || '';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function deriveLanApiBase(): string | null {
  if (typeof window === 'undefined') return null;

  const { protocol, hostname } = window.location;
  if (protocol !== 'http:') return null;
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return null;

  return `${protocol}//${hostname}:8080`;
}

export const API_BASE = configuredApiBase ? trimTrailingSlash(configuredApiBase) : '';

export function getApiBaseCandidates(): string[] {
  if (API_BASE) return [API_BASE];

  const bases = [''];
  const lanApiBase = deriveLanApiBase();
  if (lanApiBase) {
    bases.push(trimTrailingSlash(lanApiBase));
  }

  return bases;
}

export const DEFAULT_TIMEOUT = 30000;

function createTimeoutReason(timeout: number): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(`请求在 ${timeout}ms 后超时`, 'TimeoutError');
  }

  const error = new Error(`请求在 ${timeout}ms 后超时`);
  error.name = 'TimeoutError';
  return error;
}

export function createAbortController(timeout: number = DEFAULT_TIMEOUT): {
  controller: AbortController;
  timeoutId: NodeJS.Timeout;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(createTimeoutReason(timeout));
    }
  }, timeout);
  return { controller, timeoutId };
}

export function isAbortLikeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

export function normalizeRequestError(
  error: unknown,
  timeoutMessage = '请求超时，请稍后重试'
): Error {
  if (error instanceof Error) {
    if (isAbortLikeError(error)) {
      return new Error(timeoutMessage);
    }
    return error;
  }

  return new Error('未知错误');
}
