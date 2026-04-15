'use client';

import { useEffect, useState } from 'react';

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

export function useShelfTheme(): ShelfTheme {
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

  return theme;
}
