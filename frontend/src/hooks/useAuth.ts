'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, AUTH_EXPIRED_EVENT } from '@/lib/api';
import { clearCoverUrlCache } from '@/hooks/useCoverUrl';
import { ACCESS_GENERATION_KEY, getAccessGeneration } from '@/lib/library-access';

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
    const generation = getAccessGeneration();
    try {
      const res = await api.verify();
      if (generation !== getAccessGeneration()) return 'unauthenticated';
      setAuthStatus('authenticated');
      setPasswordRequired(res.password_required);
      return 'authenticated';
    } catch (error) {
      if (generation !== getAccessGeneration()) return 'unauthenticated';
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

    function handleStorage(event: StorageEvent) {
      if (event.key === ACCESS_GENERATION_KEY && event.oldValue !== event.newValue) {
        handleAuthExpired();
      }
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
      window.removeEventListener('storage', handleStorage);
    };
  }, [router, redirectOnExpire]);

  async function login(password: string) {
    await api.login(password);
    clearCoverUrlCache();
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
