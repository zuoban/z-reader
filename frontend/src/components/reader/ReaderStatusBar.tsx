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
        className="absolute bottom-0 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2"
        style={{
          paddingBottom: `calc(${safeAreaPaddingBottom} + 0.35rem)`,
          color: "inherit",
        }}
      >
        <button
          type="button"
          data-reader-interactive="true"
          onClick={onToggleToolbar}
          title="展开顶部操作栏"
          aria-label="展开顶部操作栏"
          aria-pressed={false}
          className="flex cursor-pointer appearance-none items-center justify-center border-0 bg-transparent p-0 font-inherit outline-none transition-[opacity,transform] duration-200 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-inset active:scale-[0.98]"
        >
          <span
            className="flex h-8 min-w-20 items-center justify-center rounded-full px-3 text-[11px] font-bold tabular-nums tracking-normal shadow-[0_10px_26px_-20px_rgba(0,0,0,0.45)] ring-1 backdrop-blur-md"
            style={{
              background: withOpacity(uiScheme.cardBg, 0.78),
              color: withOpacity(uiScheme.fg, 0.66),
              borderColor: withOpacity(uiScheme.cardBorder, 0.32),
              boxShadow: `0 16px 34px -24px ${withOpacity(uiScheme.cardBorder, 0.62)}`,
            }}
          >
            {percentage.toFixed(1)}%
          </span>
        </button>
        {compactTrailingAction}
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
      className="absolute inset-x-0 bottom-0 z-30 flex cursor-pointer appearance-none justify-center border-0 p-0 text-left font-inherit outline-none transition-[background-color,opacity] duration-150 hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-inset active:bg-black/[0.05]"
      style={{
        paddingBottom: safeAreaPaddingBottom,
        color: "inherit",
        ...containerStyle,
      }}
    >
      <div className="relative flex h-11 w-full max-w-5xl items-center px-4 text-[11px] font-medium sm:px-6 sm:text-[12px]">
        <div className="flex w-24 shrink-0 items-center">
          <span
            className="font-mono font-bold tabular-nums tracking-normal"
            style={{ color: withOpacity(uiScheme.fg, 0.66) }}
          >
            {percentage.toFixed(1)}%
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center truncate px-4 text-center">
          <span
            className="truncate font-bold tracking-normal"
            style={{ color: withOpacity(uiScheme.fg, 0.56) }}
          >
            {currentChapter || "—"}
          </span>
        </div>

        <div className="flex w-24 shrink-0 items-center justify-end">
          <span
            className="font-mono font-bold tabular-nums tracking-normal"
            style={{ color: withOpacity(uiScheme.fg, 0.66) }}
          >
            {currentPageLabel || "—"}
          </span>
        </div>
      </div>
    </button>
  );
}
