'use client';

import { useCallback, useSyncExternalStore } from 'react';

export interface ReaderTheme {
  preset: 'light' | 'sepia' | 'green' | 'dark';
  fontSize: number;
  lineHeight: number;
  margin: number;
}

export interface ThemeColors {
  bg: string;
  fg: string;
  link: string;
  headerBg: string;
  headerBorder: string;
  cardBg: string;
  cardBorder: string;
  buttonBg: string;
  buttonHoverBg: string;
  buttonText: string;
  mutedText: string;
  accentText: string;
}

const PRESET_STYLES: Record<ReaderTheme['preset'], ThemeColors> = {
  light: {
    bg: '#ffffff',
    fg: '#333333',
    link: '#0066cc',
    headerBg: '#ffffff',
    headerBorder: '#e5e7eb',
    cardBg: '#f9fafb',
    cardBorder: '#d1d5db',
    buttonBg: '#f3f4f6',
    buttonHoverBg: '#e5e7eb',
    buttonText: '#374151',
    mutedText: '#6b7280',
    accentText: '#9ca3af',
  },
  sepia: {
    bg: '#f4ecd8',
    fg: '#5c4b37',
    link: '#8b5a2b',
    headerBg: '#f4ecd8',
    headerBorder: '#d4c4a8',
    cardBg: '#ebe3d0',
    cardBorder: '#c9b99d',
    buttonBg: '#ebe3d0',
    buttonHoverBg: '#d4c4a8',
    buttonText: '#5c4b37',
    mutedText: '#7a6a56',
    accentText: '#9a8a74',
  },
  green: {
    bg: '#cce8cf',
    fg: '#2d4a3e',
    link: '#3d6b4f',
    headerBg: '#cce8cf',
    headerBorder: '#a8d8ac',
    cardBg: '#b8d8bc',
    cardBorder: '#98c89c',
    buttonBg: '#b8d8bc',
    buttonHoverBg: '#a8d8ac',
    buttonText: '#2d4a3e',
    mutedText: '#4a6a5e',
    accentText: '#6a8a7e',
  },
  dark: {
    bg: '#1e293b',
    fg: '#e2e8f0',
    link: '#7dd3fc',
    headerBg: '#1e293b',
    headerBorder: '#334155',
    cardBg: '#0f172a',
    cardBorder: '#334155',
    buttonBg: '#334155',
    buttonHoverBg: '#475569',
    buttonText: '#e2e8f0',
    mutedText: '#94a3b8',
    accentText: '#cbd5e1',
  },
};

const DEFAULT_THEME: ReaderTheme = {
  preset: 'dark',
  fontSize: 16,
  lineHeight: 1.6,
  margin: 40,
};

const STORAGE_KEY = 'z-reader-theme';

let cachedTheme: ReaderTheme | null = null;

function subscribe(callback: () => void) {
  const handler = () => {
    cachedTheme = null;
    callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

function getSnapshot(): ReaderTheme {
  if (cachedTheme) return cachedTheme;
  if (typeof window === 'undefined') {
    cachedTheme = DEFAULT_THEME;
    return DEFAULT_THEME;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = { ...DEFAULT_THEME, ...JSON.parse(saved) } as ReaderTheme;
      cachedTheme = parsed;
      return parsed;
    }
  } catch {}
  cachedTheme = DEFAULT_THEME;
  return DEFAULT_THEME;
}

function getServerSnapshot(): ReaderTheme {
  return DEFAULT_THEME;
}

export function useReaderTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((newTheme: Partial<ReaderTheme>) => {
    const updated = { ...theme, ...newTheme };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    cachedTheme = updated;
    window.dispatchEvent(new StorageEvent('storage'));
  }, [theme]);

  const getStylesheet = useCallback(() => {
    const preset = PRESET_STYLES[theme.preset];
    return `
      html {
        background: ${preset.bg} !important;
        color: ${preset.fg} !important;
      }
      body {
        background: ${preset.bg} !important;
        color: ${preset.fg} !important;
        font-size: ${theme.fontSize}px !important;
        line-height: ${theme.lineHeight} !important;
        padding: ${theme.margin}px !important;
      }
      p, li, blockquote, dd {
        line-height: ${theme.lineHeight} !important;
        text-align: justify;
        margin: 0.5em 0;
      }
      a:link {
        color: ${preset.link} !important;
      }
      a:visited {
        color: ${preset.link} !important;
        opacity: 0.7;
      }
      ::selection {
        background: ${theme.preset === 'dark' ? '#3b82f6' : '#bfdbfe'} !important;
      }
    `;
  }, [theme]);

  const getContainerStyle = useCallback(() => {
    const preset = PRESET_STYLES[theme.preset];
    return {
      background: preset.bg,
      color: preset.fg,
    };
  }, [theme]);

  const getUIScheme = useCallback(() => {
    return PRESET_STYLES[theme.preset];
  }, [theme]);

  return {
    theme,
    setTheme,
    getStylesheet,
    getContainerStyle,
    getUIScheme,
    presets: PRESET_STYLES,
  };
}