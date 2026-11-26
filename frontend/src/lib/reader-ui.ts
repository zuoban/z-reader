import type { CSSProperties, KeyboardEvent } from "react";
import type { ThemeColors } from "@/hooks/useReaderTheme";

export function withOpacity(color: string | undefined, opacity: number) {
  if (!color) return "";
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

function isDarkHexColor(color: string | undefined): boolean {
  if (!color || !color.startsWith("#")) return false;
  const hex =
    color.length === 4
      ? `${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color.slice(1, 7);
  if (hex.length !== 6) return false;

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) {
    return false;
  }

  return (red * 299 + green * 587 + blue * 114) / 1000 < 128;
}

export function getModernReaderSurface(uiScheme: ThemeColors) {
  return {
    fg: uiScheme.fg,
    // Keep secondary labels near WCAG AA on paper/card surfaces (avoid over-fading).
    muted: withOpacity(uiScheme.mutedText, 0.96),
    border: withOpacity(uiScheme.cardBorder, 0.72),
    hairline: withOpacity(uiScheme.cardBorder, 0.52),
  };
}

export function getReaderPanelThemeVars(uiScheme: ThemeColors): CSSProperties {
  const surface = getModernReaderSurface(uiScheme);
  const isDark = isDarkHexColor(uiScheme.cardBg);

  return {
    "--reader-panel-bg": uiScheme.cardBg,
    "--reader-panel-fg": surface.fg,
    "--reader-panel-muted": surface.muted,
    "--reader-panel-border": surface.border,
    "--reader-panel-rule": surface.hairline,
    "--reader-panel-hover": uiScheme.buttonBg,
    "--reader-panel-accent": uiScheme.link,
    "--reader-panel-danger": isDark ? "#f08078" : "#c23b33",
    "--reader-panel-warning": isDark ? "#e5ac50" : "#a86c14",
  } as CSSProperties;
}

export interface RovingListKeyOptions {
  requireActiveItem?: boolean;
  onArrowUpFromFirst?: () => void;
  stopPropagation?: boolean;
}

export function handleRovingListKeyDown(
  event: KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  options: RovingListKeyOptions = {},
): boolean {
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return false;
  }

  const items = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
  );
  if (items.length === 0) return false;

  const activeIndex = items.findIndex((item) => item === document.activeElement);
  if (options.requireActiveItem && activeIndex === -1) return false;

  event.preventDefault();
  if (options.stopPropagation) {
    event.stopPropagation();
  }

  if (event.key === "Home") {
    items[0]?.focus();
    return true;
  }
  if (event.key === "End") {
    items[items.length - 1]?.focus();
    return true;
  }
  if (event.key === "ArrowUp" && activeIndex === 0 && options.onArrowUpFromFirst) {
    options.onArrowUpFromFirst();
    return true;
  }

  const delta = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex =
    activeIndex === -1
      ? delta > 0
        ? 0
        : items.length - 1
      : (activeIndex + delta + items.length) % items.length;
  items[nextIndex]?.focus();
  return true;
}
