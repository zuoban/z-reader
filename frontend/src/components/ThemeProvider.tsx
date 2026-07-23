'use client';

import { useEffect, type ReactNode } from 'react';
import { useShelfTheme } from '@/hooks/useShelfTheme';
import {
  applyThemeColor,
  themeColorForAppMode,
  themeColorForPreset,
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
      applyThemeColor(
        preset === 'dark' || preset === 'sepia' || preset === 'green'
          ? themeColorForPreset(preset)
          : themeColorForAppMode(isDark)
      );
    }
  }, [isDark, preset]);

  return <>{children}</>;
}
