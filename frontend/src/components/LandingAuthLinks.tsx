'use client';

import Link from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

const LandingAuthContext = createContext(false);

export function LandingAuthProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth({ redirectOnExpire: false });
  return (
    <LandingAuthContext.Provider value={!isLoading && isAuthenticated}>
      {children}
    </LandingAuthContext.Provider>
  );
}

export function LandingAuthLink({ primary = false }: { primary?: boolean }) {
  const authenticated = useContext(LandingAuthContext);
  return primary ? (
    <Link
      href={authenticated ? '/shelf' : '/login?mode=register'}
      className="app-primary-link"
    >
      {authenticated ? '回到我的书架' : '创建我的书库'}
    </Link>
  ) : (
    <Link
      href="/login"
      className="inline-flex min-h-11 items-center rounded-xl border border-transparent px-3.5 text-sm font-semibold text-foreground/80 transition-all hover:border-border/60 hover:bg-card/70 hover:text-foreground"
    >
      {authenticated ? '进入书架' : '登录'}
    </Link>
  );
}
