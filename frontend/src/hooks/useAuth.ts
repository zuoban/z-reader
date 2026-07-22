'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, auth, AUTH_EXPIRED_EVENT } from '@/lib/api';
import { clearCoverUrlCache } from '@/hooks/useCoverUrl';
import { clearOfflineBooks } from '@/lib/offline-books';
import type { User } from '@/lib/api';

export function useAuth(options: { redirectOnExpire?: boolean } = {}) {
  const { redirectOnExpire = true } = options;
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(() => auth.getCurrentUser());

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.verify();
      setIsAuthenticated(true);
      setUser(res.user ?? auth.getCurrentUser());
    } catch {
      const expiredUserID = auth.getCurrentUser()?.id;
      auth.removeToken();
      clearCoverUrlCache();
      void clearOfflineBooks(expiredUserID);
      setIsAuthenticated(false);
      setUser(null);
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
      const expiredUserID = auth.getCurrentUser()?.id;
      clearCoverUrlCache();
      void clearOfflineBooks(expiredUserID);
      setIsAuthenticated(false);
      setUser(null);
      if (redirectOnExpire) {
        router.push('/login');
      }
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [router, redirectOnExpire]);

  async function login(username: string, password: string) {
    const res = await api.login(username, password);
    setUser(res.user);
    setIsAuthenticated(true);
    router.push('/shelf');
  }

  async function register(username: string, password: string) {
    const res = await api.register(username, password);
    setUser(res.user);
    setIsAuthenticated(true);
    router.push('/shelf');
  }

  async function logout() {
    const currentUserID = user?.id;
    await api.logout();
    clearCoverUrlCache();
    void clearOfflineBooks(currentUserID);
    setUser(null);
    setIsAuthenticated(false);
    router.push('/login');
  }

  return { isLoading, isAuthenticated, user, login, register, logout, checkAuth };
}
