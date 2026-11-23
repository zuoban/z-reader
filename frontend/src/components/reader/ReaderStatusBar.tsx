"use client";

import type { CSSProperties, ReactNode } from "react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import { withOpacity } from "@/lib/reader-ui";

interface ReaderStatusBarProps {
  percentage: number;
  currentChapter: string;
  currentPageLabel: string;
  containerStyle: CSSProperties;
  safeAreaPaddingBottom: string;
  uiScheme: ThemeColors;
  isToolbarVisible: boolean;
  onToggleToolbar: () => void;
  compactTrailingAction?: ReactNode;
}

export function ReaderStatusBar({
  percentage,
  currentChapter,
  currentPageLabel,
  containerStyle,
  safeAreaPaddingBottom,
  uiScheme,
  isToolbarVisible,
  onToggleToolbar,
  compactTrailingAction,
}: ReaderStatusBarProps) {
  const metaFont =
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  if (!isToolbarVisible) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center justify-center"
        style={{
          height: "var(--status-bar-reserved)",
          paddingBottom: safeAreaPaddingBottom,
        }}
      >
        <div
          className="pointer-events-auto flex min-h-10 items-center gap-1 rounded-full border px-1.5 backdrop-blur-md"
          style={{
            background: withOpacity(uiScheme.cardBg, 0.92),
            borderColor: withOpacity(uiScheme.cardBorder, 0.65),
            boxShadow: `0 6px 20px -12px ${withOpacity(uiScheme.fg, 0.28)}`,
          }}
        >
          <button
            type="button"
            data-reader-interactive="true"
            onClick={onToggleToolbar}
            title="展开操作栏"
            aria-label="展开操作栏"
            className="touch-target flex min-h-9 min-w-[52px] items-center justify-center rounded-full px-3 font-mono text-xs font-medium tabular-nums transition-colors active:scale-[0.98] hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              color: withOpacity(uiScheme.fg, 0.78),
              background: "transparent",
              border: "none",
              lineHeight: 1,
            }}
          >
            {percentage.toFixed(1)}%
          </button>
          <div
            className="h-3 w-px shrink-0 opacity-20"
            style={{ backgroundColor: uiScheme.fg }}
          />
          {compactTrailingAction}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-reader-interactive="true"
      onClick={onToggleToolbar}
      title="收起顶部操作栏"
      aria-label="收起顶部操作栏"
      aria-pressed={isToolbarVisible}
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-11 cursor-pointer appearance-none justify-center border-0 p-0 text-left font-inherit outline-none transition-[background-color,opacity] duration-150 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset active:bg-black/[0.05] dark:active:bg-white/[0.07]"
      style={{
        paddingBottom: safeAreaPaddingBottom,
        color: "inherit",
        ...containerStyle,
      }}
    >
      <div className="relative flex min-h-11 w-full max-w-5xl items-center px-4 text-xs font-medium sm:px-6">
        <div className="flex w-24 shrink-0 items-center">
          <span
            className="font-mono font-medium tabular-nums"
            style={{
              color: withOpacity(uiScheme.fg, 0.72),
            }}
          >
            {percentage.toFixed(1)}%
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center truncate px-4 text-center">
          <span
            className="truncate font-medium"
            style={{
              color: withOpacity(uiScheme.fg, 0.7),
              fontFamily: metaFont,
            }}
          >
            {currentChapter || "—"}
          </span>
        </div>

        <div className="flex w-24 shrink-0 items-center justify-end">
          <span
            className="font-mono font-medium tabular-nums"
            style={{
              color: withOpacity(uiScheme.fg, 0.72),
            }}
          >
            {currentPageLabel || "—"}
          </span>
        </div>
      </div>
    </button>
  );
}
