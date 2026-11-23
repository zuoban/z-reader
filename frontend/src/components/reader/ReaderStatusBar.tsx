"use client";

import type { ReactNode } from "react";

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
          className="pointer-events-auto flex items-center rounded-lg shadow-[inset_0_0_0_1px_var(--reader-status-rule)]"
          style={{
            background: uiScheme.cardBg,
            "--reader-status-rule": uiScheme.cardBorder,
          } as React.CSSProperties}
        >
          <button
            type="button"
            data-reader-interactive="true"
            onClick={onToggleToolbar}
            title="展开操作栏"
            aria-label="展开操作栏"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-xs font-medium tabular-nums transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2"
            style={{
              color: uiScheme.mutedText,
            }}
          >
            {percentage.toFixed(1)}%
          </button>
          {compactTrailingAction && (
            <>
              <span aria-hidden="true" className="h-4 w-px" style={{ background: uiScheme.cardBorder }} />
              {compactTrailingAction}
            </>
          )}
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
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-11 cursor-pointer appearance-none justify-center border-t p-0 text-left font-inherit outline-none transition-[filter] duration-150 hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-inset active:brightness-95"
      style={{
        paddingBottom: safeAreaPaddingBottom,
        background: uiScheme.cardBg,
        borderColor: uiScheme.cardBorder,
        color: uiScheme.mutedText,
      }}
    >
      <div className="grid min-h-[calc(2.75rem-1px)] w-full max-w-6xl grid-cols-[minmax(4.25rem,1fr)_minmax(0,3fr)_minmax(4.25rem,1fr)] items-center gap-2 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] text-xs font-medium sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))]">
        <span className="tabular-nums">{percentage.toFixed(1)}%</span>
        <span className="truncate text-center" style={{ color: uiScheme.fg }}>
          {currentChapter || "—"}
        </span>
        <span className="truncate text-right tabular-nums" title={currentPageLabel || undefined}>
          {currentPageLabel || "—"}
        </span>
      </div>
    </button>
  );
}
