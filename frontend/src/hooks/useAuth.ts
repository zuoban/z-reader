'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, AUTH_EXPIRED_EVENT } from '@/lib/api';
import { clearCoverUrlCache } from '@/hooks/useCoverUrl';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'offline';

export function useAuth(options: { redirectOnExpire?: boolean } = {}) {
  const { redirectOnExpire = true } = options;
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [passwordRequired, setPasswordRequired] = useState(true);

  const isLoading = authStatus === 'loading';
  const isAuthenticated = authStatus === 'authenticated';
  const isOffline = authStatus === 'offline';

  const checkAuth = useCallback(async (): Promise<AuthStatus> => {
    try {
      const res = await api.verify();
      setAuthStatus('authenticated');
      setPasswordRequired(res.password_required);
      return 'authenticated';
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearCoverUrlCache();
        setAuthStatus('unauthenticated');
        return 'unauthenticated';
      } else {
        setAuthStatus('offline');
        return 'offline';
      }
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void checkAuth();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [checkAuth]);

  useEffect(() => {
    function handleAuthExpired() {
      clearCoverUrlCache();
      setAuthStatus('unauthenticated');
      if (redirectOnExpire) {
        router.push('/login');
      }
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [router, redirectOnExpire]);

  async function login(password: string) {
    await api.login(password);
    router.replace('/shelf');
  }

  async function logout() {
    await api.logout();
    clearCoverUrlCache();
    setAuthStatus('unauthenticated');
    router.replace('/login');
  }

  return {
    isLoading,
    isAuthenticated,
    isOffline,
    authStatus,
    passwordRequired,
    login,
    logout,
    checkAuth,
  };
}
