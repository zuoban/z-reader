export type ReaderThemePreset = "light" | "sepia" | "green" | "dark";

export interface ThemeColors {
  bg: string;
  fg: string;
  link: string;
  cardBg: string;
  cardBorder: string;
  buttonBg: string;
  mutedText: string;
}

export const PRESET_STYLES: Record<ReaderThemePreset, ThemeColors> = {
  /* 净白 — warm neutral paper with terracotta accent (aligned with app shell) */
  light: {
    bg: "#f8f7f4",
    fg: "#1c1b19",
    link: "#8e4934",
    cardBg: "#ffffff",
    cardBorder: "#e6e4de",
    buttonBg: "#f1efe9",
    mutedText: "#6b6860",
  },
  /* 旧书 — classic parchment */
  sepia: {
    bg: "#f3ead7",
    fg: "#3f3124",
    link: "#7a4e2a",
    cardBg: "#f8f1e2",
    cardBorder: "#d8c4a0",
    buttonBg: "#eee0c4",
    mutedText: "#5c4a36",
  },
  /* 苔纸 — soft moss green */
  green: {
    bg: "#e6ede1",
    fg: "#1f2e25",
    link: "#3d6349",
    cardBg: "#eef3e9",
    cardBorder: "#c8d6c3",
    buttonBg: "#d8e3d3",
    mutedText: "#3d4f42",
  },
  /* 夜读 — calm warm graphite night (aligned with app shell dark mode) */
  dark: {
    bg: "#141413",
    fg: "#ededeb",
    link: "#e4a186",
    cardBg: "#1b1b19",
    cardBorder: "#2a2a27",
    buttonBg: "#242422",
    mutedText: "#9a9891",
  },
};
