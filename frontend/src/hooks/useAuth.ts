'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, AUTH_EXPIRED_EVENT } from '@/lib/api';
import { clearCoverUrlCache } from '@/hooks/useCoverUrl';

export function useAuth(options: { redirectOnExpire?: boolean } = {}) {
  const { redirectOnExpire = true } = options;
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.verify();
      setIsAuthenticated(true);
      setPasswordRequired(res.password_required);
    } catch {
      clearCoverUrlCache();
      setIsAuthenticated(false);
    }
    setIsLoading(false);
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
      setIsAuthenticated(false);
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
    setIsAuthenticated(false);
    router.replace('/login');
  }

  return { isLoading, isAuthenticated, passwordRequired, login, logout, checkAuth };
}
