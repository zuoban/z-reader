'use client';

import { useEffect, type ReactNode } from 'react';
import { useShelfTheme } from '@/hooks/useShelfTheme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isDark, preset } = useShelfTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.readerPreset = preset;
  }, [isDark, preset]);

  return <>{children}</>;
}
