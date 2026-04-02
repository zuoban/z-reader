'use client';

import { useCallback, useSyncExternalStore } from 'react';

export interface ReaderTheme {
  preset: 'light' | 'sepia' | 'green' | 'dark';
  fontSize: number;
  lineHeight: number;
  flow: 'paginated' | 'scrolled';
  maxInlineSize: number;
  gap: number;
  animated: boolean;
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

export const PRESET_STYLES: Record<ReaderTheme['preset'], ThemeColors> = {
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
    bg: '#121212',
    fg: '#b0b0b0',
    link: '#d4a843',
    headerBg: '#1a1a1a',
    headerBorder: '#2a2a2a',
    cardBg: '#1a1a1a',
    cardBorder: '#2a2a2a',
    buttonBg: '#2a2a2a',
    buttonHoverBg: '#3a3a3a',
    buttonText: '#a0a0a0',
    mutedText: '#6a6a6a',
    accentText: '#525252',
  },
};

const DEFAULT_THEME: ReaderTheme = {
  preset: 'light',
  fontSize: 16,
  lineHeight: 1.6,
  flow: 'paginated',
  maxInlineSize: 1200,
  gap: 2,
  animated: true,
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
  } catch (err) {
    console.error('Failed to load theme from localStorage:', err);
  }
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
    const isDark = theme.preset === 'dark';

    // 夜间模式使用更柔和的 selection 颜色
    const selectionBg = isDark ? '#ffffff20' : '#D4AF3730';
    // 夜间模式 code 背景使用浅色透明层
    const codeBg = isDark ? '#ffffff10' : '#00000008';

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
        padding-block: 0 !important;
        padding-inline: 0 !important;
      }
      body > *:first-child {
        margin-top: 0 !important;
      }
      body > *:last-child {
        margin-bottom: 0 !important;
      }
      p {
        line-height: ${theme.lineHeight} !important;
        text-align: justify;
        margin: 1em 0;
        hyphens: auto;
        word-spacing: 0.05em;
        color: ${preset.fg} !important;
      }
      li {
        line-height: ${theme.lineHeight} !important;
        margin: 0.3em 0;
        color: ${preset.fg} !important;
      }
      blockquote {
        line-height: ${theme.lineHeight} !important;
        margin: 1.5em 0;
        padding-left: 1.5em;
        border-left: 3px solid ${preset.link};
        opacity: 0.9;
        color: ${preset.fg} !important;
      }
      h1, h2, h3, h4, h5, h6 {
        color: ${preset.fg} !important;
        font-weight: 600 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.5em !important;
        line-height: 1.3 !important;
        background: transparent !important;
      }
      h1 *, h2 *, h3 *, h4 *, h5 *, h6 * {
        color: ${preset.fg} !important;
        background: transparent !important;
      }
      [class*="title"], [class*="heading"], [class*="chapter"], [id*="title"], [id*="heading"], [id*="chapter"] {
        color: ${preset.fg} !important;
        background: transparent !important;
      }
      .calibre, .titlepage, .chapter, .section, .heading, .title {
        color: ${preset.fg} !important;
        background: transparent !important;
      }
      /* 夜间模式：强制覆盖所有可能为深色的元素 */
      ${isDark ? `
      body p, body p *,
      body div, body div *,
      body span, body span * {
        color: ${preset.fg} !important;
      }
      ` : ''}
      h1:first-child, h2:first-child, h3:first-child, h4:first-child, h5:first-child, h6:first-child,
      p:first-child, blockquote:first-child, ul:first-child, ol:first-child {
        margin-top: 0 !important;
      }
      p:last-child, blockquote:last-child, ul:last-child, ol:last-child {
        margin-bottom: 0 !important;
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
        background: ${selectionBg} !important;
        color: ${preset.fg} !important;
      }
      code {
        font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;
        background: ${codeBg};
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
