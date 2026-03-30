'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ReaderTheme {
  preset: 'light' | 'sepia' | 'green' | 'dark';
  fontSize: number;
  lineHeight: number;
  margin: number;
}

const PRESET_STYLES = {
  light: {
    bg: '#ffffff',
    fg: '#333333',
    link: '#0066cc',
  },
  sepia: {
    bg: '#f4ecd8',
    fg: '#5c4b37',
    link: '#8b5a2b',
  },
  green: {
    bg: '#cce8cf',
    fg: '#2d4a3e',
    link: '#3d6b4f',
  },
  dark: {
    bg: '#1e293b',
    fg: '#e2e8f0',
    link: '#7dd3fc',
  },
};

const DEFAULT_THEME: ReaderTheme = {
  preset: 'dark',
  fontSize: 16,
  lineHeight: 1.6,
  margin: 40,
};

const STORAGE_KEY = 'z-reader-theme';

export function useReaderTheme() {
  const [theme, setThemeState] = useState<ReaderTheme>(DEFAULT_THEME);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ReaderTheme;
        setThemeState({ ...DEFAULT_THEME, ...parsed });
      }
    } catch {}
    setIsLoaded(true);
  }, []);

  const setTheme = useCallback((newTheme: Partial<ReaderTheme>) => {
    setThemeState(prev => {
      const updated = { ...prev, ...newTheme };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getStylesheet = useCallback(() => {
    const preset = PRESET_STYLES[theme.preset];
    return `
      html {
        background: ${preset.bg};
        color: ${preset.fg};
      }
      body {
        background: ${preset.bg};
        color: ${preset.fg};
        font-size: ${theme.fontSize}px;
        line-height: ${theme.lineHeight};
        padding: ${theme.margin}px;
      }
      p, li, blockquote, dd {
        line-height: ${theme.lineHeight};
        text-align: justify;
        margin: 0.5em 0;
      }
      a:link {
        color: ${preset.link};
      }
      a:visited {
        color: ${preset.link};
        opacity: 0.7;
      }
      ::selection {
        background: ${theme.preset === 'dark' ? '#3b82f6' : '#bfdbfe'};
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

  return {
    theme,
    setTheme,
    getStylesheet,
    getContainerStyle,
    presets: PRESET_STYLES,
    isLoaded,
  };
}