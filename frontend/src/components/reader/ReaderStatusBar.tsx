"use client";

import type { CSSProperties, ReactNode } from "react";

import type { ThemeColors } from "@/hooks/useReaderTheme";

interface ReaderStatusBarProps {
  percentage: number;
  currentChapter: string;
  currentPageLabel: string;
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
  safeAreaPaddingBottom,
  uiScheme,
  isToolbarVisible,
  onToggleToolbar,
  compactTrailingAction,
}: ReaderStatusBarProps) {
  const clampedPercentage = Number.isFinite(percentage)
    ? Math.min(Math.max(percentage, 0), 100)
    : 0;
  const formattedPercentage = `${clampedPercentage.toFixed(1)}%`;

  const statusThemeVars = {
    "--reader-status-bg": uiScheme.bg,
    "--reader-status-fg": uiScheme.fg,
    "--reader-status-muted": uiScheme.mutedText,
    "--reader-status-rule": uiScheme.cardBorder,
    "--reader-status-hover": uiScheme.buttonBg,
    "--reader-status-accent": uiScheme.link,
  } as CSSProperties;

  if (!isToolbarVisible) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center justify-center"
        style={{
          ...statusThemeVars,
          height: "var(--status-bar-reserved)",
          paddingBottom: safeAreaPaddingBottom,
        }}
      >
        <div className="reader-status-pill pointer-events-auto">
          <button
            type="button"
            data-reader-interactive="true"
            onClick={onToggleToolbar}
            title="展开操作栏"
            aria-label="展开操作栏"
            aria-pressed={false}
            className="reader-status-trigger"
          >
            {formattedPercentage}
          </button>
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
      className="reader-status-bar fixed inset-x-0 bottom-0 z-40 flex min-h-11 cursor-pointer appearance-none justify-center border-t p-0 text-left font-inherit outline-none"
      style={{
        ...statusThemeVars,
        paddingBottom: safeAreaPaddingBottom,
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] overflow-hidden"
      >
        <span
          className="reader-status-progress-fill block h-full"
          style={{ width: `${clampedPercentage}%` }}
        />
      </span>
      <div className="grid min-h-[calc(2.75rem-1px)] w-full max-w-6xl grid-cols-[minmax(4.25rem,1fr)_minmax(0,3fr)_minmax(4.25rem,1fr)] items-center gap-3 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))]">
        <span className="text-[11px] font-normal tracking-[0.04em] tabular-nums">
          {formattedPercentage}
        </span>
        <span
          className="reader-status-chapter truncate text-center text-xs font-normal tracking-[0.01em]"
          title={currentChapter || undefined}
        >
          {currentChapter || "—"}
        </span>
        <span
          className="truncate text-right text-[11px] font-normal tracking-[0.04em] tabular-nums"
          title={currentPageLabel || undefined}
        >
          {currentPageLabel || "—"}
        </span>
      </div>
    </button>
  );
}
