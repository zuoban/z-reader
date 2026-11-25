export type ReaderThemePreset = "light" | "sepia" | "green" | "dark";

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

export const PRESET_STYLES: Record<ReaderThemePreset, ThemeColors> = {
  /* 净白 — warm neutral paper with terracotta accent (aligned with app shell) */
  light: {
    bg: "#f8f7f4",
    fg: "#1c1b19",
    link: "#8e4934",
    headerBg: "#f8f7f4",
    headerBorder: "#e6e4de",
    cardBg: "#ffffff",
    cardBorder: "#e6e4de",
    buttonBg: "#f1efe9",
    buttonHoverBg: "#e8e5dd",
    buttonText: "#1c1b19",
    muted: "#f3f2ed",
    mutedText: "#6b6860",
    accentText: "#8e4934",
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
  /* 夜读 — calm warm graphite night (aligned with app shell dark mode) */
  dark: {
    bg: "#141413",
    fg: "#ededeb",
    link: "#e4a186",
    headerBg: "#141413",
    headerBorder: "#2a2a27",
    cardBg: "#1b1b19",
    cardBorder: "#2a2a27",
    buttonBg: "#242422",
    buttonHoverBg: "#2e2e2b",
    buttonText: "#ededeb",
    muted: "#20201e",
    mutedText: "#9a9891",
    accentText: "#e4a186",
  },
};
