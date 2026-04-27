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
}

export function ReaderStatusBar({
  percentage,
  currentChapter,
  currentPageLabel,
  containerStyle,
  safeAreaPaddingBottom,
  uiScheme,
}: ReaderStatusBarProps) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex justify-center"
      style={{
        paddingBottom: safeAreaPaddingBottom,
        ...containerStyle,
      }}
    >
      <div className="relative flex h-9 w-full items-center px-4 text-[11px] font-medium sm:px-6 sm:text-[12px]">
        <div className="flex w-16 shrink-0 items-center">
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

        <div className="flex w-16 shrink-0 items-center justify-end">
          <span
            className="font-mono font-bold tabular-nums tracking-tight"
            style={{ color: withOpacity(uiScheme.fg, 0.6) }}
          >
            {currentPageLabel || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
