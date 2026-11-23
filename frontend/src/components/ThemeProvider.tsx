'use client';

import { useEffect, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { useShelfTheme } from '@/hooks/useShelfTheme';
import {
  mantineCssVariablesResolver,
  mantineTheme,
} from '@/lib/mantine-theme';
import {
  applyThemeColor,
  themeColorForAppMode,
} from '@/lib/theme-color';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isDark, preset } = useShelfTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.dataset.readerPreset = preset;
    root.style.colorScheme = isDark ? 'dark' : 'light';

    // Shelf / login: follow app chrome (not full reader sepia/green surfaces).
    // Reader page overrides this while active.
    if (!root.dataset.readerActivePreset) {
      applyThemeColor(themeColorForAppMode(isDark));
    }
  }, [isDark, preset]);

  return (
    <MantineProvider
      theme={mantineTheme}
      cssVariablesResolver={mantineCssVariablesResolver}
      forceColorScheme={isDark ? 'dark' : 'light'}
    >
      {children}
    </MantineProvider>
  );
}
