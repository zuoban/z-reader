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
  /* 净白 — warm paper, soft ink (aligned with app shell) */
  light: {
    bg: "#f6f1e8",
    fg: "#1c1915",
    link: "#4f4840",
    headerBg: "#f6f1e8",
    headerBorder: "#ddd4c6",
    cardBg: "#f0e9de",
    cardBorder: "#ddd4c6",
    buttonBg: "#ebe4d8",
    buttonHoverBg: "#e3dacc",
    buttonText: "#1c1915",
    muted: "#ebe4d8",
    mutedText: "#5a5349",
    accentText: "#4f4840",
  },
  /* 旧书 — classic parchment */
  sepia: {
    bg: "#f3ead7",
    fg: "#3f3124",
    link: "#7a4e2a",
    headerBg: "#f8f1e2",
    headerBorder: "#d8c4a0",
    cardBg: "#f8f1e2",
    cardBorder: "#d8c4a0",
    buttonBg: "#eee0c4",
    buttonHoverBg: "#e5d4b2",
    buttonText: "#3f3124",
    muted: "#eee0c4",
    mutedText: "#5c4a36",
    accentText: "#7a4e2a",
  },
  /* 苔纸 — soft moss green */
  green: {
    bg: "#e6ede1",
    fg: "#1f2e25",
    link: "#3d6349",
    headerBg: "#eef3e9",
    headerBorder: "#c8d6c3",
    cardBg: "#eef3e9",
    cardBorder: "#c8d6c3",
    buttonBg: "#d8e3d3",
    buttonHoverBg: "#cdd9c7",
    buttonText: "#1f2e25",
    muted: "#d8e3d3",
    mutedText: "#3d4f42",
    accentText: "#3d6349",
  },
  /* 夜读 — warm charcoal night */
  dark: {
    bg: "#141210",
    fg: "#f2eadc",
    link: "#d0a57a",
    headerBg: "#141210",
    headerBorder: "#3a322a",
    cardBg: "#1e1a16",
    cardBorder: "#3a322a",
    buttonBg: "#24201b",
    buttonHoverBg: "#2c2620",
    buttonText: "#f2eadc",
    muted: "#2c2620",
    mutedText: "#c4b6a4",
    accentText: "#d0a57a",
  },
};

export const DEFAULT_READER_THEME: ReaderTheme = {
  preset: "light",
  fontFamily: "editorial",
  fontSize: 17,
  lineHeight: 1.7,
  pagePaddingX: 22,
  pagePaddingY: 18,
  paragraphSpacing: 1.15,
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

    const headingWeight = theme.fontFamily === "humanist" ? 650 : 600;
    const scrollbarThumb = withOpacity(preset.fg, isDark ? 0.22 : 0.16);
    const scrollbarThumbHover = withOpacity(preset.fg, isDark ? 0.34 : 0.26);
    const hrColor = withOpacity(preset.fg, isDark ? 0.14 : 0.12);

    return `
      html {
        background: ${preset.bg} !important;
        color: ${preset.fg} !important;
        scrollbar-width: thin;
        scrollbar-color: ${scrollbarThumb} transparent;
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
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      @media (max-width: 640px) {
        body {
          padding-top: ${theme.pagePaddingY}px !important;
          padding-bottom: calc(${theme.pagePaddingY}px + 2.5rem) !important;
          padding-inline: ${Math.max(8, theme.pagePaddingX - 8)}px !important;
        }
      }
      * {
        scrollbar-width: thin;
        scrollbar-color: ${scrollbarThumb} transparent;
      }
      *::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      *::-webkit-scrollbar-track {
        background: transparent;
      }
      *::-webkit-scrollbar-thumb {
        background: ${scrollbarThumb};
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: padding-box;
      }
      *::-webkit-scrollbar-thumb:hover {
        background: ${scrollbarThumbHover};
        background-clip: padding-box;
      }
      h1, h2, h3, h4, h5, h6 {
        color: ${preset.fg} !important;
        font-family: ${fontStack} !important;
        font-weight: ${headingWeight} !important;
        line-height: 1.28 !important;
        letter-spacing: -0.015em;
        margin: 1.35em 0 0.55em !important;
        text-wrap: balance;
      }
      h1 { font-size: 1.55em !important; }
      h2 { font-size: 1.32em !important; }
      h3 { font-size: 1.15em !important; }
      h4, h5, h6 { font-size: 1.05em !important; }
      p {
        line-height: ${theme.lineHeight} !important;
        margin: ${theme.paragraphSpacing}em 0 !important;
        text-align: justify;
        hyphens: auto;
      }
      li {
        line-height: ${theme.lineHeight} !important;
        margin: 0.35em 0 !important;
      }
      ul, ol {
        padding-inline-start: 1.4em !important;
        margin: 0.85em 0 !important;
      }
      blockquote {
        margin: 1.35em 0 !important;
        padding: 0.65em 1.15em !important;
        border-left: 3px solid ${withOpacity(preset.link, 0.55)};
        border-radius: 0 0.65rem 0.65rem 0;
        background: ${withOpacity(preset.link, isDark ? 0.08 : 0.06)};
        color: ${withOpacity(preset.fg, 0.92)} !important;
      }
      blockquote p {
        margin: 0.45em 0 !important;
      }
      hr {
        border: 0 !important;
        height: 1px !important;
        margin: 1.75em auto !important;
        max-width: 42% !important;
        background: linear-gradient(90deg, transparent, ${hrColor}, transparent) !important;
      }
      a {
        color: ${preset.link} !important;
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 0.2em;
        text-decoration-color: ${withOpacity(preset.link, 0.45)};
      }
      a:hover {
        text-decoration-color: ${preset.link};
      }
      img, svg, video {
        max-width: 100% !important;
        height: auto !important;
      }
      img {
        border-radius: 0.35rem;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 1.1em 0 !important;
        font-size: 0.95em;
      }
      th, td {
        border: 1px solid ${withOpacity(preset.fg, isDark ? 0.16 : 0.12)};
        padding: 0.45em 0.65em;
        vertical-align: top;
      }
      th {
        background: ${withOpacity(preset.fg, isDark ? 0.08 : 0.05)};
        font-weight: 600;
      }
      ::selection {
        background: ${selectionBg} !important;
        color: ${selectionColor} !important;
      }
      code, kbd, samp {
        background: ${codeBg};
        padding: 0.15em 0.4em;
        border-radius: 0.35rem;
        font-size: 0.92em;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      pre {
        background: ${codeBg};
        padding: 0.85em 1em !important;
        border-radius: 0.65rem;
        overflow-x: auto;
        margin: 1.1em 0 !important;
        border: 1px solid ${withOpacity(preset.fg, isDark ? 0.1 : 0.06)};
      }
      pre code {
        background: transparent;
        padding: 0;
        border-radius: 0;
        font-size: 0.9em;
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
