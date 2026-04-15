'use client';

import { useEffect, type ReactNode } from 'react';
import { useShelfTheme } from '@/hooks/useShelfTheme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isDark } = useShelfTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return <>{children}</>;
}
