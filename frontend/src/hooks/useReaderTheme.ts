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
  chineseIndent: boolean;
  punctuationSqueeze: boolean;
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
  muted: string;
  mutedText: string;
  accentText: string;
}

export const PRESET_STYLES: Record<ReaderTheme["preset"], ThemeColors> = {
  light: {
    bg: "#f8f8f6",
    fg: "#262522",
    link: "#4f5966",
    headerBg: "#f8f8f6",
    headerBorder: "#d6d4ce",
    cardBg: "#eeeeea",
    cardBorder: "#d6d4ce",
    buttonBg: "#eeeeea",
    buttonHoverBg: "#e4e4df",
    buttonText: "#262522",
    muted: "#eeeeea",
    mutedText: "#625f59",
    accentText: "#4f5966",
  },
  sepia: {
    bg: "#f4ecd8",
    fg: "#5c4a3a",
    link: "#8b4513",
    headerBg: "#fbf6e9",
    headerBorder: "#d9c39b",
    cardBg: "#fbf6e9",
    cardBorder: "#d9c39b",
    buttonBg: "#f1e2c8",
    buttonHoverBg: "#e8d5b5",
    buttonText: "#433427",
    muted: "#f1e2c8",
    mutedText: "#65523e",
    accentText: "#8b4513",
  },
  green: {
    bg: "#e5ede0",
    fg: "#24352b",
    link: "#4a7557",
    headerBg: "#eef3e9",
    headerBorder: "#cbd8c7",
    cardBg: "#eef3e9",
    cardBorder: "#cbd8c7",
    buttonBg: "#d9e4d4",
    buttonHoverBg: "#cedbc8",
    buttonText: "#24352b",
    muted: "#d9e4d4",
    mutedText: "#46584a",
    accentText: "#4a7557",
  },
  dark: {
    bg: "#1a1612",
    fg: "#d4c5b2",
    link: "#a06040",
    headerBg: "#1a1612",
    headerBorder: "#3a322a",
    cardBg: "#221e18",
    cardBorder: "#3a322a",
    buttonBg: "#221e18",
    buttonHoverBg: "#2a2420",
    buttonText: "#d4c5b2",
    muted: "#2a2420",
    mutedText: "#c0b29f",
    accentText: "#a06040",
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
  chineseIndent: true,
  punctuationSqueeze: true,
};

const STORAGE_KEY = "z-reader-theme";

function readPresetFromStorage(): ReaderTheme["preset"] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const p = parsed?.preset;
      if (p === "light" || p === "sepia" || p === "green" || p === "dark") return p;
    }
  } catch {
    // ignore
  }
  return null;
}

let cachedTheme: ReaderTheme | null = null;
let cachedThemeRaw: string | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeReaderTheme(theme: ReaderTheme): ReaderTheme {
  return {
    ...theme,
    fontSize: clamp(Number(theme.fontSize) || DEFAULT_READER_THEME.fontSize, 12, 32),
    lineHeight: clamp(Number(theme.lineHeight) || DEFAULT_READER_THEME.lineHeight, 1.2, 2.2),
    pagePaddingX: clamp(Number(theme.pagePaddingX) || DEFAULT_READER_THEME.pagePaddingX, 8, 56),
    pagePaddingY: clamp(Number(theme.pagePaddingY) || DEFAULT_READER_THEME.pagePaddingY, 8, 48),
    paragraphSpacing: clamp(
      Number(theme.paragraphSpacing) || DEFAULT_READER_THEME.paragraphSpacing,
      0.6,
      2.2
    ),
    maxInlineSize: clamp(
      Number(theme.maxInlineSize) || DEFAULT_READER_THEME.maxInlineSize,
      520,
      1400
    ),
    gap: clamp(Number(theme.gap) || DEFAULT_READER_THEME.gap, 0, 12),
    animated: Boolean(theme.animated),
    chineseIndent: theme.chineseIndent !== undefined ? Boolean(theme.chineseIndent) : DEFAULT_READER_THEME.chineseIndent,
    punctuationSqueeze: theme.punctuationSqueeze !== undefined ? Boolean(theme.punctuationSqueeze) : DEFAULT_READER_THEME.punctuationSqueeze,
  };
}

function subscribe(callback: () => void) {
  const handler = () => {
    cachedTheme = null;
    cachedThemeRaw = null;
    callback();
  };
  window.addEventListener("storage", handler);
  window.addEventListener("z-reader-theme-change", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("z-reader-theme-change", handler);
  };
}

