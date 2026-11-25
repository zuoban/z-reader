'use client';

import type { ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import '@/app/styles/mantine.css';
import { useShelfTheme } from '@/hooks/useShelfTheme';
import {
  mantineCssVariablesResolver,
  mantineTheme,
} from '@/lib/mantine-theme';

export function MantineAppProvider({ children }: { children: ReactNode }) {
  const { isDark } = useShelfTheme();

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
