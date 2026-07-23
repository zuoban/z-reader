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
          className="pointer-events-auto flex min-h-11 items-center gap-1 rounded-full border px-1.5 backdrop-blur-xl"
          style={{
            background: `
              linear-gradient(180deg, ${withOpacity(uiScheme.fg, 0.04)} 0%, transparent 100%),
              ${withOpacity(uiScheme.bg, 0.82)}
            `,
            borderColor: withOpacity(uiScheme.cardBorder, 0.2),
            boxShadow: `
              0 12px 32px -20px ${withOpacity(uiScheme.fg, 0.4)},
              inset 0 1px 0 ${withOpacity("#ffffff", 0.18)}
            `,
          }}
        >
          <button
            type="button"
            data-reader-interactive="true"
            onClick={onToggleToolbar}
            title="展开操作栏"
            aria-label="展开操作栏"
            className="touch-target paper-motion-interactive flex min-h-10 min-w-[52px] items-center justify-center rounded-full px-3 text-xs font-semibold tabular-nums tracking-wide transition-all active:scale-[0.96] hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              color: withOpacity(uiScheme.fg, 0.74),
              fontFamily: metaFont,
              background: "transparent",
              border: "none",
              lineHeight: 1,
            }}
          >
            {percentage.toFixed(1)}%
          </button>
          <div
            className="h-3 w-px shrink-0 opacity-25"
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
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-11 cursor-pointer appearance-none justify-center border-0 p-0 text-left font-inherit outline-none transition-[background-color,opacity] duration-150 hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-inset active:bg-black/[0.05]"
      style={{
        paddingBottom: safeAreaPaddingBottom,
        color: "inherit",
        ...containerStyle,
      }}
    >
      <div className="relative flex min-h-11 w-full max-w-5xl items-center px-4 text-xs font-medium sm:px-6">
        <div className="flex w-24 shrink-0 items-center">
          <span
            className="font-semibold tabular-nums tracking-normal"
            style={{
              color: withOpacity(uiScheme.fg, 0.72),
              fontFamily: metaFont,
            }}
          >
            {percentage.toFixed(1)}%
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center truncate px-4 text-center">
          <span
            className="truncate font-medium tracking-normal"
            style={{
              color: withOpacity(uiScheme.fg, 0.58),
              fontFamily: metaFont,
            }}
          >
            {currentChapter || "—"}
          </span>
        </div>

        <div className="flex w-24 shrink-0 items-center justify-end">
          <span
            className="font-semibold tabular-nums tracking-normal"
            style={{
              color: withOpacity(uiScheme.fg, 0.72),
              fontFamily: metaFont,
            }}
          >
            {currentPageLabel || "—"}
          </span>
        </div>
      </div>
    </button>
  );
}