function getSnapshot(): ReaderTheme {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (cachedTheme && cachedThemeRaw === saved) return cachedTheme;

    const storagePreset = readPresetFromStorage();

    // Build base theme from shared storage
    const baseTheme = { ...DEFAULT_READER_THEME };
    if (storagePreset) baseTheme.preset = storagePreset;

    // Merge reader-specific overrides if they exist in storage
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.fontFamily) baseTheme.fontFamily = parsed.fontFamily;
        if (parsed?.fontSize) baseTheme.fontSize = parsed.fontSize;
        if (parsed?.lineHeight) baseTheme.lineHeight = parsed.lineHeight;
        if (parsed?.pagePaddingX) baseTheme.pagePaddingX = parsed.pagePaddingX;
        if (parsed?.pagePaddingY) baseTheme.pagePaddingY = parsed.pagePaddingY;
        if (parsed?.paragraphSpacing) baseTheme.paragraphSpacing = parsed.paragraphSpacing;
        if (parsed?.flow) baseTheme.flow = parsed.flow;
        if (parsed?.maxInlineSize) baseTheme.maxInlineSize = parsed.maxInlineSize;
        if (parsed?.gap) baseTheme.gap = parsed.gap;
        if (parsed?.animated !== undefined) baseTheme.animated = parsed.animated;
        if (parsed?.chineseIndent !== undefined) baseTheme.chineseIndent = parsed.chineseIndent;
        if (parsed?.punctuationSqueeze !== undefined) baseTheme.punctuationSqueeze = parsed.punctuationSqueeze;
      } catch {
        // ignore
      }
    }

    const normalized = normalizeReaderTheme(baseTheme);
    cachedTheme = normalized;
    cachedThemeRaw = saved;
    return normalized;
  } catch (err) {
    console.error("Failed to load theme from localStorage:", err);
  }
  cachedTheme = normalizeReaderTheme(DEFAULT_READER_THEME);
  cachedThemeRaw = null;
  return cachedTheme;
}


const SERVER_SNAPSHOT = normalizeReaderTheme(DEFAULT_READER_THEME);

function getServerSnapshot(): ReaderTheme {
  return SERVER_SNAPSHOT;
}

export function useReaderTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback(
    (newTheme: Partial<ReaderTheme>) => {
      const updated = normalizeReaderTheme({ ...theme, ...newTheme });
      const raw = JSON.stringify(updated);
      localStorage.setItem(STORAGE_KEY, raw);
      cachedTheme = updated;
      cachedThemeRaw = raw;
      window.dispatchEvent(new StorageEvent("storage"));
      window.dispatchEvent(new CustomEvent("z-reader-theme-change"));
    },
    [theme],
  );

  const setPreset = useCallback(
    (preset: ReaderTheme["preset"]) => {
      const updated = { ...theme, preset };
      const raw = JSON.stringify(updated);
      localStorage.setItem(STORAGE_KEY, raw);
      cachedTheme = updated;
      cachedThemeRaw = raw;
      window.dispatchEvent(new StorageEvent("storage"));
      window.dispatchEvent(new CustomEvent("z-reader-theme-change"));
    },
    [theme],
  );

  const getStylesheet = useCallback(() => {
    const preset = PRESET_STYLES[theme.preset];
    const isDark = theme.preset === "dark";
    const fontStack = FONT_FAMILY_OPTIONS[theme.fontFamily].stack;

    const selectionBg = withOpacity(preset.link, isDark ? 0.35 : 0.2);
    const selectionColor = isDark ? "#ffffff" : "inherit";
    const codeBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";

    const indentStyle = theme.chineseIndent
      ? `
        p {
          text-indent: 2em !important;
        }
        p[align="center"], p.center, p.title, p.subtitle, blockquote p, p.author, p.epigraph {
          text-indent: 0 !important;
        }
      `
      : "";

    const punctuationStyle = theme.punctuationSqueeze
      ? `
        html, body, p, div, span {
          text-spacing: trim-adjacent !important;
          font-variant-east-asian: proportional-width !important;
          text-justify: inter-ideograph !important;
        }
      `
      : "";

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
        padding-top: ${theme.pagePaddingY}px !important;
        padding-bottom: calc(${theme.pagePaddingY}px + 2.25rem) !important;
        padding-inline: ${theme.pagePaddingX}px !important;
        font-family: ${fontStack} !important;
        box-sizing: border-box;
        text-rendering: optimizeLegibility;
      }
      @media (max-width: 640px) {
        body {
          padding-top: ${theme.pagePaddingY}px !important;
          padding-bottom: calc(${theme.pagePaddingY}px + 2.5rem) !important;
          padding-inline: ${Math.max(8, theme.pagePaddingX - 8)}px !important;
        }
      }
      p {
        line-height: ${theme.lineHeight} !important;
        margin: ${theme.paragraphSpacing}em 0 !important;
        text-align: justify;
        hyphens: auto;
      }
      blockquote {
        margin: 1.5em 0 !important;
        padding: 0.5em 1.5em !important;
        border-left: 4px solid ${preset.link};
        background: ${withOpacity(preset.link, 0.05)};
      }
      a {
        color: ${preset.link} !important;
        text-decoration: underline;
        text-underline-offset: 4px;
      }
      ::selection {
        background: ${selectionBg} !important;
        color: ${selectionColor} !important;
      }
      code {
        background: ${codeBg};
        padding: 0.2em 0.4em;
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      ${indentStyle}
      ${punctuationStyle}
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
    setPreset,
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
