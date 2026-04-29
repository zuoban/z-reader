"use client";

import type { CSSProperties } from "react";

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
}: ReaderStatusBarProps) {
  return (
    <button
      type="button"
      data-reader-interactive="true"
      onClick={onToggleToolbar}
      title={isToolbarVisible ? "收起顶部操作栏" : "展开顶部操作栏"}
      aria-label={isToolbarVisible ? "收起顶部操作栏" : "展开顶部操作栏"}
      aria-pressed={isToolbarVisible}
      className="absolute inset-x-0 bottom-0 z-30 flex cursor-pointer appearance-none justify-center border-0 p-0 text-left font-inherit outline-none transition-colors duration-150 hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-inset active:bg-black/[0.05]"
      style={{
        paddingBottom: safeAreaPaddingBottom,
        color: "inherit",
        ...containerStyle,
      }}
    >
      <div className="relative flex h-9 w-full items-center px-4 text-[11px] font-medium sm:px-6 sm:text-[12px]">
        <div className="flex w-24 shrink-0 items-center">
          <span
            className="font-mono font-bold tabular-nums tracking-tight"
            style={{ color: withOpacity(uiScheme.fg, 0.6) }}
          >
            {percentage.toFixed(1)}%
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center truncate px-4 text-center">
          <span
            className="truncate font-bold tracking-tight"
            style={{ color: withOpacity(uiScheme.fg, 0.5) }}
          >
            {currentChapter || "—"}
          </span>
        </div>

        <div className="flex w-24 shrink-0 items-center justify-end">
          <span
            className="font-mono font-bold tabular-nums tracking-tight"
            style={{ color: withOpacity(uiScheme.fg, 0.6) }}
          >
            {currentPageLabel || "—"}
          </span>
        </div>
      </div>
    </button>
  );
}
