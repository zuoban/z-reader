import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearAuthCache, useAuth } from '@/hooks/useAuth';
import { ApiError, AUTH_EXPIRED_EVENT, api } from '@/lib/api';
import { clearCoverUrlCache } from '@/hooks/useCoverUrl';

const routerPush = vi.fn();
const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
  }),
}));

vi.mock('@/hooks/useCoverUrl', () => ({
  clearCoverUrlCache: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      verify: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
  };
});

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function flushAuthCheck() {
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
  }

  it.each([true, false])(
    'authenticates on verify with password_required=%s',
    async (passwordRequired) => {
      vi.mocked(api.verify).mockResolvedValue({
        valid: true,
        password_required: passwordRequired,
      });

      const { result } = renderHook(() => useAuth());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.authStatus).toBe('loading');

      await flushAuthCheck();

      expect(api.verify).toHaveBeenCalledTimes(1);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isOffline).toBe(false);
      expect(result.current.authStatus).toBe('authenticated');
      expect(result.current.passwordRequired).toBe(passwordRequired);
      expect(clearCoverUrlCache).not.toHaveBeenCalled();
    },
  );

  it('clears cover cache and marks unauthenticated on HTTP 401', async () => {
    vi.mocked(api.verify).mockRejectedValue(new ApiError('Unauthorized', 401));

    const { result } = renderHook(() => useAuth());
    await flushAuthCheck();

    expect(clearCoverUrlCache).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isOffline).toBe(false);
    expect(result.current.authStatus).toBe('unauthenticated');
  });

  it('marks offline without clearing cover cache on network errors', async () => {
    vi.mocked(api.verify).mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useAuth());
    await flushAuthCheck();

    expect(clearCoverUrlCache).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isOffline).toBe(true);
    expect(result.current.authStatus).toBe('offline');
  });

  it('marks offline without clearing cover cache on non-401 API errors', async () => {
    vi.mocked(api.verify).mockRejectedValue(new ApiError('Service Unavailable', 503));

    const { result } = renderHook(() => useAuth());
    await flushAuthCheck();

    expect(clearCoverUrlCache).not.toHaveBeenCalled();
    expect(result.current.isOffline).toBe(true);
    expect(result.current.authStatus).toBe('offline');
  });

  it('handles AUTH_EXPIRED_EVENT and redirects to /login when redirectOnExpire is true', async () => {
    vi.mocked(api.verify).mockResolvedValue({
      valid: true,
      password_required: true,
    });

    const { result } = renderHook(() => useAuth({ redirectOnExpire: true }));
    await flushAuthCheck();
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    });

    expect(clearCoverUrlCache).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.authStatus).toBe('unauthenticated');
    expect(routerPush).toHaveBeenCalledWith('/login');
  });

  it('handles AUTH_EXPIRED_EVENT without redirecting when redirectOnExpire is false', async () => {
    vi.mocked(api.verify).mockResolvedValue({
      valid: true,
      password_required: true,
    });

    const { result } = renderHook(() => useAuth({ redirectOnExpire: false }));
    await flushAuthCheck();
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    });

    expect(clearCoverUrlCache).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.authStatus).toBe('unauthenticated');
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('logs in and replaces route with /shelf', async () => {
    vi.mocked(api.verify).mockRejectedValue(new ApiError('Unauthorized', 401));
    vi.mocked(api.login).mockResolvedValue({
      valid: true,
      password_required: true,
    });

    const { result } = renderHook(() => useAuth());
    await flushAuthCheck();

    await act(async () => {
      await result.current.login('secret-pass');
    });

    expect(api.login).toHaveBeenCalledWith('secret-pass');
    expect(routerReplace).toHaveBeenCalledWith('/shelf');
  });

  it('logs out, clears cover cache, updates status, and replaces route with /login', async () => {
    vi.mocked(api.verify).mockResolvedValue({
      valid: true,
      password_required: true,
    });
    vi.mocked(api.logout).mockResolvedValue();

    const { result } = renderHook(() => useAuth());
    await flushAuthCheck();
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(clearCoverUrlCache).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.authStatus).toBe('unauthenticated');
    expect(routerReplace).toHaveBeenCalledWith('/login');
  });

  it('recovers from offline state when checkAuth succeeds later', async () => {
    vi.mocked(api.verify)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({
        valid: true,
        password_required: false,
      });

    const { result } = renderHook(() => useAuth());
    await flushAuthCheck();

    expect(result.current.isOffline).toBe(true);
    expect(result.current.authStatus).toBe('offline');

    let status: string | undefined;
    await act(async () => {
      status = await result.current.checkAuth();
    });

    expect(status).toBe('authenticated');
    expect(result.current.isOffline).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.authStatus).toBe('authenticated');
    expect(result.current.passwordRequired).toBe(false);
  });

  it('cancels pending initial verify timer on unmount', () => {
    vi.mocked(api.verify).mockResolvedValue({
      valid: true,
      password_required: true,
    });

    const { unmount } = renderHook(() => useAuth());
    unmount();

    vi.runAllTimers();
    expect(api.verify).not.toHaveBeenCalled();
  });

  it('reuses recent verified auth state on remount while revalidating in background', async () => {
    vi.mocked(api.verify).mockResolvedValue({
      valid: true,
      password_required: false,
    });

    const first = renderHook(() => useAuth());
    await flushAuthCheck();
    first.unmount();

    const second = renderHook(() => useAuth());
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.isAuthenticated).toBe(true);
    expect(second.result.current.passwordRequired).toBe(false);

    await flushAuthCheck();
    expect(api.verify).toHaveBeenCalledTimes(2);
  });
});
