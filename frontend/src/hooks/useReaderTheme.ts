"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ReaderFontFamily = "editorial" | "classic" | "humanist";

export interface ReaderTheme {
  preset: "light" | "sepia" | "green" | "dark";
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
  pagePaddingX: number;
  pagePaddingY: number;
  paragraphSpacing: number;
  flow: "paginated" | "scrolled";
  maxInlineSize: number;
  gap: number;
  animated: boolean;
}

export const FONT_FAMILY_OPTIONS: Record<
  ReaderFontFamily,
  {
    label: string;
    description: string;
    stack: string;
  }
> = {
  editorial: {
    label: "杂志衬线",
    description: "更有书页感，适合长篇阅读",
    stack: '"Noto Serif SC", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  },
  classic: {
    label: "经典衬线",
    description: "更接近传统纸书的气质",
    stack: '"Noto Serif SC", Georgia, "Times New Roman", Times, serif',
  },
  humanist: {
    label: "人文无衬线",
    description: "更现代，适合屏幕阅读",
    stack: '"Noto Sans SC", "Avenir Next", Avenir, "Helvetica Neue", Helvetica, sans-serif',
  },
};

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

export const PRESET_STYLES: Record<ReaderTheme["preset"], ThemeColors> = {
  light: {
    bg: "#FEFDF8",
    fg: "#1C1917",
    link: "#C5A028",
    headerBg: "#FFFFFF",
    headerBorder: "#E7E2D5",
    cardBg: "#FFFFFF",
    cardBorder: "#E7E2D5",
    buttonBg: "#F8F5EB",
    buttonHoverBg: "#F3F0E5",
    buttonText: "#44403C",
    mutedText: "#78716C",
    accentText: "#A8A29E",
  },
  sepia: {
    bg: "#F5F0E1",
    fg: "#3D3225",
    link: "#B89A2E",
    headerBg: "#FAF5E8",
    headerBorder: "#E5D9BE",
    cardBg: "#FAF5E8",
    cardBorder: "#E5D9BE",
    buttonBg: "#F0E9D5",
    buttonHoverBg: "#E8DFC5",
    buttonText: "#5C4D3C",
    mutedText: "#7D6E5A",
    accentText: "#9E8E78",
  },
  green: {
    bg: "#E4F0E6",
    fg: "#1E3A2A",
    link: "#2E7D4F",
    headerBg: "#EDF5EF",
    headerBorder: "#C8DEC9",
    cardBg: "#EDF5EF",
    cardBorder: "#C8DEC9",
    buttonBg: "#E4F0E6",
    buttonHoverBg: "#D5E8D8",
    buttonText: "#2D4A3A",
    mutedText: "#4A6A5A",
    accentText: "#6A8A7A",
  },
  dark: {
    bg: "#0C0B09",
    fg: "#D6D3CD",
    link: "#D4B43C",
    headerBg: "#181714",
    headerBorder: "#292722",
    cardBg: "#181714",
    cardBorder: "#292722",
    buttonBg: "#232119",
    buttonHoverBg: "#2E2B22",
    buttonText: "#A8A29E",
    mutedText: "#6B665E",
    accentText: "#555048",
  },
};

export const DEFAULT_READER_THEME: ReaderTheme = {
  preset: "light",
  fontFamily: "editorial",
  fontSize: 16,
  lineHeight: 1.6,
  pagePaddingX: 20,
  pagePaddingY: 16,
  paragraphSpacing: 1.1,
  flow: "paginated",
  maxInlineSize: 1200,
  gap: 5,
  animated: true,
};

const STORAGE_KEY = "z-reader-theme";

let cachedTheme: ReaderTheme | null = null;

function subscribe(callback: () => void) {
  const handler = () => {
    cachedTheme = null;
    callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getSnapshot(): ReaderTheme {
  if (cachedTheme) return cachedTheme;
  if (typeof window === "undefined") {
    cachedTheme = DEFAULT_READER_THEME;
    return DEFAULT_READER_THEME;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = { ...DEFAULT_READER_THEME, ...JSON.parse(saved) } as ReaderTheme;
      cachedTheme = parsed;
      return parsed;
    }
  } catch (err) {
    console.error("Failed to load theme from localStorage:", err);
  }
  cachedTheme = DEFAULT_READER_THEME;
  return DEFAULT_READER_THEME;
}

function getServerSnapshot(): ReaderTheme {
  return DEFAULT_READER_THEME;
}

export function useReaderTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback(
    (newTheme: Partial<ReaderTheme>) => {
      const updated = { ...theme, ...newTheme };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      cachedTheme = updated;
      window.dispatchEvent(new StorageEvent("storage"));
      window.dispatchEvent(new CustomEvent("z-reader-theme-change"));
    },
    [theme],
  );

  const getStylesheet = useCallback(() => {
    const preset = PRESET_STYLES[theme.preset];
    const isDark = theme.preset === "dark";
    const fontStack = FONT_FAMILY_OPTIONS[theme.fontFamily].stack;

    // 朗读高亮复用 selection，夜间模式改用更柔和的暖金色而不是偏生硬的白色蒙层
    const selectionBg = isDark
      ? withOpacity(preset.link, 0.3)
      : withOpacity(preset.link, 0.18);
    const selectionColor = isDark ? "#f7f1df" : preset.fg;
    // 夜间模式 code 背景使用浅色透明层
    const codeBg = isDark ? "#ffffff10" : "#00000008";

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
        padding-block: ${theme.pagePaddingY}px !important;
        padding-inline: ${theme.pagePaddingX}px !important;
        font-family: ${fontStack} !important;
        box-sizing: border-box;
      }
      body, body * {
        font-family: ${fontStack} !important;
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
        margin: ${theme.paragraphSpacing}em 0 !important;
        hyphens: auto;
        word-spacing: 0.05em;
        color: ${preset.fg} !important;
      }
      li {
        line-height: ${theme.lineHeight} !important;
        margin: ${Math.max(theme.paragraphSpacing * 0.45, 0.2)}em 0 !important;
        color: ${preset.fg} !important;
      }
      blockquote {
        line-height: ${theme.lineHeight} !important;
        margin: ${Math.max(theme.paragraphSpacing * 1.4, 1.2)}em 0 !important;
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
      ${
        isDark
          ? `
      body p, body p *,
      body div, body div *,
      body span, body span * {
        color: ${preset.fg} !important;
      }
      `
          : ""
      }
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
      ::selection,
      *::selection {
        background: ${selectionBg} !important;
        color: ${selectionColor} !important;
      }
      ::-moz-selection,
      *::-moz-selection {
        background: ${selectionBg} !important;
        color: ${selectionColor} !important;
      }
      code {
        font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;
        background: ${codeBg};
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-size: 0.9em;
      }
      pre, kbd, samp {
        font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace !important;
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

function withOpacity(color: string, opacity: number) {
  if (!color.startsWith("#")) return color;

  const normalized =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;

  const hexOpacity = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");

  return `${normalized}${hexOpacity}`;
}
