'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReaderThemePreset } from '@/lib/reader-theme-presets';

interface ShelfTheme {
  preset: ReaderThemePreset;
  isDark: boolean;
}

const STORAGE_KEY = 'z-reader-theme';

function normalizePreset(value: unknown): ReaderThemePreset {
  return value === 'dark' || value === 'sepia' || value === 'green' || value === 'light'
    ? value
    : 'light';
}

function readShelfTheme(): ShelfTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const preset = normalizePreset(parsed?.preset);
      return { preset, isDark: preset === 'dark' };
    }
  } catch {
    // ignore
  }
  return { preset: 'light', isDark: false };
}

function writeShelfThemePreset(preset: ReaderThemePreset) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, preset }));
    window.dispatchEvent(new Event('z-reader-theme-change'));
  } catch {
    // ignore
  }
}

export function useShelfTheme(): ShelfTheme & {
  toggleTheme: () => void;
} {
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
    const preset = theme.isDark ? 'light' : 'dark';
    writeShelfThemePreset(preset);
    setTheme({ preset, isDark: preset === 'dark' });
  }, [theme.isDark]);

  return { ...theme, toggleTheme };
}
