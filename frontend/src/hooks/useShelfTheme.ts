'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReaderTheme } from '@/hooks/useReaderTheme';

const PRESETS: ReaderTheme['preset'][] = ['light', 'sepia', 'green', 'dark'];

interface ShelfTheme {
  preset: ReaderTheme['preset'];
  isDark: boolean;
}

const STORAGE_KEY = 'z-reader-theme';

function normalizePreset(value: unknown): ReaderTheme['preset'] {
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

function writeShelfThemePreset(preset: ReaderTheme['preset']) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, preset }));
    window.dispatchEvent(new StorageEvent('storage'));
    window.dispatchEvent(new Event('z-reader-theme-change'));
  } catch {
    // ignore
  }
}

export function useShelfTheme(): ShelfTheme & {
  toggleTheme: () => void;
  cyclePreset: () => void;
  setPreset: (preset: ReaderTheme['preset']) => void;
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

  const cyclePreset = useCallback(() => {
    const currentIdx = PRESETS.indexOf(theme.preset);
    const nextPreset = PRESETS[(currentIdx + 1) % PRESETS.length];
    writeShelfThemePreset(nextPreset);
    setTheme({ preset: nextPreset, isDark: nextPreset === 'dark' });
  }, [theme.preset]);

  const setPreset = useCallback((preset: ReaderTheme['preset']) => {
    writeShelfThemePreset(preset);
    setTheme({ preset, isDark: preset === 'dark' });
  }, []);

  return { ...theme, toggleTheme, cyclePreset, setPreset };
}
