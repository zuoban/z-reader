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

export function getModernReaderSurface(uiScheme: ThemeColors) {
  return {
    fg: uiScheme.fg,
    // Keep secondary labels near WCAG AA on paper/card surfaces (avoid over-fading).
    muted: withOpacity(uiScheme.mutedText, 0.96),
    border: withOpacity(uiScheme.cardBorder, 0.72),
    hairline: withOpacity(uiScheme.cardBorder, 0.52),
  };
}
