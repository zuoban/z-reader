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
    bg: '#fafaf9',
    fg: '#171717',
    link: '#D4AF37',
    headerBg: '#ffffff',
    headerBorder: '#e7e5e4',
    cardBg: '#ffffff',
    cardBorder: '#e7e5e4',
    buttonBg: '#fafaf9',
    buttonHoverBg: '#f5f5f4',
    buttonText: '#404040',
    mutedText: '#737373',
    accentText: '#a3a3a3',
  },
  sepia: {
    bg: '#f5f1e8',
    fg: '#3d3020',
    link: '#b8860b',
    headerBg: '#faf8f3',
    headerBorder: '#e8dfc8',
    cardBg: '#faf8f3',
    cardBorder: '#e8dfc8',
    buttonBg: '#f5f1e8',
    buttonHoverBg: '#ebe5d5',
    buttonText: '#5a4a30',
    mutedText: '#7a6a50',
    accentText: '#9a8a70',
  },
  green: {
    bg: '#e8f3ea',
    fg: '#1a3a2a',
    link: '#2d7a4f',
    headerBg: '#f0f7f2',
    headerBorder: '#d0e5d5',
    cardBg: '#f0f7f2',
    cardBorder: '#d0e5d5',
    buttonBg: '#e8f3ea',
    buttonHoverBg: '#dceede',
    buttonText: '#2d4a3a',
    mutedText: '#4a6a5a',
    accentText: '#6a8a7a',
  },
  dark: {
    bg: '#0f172a',
    fg: '#f1f5f9',
    link: '#fbbf24',
    headerBg: '#1e293b',
    headerBorder: '#334155',
    cardBg: '#1e293b',
    cardBorder: '#334155',
    buttonBg: '#334155',
    buttonHoverBg: '#475569',
    buttonText: '#cbd5e1',
    mutedText: '#94a3b8',
    accentText: '#64748b',
  },
};

const DEFAULT_THEME: ReaderTheme = {
  preset: 'light',
  fontSize: 16,
  lineHeight: 1.6,
  margin: 16,
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
      p {
        line-height: ${theme.lineHeight} !important;
        text-align: justify;
        margin: 1em 0;
        hyphens: auto;
        word-spacing: 0.05em;
      }
      li {
        line-height: ${theme.lineHeight} !important;
        margin: 0.3em 0;
      }
      blockquote {
        line-height: ${theme.lineHeight} !important;
        margin: 1.5em 0;
        padding-left: 1.5em;
        border-left: 3px solid ${preset.link};
        opacity: 0.9;
      }
      h1, h2, h3, h4, h5, h6 {
        color: ${preset.fg} !important;
        font-weight: 600;
        margin-top: 1.5em;
        margin-bottom: 0.5em;
        line-height: 1.3;
      }
      a:link {
        color: ${preset.link} !important;
        text-decoration: none;
        border-bottom: 1px solid ${preset.link}40;
        transition: border-color 0.2s;
      }
      a:hover {
        border-bottom-color: ${preset.link};
      }
      a:visited {
        color: ${preset.link} !important;
        opacity: 0.8;
      }
      ::selection {
        background: ${theme.preset === 'dark' ? '#fbbf2440' : '#D4AF3730'} !important;
        color: ${preset.fg} !important;
      }
      code {
        font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;
        background: ${theme.preset === 'dark' ? '#ffffff10' : '#00000008'};
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-size: 0.9em;
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