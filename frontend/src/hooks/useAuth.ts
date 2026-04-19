'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, auth } from '@/lib/api';
import type { User } from '@/lib/api';

export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(() => auth.getCurrentUser());

  const checkAuth = useCallback(async () => {
    if (!auth.isLoggedIn()) {
      setIsAuthenticated(false);
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.verify();
      setIsAuthenticated(true);
      setUser(res.user ?? auth.getCurrentUser());
    } catch {
      auth.removeToken();
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

  async function login(username: string, password: string) {
    const res = await api.login(username, password);
    setUser(res.user);
    setIsAuthenticated(true);
    router.push('/shelf');
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setIsAuthenticated(false);
    router.push('/login');
  }

  return { isLoading, isAuthenticated, user, login, logout, checkAuth };
}
