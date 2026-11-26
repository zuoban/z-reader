import { render } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorSuppressor } from '@/components/ErrorSuppressor';
import { reportClientError } from '@/lib/error-reporting';

vi.mock('@/lib/error-reporting', () => ({
  reportClientError: vi.fn(),
}));

describe('ErrorSuppressor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suppresses benign ResizeObserver loop and foliate document errors without reporting', () => {
    const originalOnError = vi.fn(() => false);
    window.onerror = originalOnError;

    const { unmount } = render(<ErrorSuppressor />);

    expect(
      window.onerror?.(
        'ResizeObserver loop completed with undelivered notifications.',
        'http://localhost:3000/read/1',
        0,
        0,
        undefined
      )
    ).toBe(true);
    expect(
      window.onerror?.(
        'ResizeObserver loop limit exceeded',
        'http://localhost:3000/shelf',
        0,
        0,
        undefined
      )
    ).toBe(true);
    expect(
      window.onerror?.(
        "Cannot read properties of null (reading 'documentElement')",
        'foliate.js',
        1,
        1,
        undefined
      )
    ).toBe(true);
    expect(
      window.onerror?.(
        'TypeError: this.document is null',
        'foliate.js',
        1,
        1,
        new Error('this.document is null')
      )
    ).toBe(true);

    expect(reportClientError).not.toHaveBeenCalled();
    expect(originalOnError).not.toHaveBeenCalled();

    const genuineError = new Error('Unexpected failure');
    window.onerror?.('Unexpected failure', 'app.js', 10, 5, genuineError);
    expect(reportClientError).toHaveBeenCalledWith(genuineError, 'window.onerror');
    expect(originalOnError).toHaveBeenCalledOnce();

    unmount();
    expect(window.onerror).toBe(originalOnError);
  });

  it('reports unhandled rejections except suppressed error patterns', () => {
    const { unmount } = render(<ErrorSuppressor />);

    const ignoredEvent = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(ignoredEvent, 'reason', {
      value: new Error('ResizeObserver loop completed with undelivered notifications.'),
    });
    window.dispatchEvent(ignoredEvent);
    expect(ignoredEvent.defaultPrevented).toBe(true);
    expect(reportClientError).not.toHaveBeenCalled();

    const genuineReason = new Error('Network timeout');
    const genuineEvent = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(genuineEvent, 'reason', { value: genuineReason });
    window.dispatchEvent(genuineEvent);
    expect(reportClientError).toHaveBeenCalledWith(genuineReason, 'unhandledrejection');

    unmount();
  });
});
