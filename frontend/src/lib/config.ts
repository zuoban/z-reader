export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export const DEFAULT_TIMEOUT = 30000;

function createTimeoutReason(timeout: number): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(`Request timed out after ${timeout}ms`, 'TimeoutError');
  }

  const error = new Error(`Request timed out after ${timeout}ms`);
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

  return new Error('Unknown error');
}
