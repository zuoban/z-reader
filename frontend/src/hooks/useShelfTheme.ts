'use client';

import { useCallback, useEffect, useState } from 'react';

interface ShelfTheme {
  isDark: boolean;
}

function readShelfTheme(): ShelfTheme {
  try {
    const raw = localStorage.getItem('z-reader-theme');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { isDark: parsed?.preset === 'dark' };
    }
  } catch {
    // ignore
  }
  return { isDark: false };
}

function writeShelfTheme(isDark: boolean) {
  try {
    localStorage.setItem('z-reader-theme', JSON.stringify({ preset: isDark ? 'dark' : 'light' }));
    window.dispatchEvent(new Event('z-reader-theme-change'));
  } catch {
    // ignore
  }
}

export function useShelfTheme(): ShelfTheme & { toggleTheme: () => void } {
  const [theme, setTheme] = useState<ShelfTheme>(readShelfTheme);

  useEffect(() => {
    function update() {
      setTheme(readShelfTheme());
    }

    window.addEventListener('storage', update);
    window.addEventListener('z-reader-theme-change', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('z-reader-theme-change', update);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    writeShelfTheme(!theme.isDark);
    setTheme({ isDark: !theme.isDark });
  }, [theme.isDark]);

  return { ...theme, toggleTheme };
}
