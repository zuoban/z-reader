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
          className="pointer-events-auto flex min-h-9 items-center gap-1 rounded-xl border px-2 backdrop-blur-xl"
          style={{
            background: withOpacity(uiScheme.bg, 0.78),
            borderColor: withOpacity(uiScheme.cardBorder, 0.18),
            boxShadow: `0 10px 30px -22px ${withOpacity(uiScheme.fg, 0.45)}`,
          }}
        >
          <button
            type="button"
            data-reader-interactive="true"
            onClick={onToggleToolbar}
            title="展开操作栏"
            aria-label="展开操作栏"
            className="paper-motion-interactive flex min-h-8 min-w-[52px] items-center justify-center rounded-lg px-2 text-[11px] font-semibold tabular-nums tracking-wide transition-all active:scale-[0.96] hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              color: withOpacity(uiScheme.fg, 0.72),
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
              background: "transparent",
              border: "none",
              lineHeight: 1,
            }}
          >
            {percentage.toFixed(1)}%
          </button>
          <div
            className="h-2.5 w-px shrink-0"
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
      className="flex fixed inset-x-0 bottom-0 z-40 min-h-11 cursor-pointer appearance-none justify-center border-0 p-0 text-left font-inherit outline-none transition-[background-color,opacity] duration-150 hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-inset active:bg-black/[0.05]"
      style={{
        paddingBottom: safeAreaPaddingBottom,
        color: "inherit",
        ...containerStyle,
      }}
    >
      <div className="relative flex min-h-11 w-full max-w-5xl items-center px-4 text-[11px] font-medium sm:px-6 sm:text-[12px]">
        <div className="flex w-24 shrink-0 items-center">
          <span
            className="tabular-nums tracking-normal font-semibold"
            style={{
              color: withOpacity(uiScheme.fg, 0.72),
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            }}
          >
            {percentage.toFixed(1)}%
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center truncate px-4 text-center">
          <span
            className="truncate font-semibold tracking-normal"
            style={{
              color: withOpacity(uiScheme.fg, 0.62),
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            }}
          >
            {currentChapter || "—"}
          </span>
        </div>

        <div className="flex w-24 shrink-0 items-center justify-end">
          <span
            className="tabular-nums tracking-normal font-semibold"
            style={{
              color: withOpacity(uiScheme.fg, 0.72),
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            }}
          >
            {currentPageLabel || "—"}
          </span>
        </div>
      </div>
    </button>
  );
}
