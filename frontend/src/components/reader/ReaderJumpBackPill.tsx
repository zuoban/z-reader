"use client";

import { Undo2, X } from "lucide-react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import { getReaderPanelThemeVars } from "@/lib/reader-ui";

interface ReaderJumpBackPillProps {
  percentage: number | null;
  uiScheme: ThemeColors;
  safeAreaPaddingBottom: string;
  isToolbarVisible: boolean;
  onReturn: () => void;
  onDismiss: () => void;
}

export function ReaderJumpBackPill({
  percentage,
  uiScheme,
  safeAreaPaddingBottom,
  isToolbarVisible,
  onReturn,
  onDismiss,
}: ReaderJumpBackPillProps) {
  if (percentage === null || !Number.isFinite(percentage)) {
    return null;
  }

  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  const formattedPercentage = `${clampedPercentage.toFixed(1)}%`;
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);
  const bottomOffset = isToolbarVisible
    ? `calc(3.5rem + ${safeAreaPaddingBottom})`
    : `calc(3.25rem + ${safeAreaPaddingBottom})`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]"
      style={{ bottom: bottomOffset }}
    >
      <div
        role="group"
        aria-label="返回原位"
        data-reader-interactive="true"
        className="reader-jump-back-pill paper-reveal-soft pointer-events-auto inline-flex items-center overflow-hidden rounded-full"
        style={panelThemeVars}
      >
        <button
          type="button"
          data-reader-interactive="true"
          onClick={onReturn}
          title={`返回跳转前位置 (${formattedPercentage})`}
          aria-label={`返回原位 · ${formattedPercentage}`}
          className="reader-jump-back-return"
        >
          <Undo2
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--reader-panel-accent)" }}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>
            返回原位 ·{" "}
            <span className="font-mono tabular-nums">{formattedPercentage}</span>
          </span>
        </button>

        <span
          aria-hidden="true"
          className="h-4 w-px shrink-0"
          style={{ background: "var(--reader-panel-rule)" }}
        />

        <button
          type="button"
          data-reader-interactive="true"
          onClick={onDismiss}
          title="忽略返回原位"
          aria-label="忽略返回原位"
          className="reader-jump-back-dismiss"
        >
          <X className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
