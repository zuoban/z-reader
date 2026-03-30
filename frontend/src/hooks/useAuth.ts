'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, auth } from '@/lib/api';

export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    if (!auth.isLoggedIn()) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    try {
      await api.verify();
      setIsAuthenticated(true);
    } catch {
      auth.removeToken();
      setIsAuthenticated(false);
    }
    setIsLoading(false);
  }

  async function login(password: string) {
    await api.login(password);
    setIsAuthenticated(true);
    router.push('/shelf');
  }

  async function logout() {
    await api.logout();
    setIsAuthenticated(false);
    router.push('/login');
  }

  return { isLoading, isAuthenticated, login, logout, checkAuth };
}