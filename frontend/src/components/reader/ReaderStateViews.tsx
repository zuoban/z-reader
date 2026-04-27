"use client";

import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import { withOpacity } from "@/lib/reader-ui";

interface ReaderAuthLoadingProps {
  uiScheme: ThemeColors;
}

export function ReaderAuthLoading({ uiScheme }: ReaderAuthLoadingProps) {
  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ background: uiScheme.bg }}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2"
          style={{
            borderColor: `${uiScheme.fg}20`,
            borderTopColor: uiScheme.fg,
          }}
        />
        <p className="text-sm font-medium" style={{ color: uiScheme.mutedText }}>
          加载中...
        </p>
      </div>
    </div>
  );
}

interface ReaderErrorStateProps {
  error: string;
  uiScheme: ThemeColors;
  onBack: () => void;
}

export function ReaderErrorState({
  error,
  uiScheme,
  onBack,
}: ReaderErrorStateProps) {
  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-4 p-8"
      style={{ background: uiScheme.bg }}
    >
      <div className="flex h-20 w-16 items-center justify-center rounded border-2 border-destructive/30 bg-destructive/5">
        <span className="text-2xl font-semibold text-destructive">!</span>
      </div>
      <p className="text-base font-medium text-destructive">{error}</p>
      <Button onClick={onBack} variant="outline" className="mt-2">
        返回书库
      </Button>
    </div>
  );
}

interface ReaderLoadingOverlayProps {
  loadingMsg: string;
  readerContentInsetTop: string;
  statusBarReservedSpace: string;
  uiScheme: ThemeColors;
}

export function ReaderLoadingOverlay({
  loadingMsg,
  readerContentInsetTop,
  statusBarReservedSpace,
  uiScheme,
}: ReaderLoadingOverlayProps) {
  return (
    <div
      className="absolute z-20 flex flex-col items-center justify-center"
      style={{
        top: readerContentInsetTop,
        right: 0,
        bottom: statusBarReservedSpace,
        left: 0,
        background: `
          linear-gradient(180deg, ${withOpacity(uiScheme.bg, 0.88)} 0%, ${withOpacity(uiScheme.cardBg, 0.94)} 100%)
        `,
      }}
    >
      <div
        className="paper-reveal-soft paper-panel paper-stack flex min-w-[240px] flex-col items-center gap-4 rounded-[2rem] border px-8 py-8"
        style={{
          background: uiScheme.cardBg,
          borderColor: withOpacity(uiScheme.cardBorder, 0.78),
          boxShadow: `0 24px 56px -28px ${withOpacity(uiScheme.cardBorder, 0.3)}, inset 0 1px 0 rgba(255,255,255,0.42)`,
        }}
      >
        <div
          className="flex h-20 w-16 items-center justify-center rounded-[1.25rem] border"
          style={{
            background: withOpacity(uiScheme.buttonBg, 0.52),
            borderColor: withOpacity(uiScheme.cardBorder, 0.72),
          }}
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-2"
            style={{
              borderColor: withOpacity(uiScheme.link, 0.2),
              borderTopColor: uiScheme.link,
            }}
          />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium tracking-tight" style={{ color: uiScheme.fg }}>
            {loadingMsg}
          </p>
          <p className="mt-1 text-xs" style={{ color: uiScheme.mutedText }}>
            正在准备阅读环境与书籍内容
          </p>
        </div>
      </div>
    </div>
  );
}
