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
  if (!isToolbarVisible) {
    return (
      <button
        type="button"
        data-reader-interactive="true"
        onClick={onToggleToolbar}
        title="展开顶部操作栏"
        aria-label="展开顶部操作栏"
        aria-pressed={false}
        className="absolute bottom-0 left-1/2 z-30 flex -translate-x-1/2 cursor-pointer appearance-none items-center justify-center border-0 bg-transparent p-0 font-inherit outline-none transition-[opacity,transform] duration-200 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-inset active:scale-[0.98]"
        style={{
          paddingBottom: `calc(${safeAreaPaddingBottom} + 0.35rem)`,
          color: "inherit",
        }}
      >
        <span
          className="flex h-7 min-w-16 items-center justify-center rounded-full px-3 text-[11px] font-bold tabular-nums tracking-tight shadow-[0_10px_26px_-20px_rgba(0,0,0,0.45)] ring-1 backdrop-blur-sm"
          style={{
            background: withOpacity(uiScheme.cardBg, 0.72),
            color: withOpacity(uiScheme.fg, 0.58),
            borderColor: withOpacity(uiScheme.cardBorder, 0.24),
            boxShadow: `0 12px 28px -22px ${withOpacity(uiScheme.cardBorder, 0.55)}`,
          }}
        >
          {percentage.toFixed(1)}%
        </span>
      </button>
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
