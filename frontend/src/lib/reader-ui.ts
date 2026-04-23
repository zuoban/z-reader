import type { CSSProperties } from "react";

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

export const floatingSheetActionButtonClass =
  "paper-motion-interactive paper-control absolute top-[max(0.75rem,env(safe-area-inset-top,0px))] z-10 h-9 w-9 rounded-full transition-[transform,box-shadow,background-color,border-color,color] hover:scale-[1.03] hover:shadow-md disabled:opacity-100 sm:top-4";

export function getFloatingSheetActionButtonStyle({
  uiScheme,
  enabled,
  side,
  offsetSlots = 1,
  tone = "accent",
}: {
  uiScheme: ThemeColors;
  enabled: boolean;
  side: "left" | "right";
  offsetSlots?: number;
  tone?: "accent" | "neutral";
}): CSSProperties {
  const insetProp = side === "left" ? "left" : "right";
  const activeColor =
    tone === "accent"
      ? withOpacity(uiScheme.link, 0.92)
      : withOpacity(uiScheme.mutedText, 0.86);
  const inactiveColor = withOpacity(uiScheme.mutedText, 0.72);

  const style: CSSProperties = {
    [insetProp]: `calc(max(0.75rem, env(safe-area-inset-${side}, 0px)) + ${offsetSlots * 2.75}rem)`,
    color: enabled ? activeColor : inactiveColor,
  };

  if (tone === "accent") {
    style.background = enabled
      ? withOpacity(uiScheme.link, 0.08)
      : withOpacity(uiScheme.cardBorder, 0.08);
    style.border = `1px solid ${
      enabled
        ? withOpacity(uiScheme.link, 0.18)
        : withOpacity(uiScheme.cardBorder, 0.14)
    }`;
    style.boxShadow = enabled
      ? `0 10px 18px -16px ${withOpacity(uiScheme.link, 0.45)}`
      : "none";
  }

  return style;
}
