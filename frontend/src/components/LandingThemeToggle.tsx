'use client';

import { Moon, Sun } from 'lucide-react';
import { useShelfTheme } from '@/hooks/useShelfTheme';

export function LandingThemeToggle() {
  const { toggleTheme } = useShelfTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="切换明暗外观"
      title="切换明暗外观"
      className="entry-icon-btn"
    >
      <Moon size={16} strokeWidth={1.5} className="dark:hidden" aria-hidden="true" />
      <Sun size={16} strokeWidth={1.5} className="hidden dark:block" aria-hidden="true" />
    </button>
  );
}
