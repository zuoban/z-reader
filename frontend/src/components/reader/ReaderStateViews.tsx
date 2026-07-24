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
      className="flex h-dvh items-center justify-center"
      style={{ background: uiScheme.bg }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="正在验证登录"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2"
          style={{
            borderColor: withOpacity(uiScheme.fg, 0.12),
            borderTopColor: uiScheme.fg,
          }}
        />
        <div className="text-center">
          <p
            className="text-sm font-semibold tracking-wide"
            style={{ color: uiScheme.fg }}
          >
            验证登录…
          </p>
          <p
            className="mt-1.5 text-xs leading-5"
            style={{ color: uiScheme.mutedText }}
          >
            登录通过后将立即并行加载书籍
          </p>
        </div>
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
      className="flex h-dvh flex-col items-center justify-center gap-5 p-8"
      style={{ background: uiScheme.bg }}
    >
      <div
        className="flex h-16 w-14 items-center justify-center rounded-2xl border"
        style={{
          borderColor: withOpacity("#c43b2e", 0.28),
          background: withOpacity("#c43b2e", 0.08),
          color: "#c43b2e",
        }}
      >
        <span className="text-2xl font-semibold">!</span>
      </div>
      <div className="max-w-sm text-center">
        <p className="text-base font-semibold tracking-tight text-destructive">
          无法打开本书
        </p>
        <p
          className="mt-2 text-sm leading-6"
          style={{ color: uiScheme.mutedText }}
        >
          {error}
        </p>
      </div>
      <Button
        onClick={onBack}
        variant="outline"
        className="mt-1 h-11 rounded-xl px-6"
      >
        返回书库
      </Button>
    </div>
  );
}

interface ReaderLoadingOverlayProps {
  loadingMsg: string;
  loadingDetail?: string;
  readerContentInsetTop: string;
  statusBarReservedSpace: string;
  uiScheme: ThemeColors;
}

export function ReaderLoadingOverlay({
  loadingMsg,
  loadingDetail = "引擎、书籍与进度并行准备中",
  readerContentInsetTop,
  statusBarReservedSpace,
  uiScheme,
}: ReaderLoadingOverlayProps) {
  return (
    <div
      className="absolute z-20 flex flex-col items-center justify-center overflow-hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={loadingMsg}
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
      {/* Page skeleton for perceived readiness */}
      <div
        className="pointer-events-none absolute inset-x-8 top-10 bottom-16 mx-auto max-w-2xl opacity-40 sm:inset-x-16"
        aria-hidden="true"
      >
        <div
          className="mb-6 h-3 w-1/3 rounded-full"
          style={{ background: withOpacity(uiScheme.fg, 0.08) }}
        />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="mb-3 h-2.5 rounded-full"
            style={{
              width: `${72 + ((i * 13) % 28)}%`,
              background: withOpacity(uiScheme.fg, 0.06 + (i % 3) * 0.015),
            }}
          />
        ))}
      </div>

      <div
        className="paper-reveal-soft paper-panel paper-stack relative z-10 flex min-w-[min(100%,280px)] max-w-sm flex-col items-center gap-4 rounded-[1.75rem] border px-8 py-8"
        style={{
          background: `
            linear-gradient(145deg, ${withOpacity(uiScheme.fg, 0.05)} 0%, transparent 40%),
            ${withOpacity(uiScheme.cardBg, 0.92)}
          `,
          borderColor: withOpacity(uiScheme.cardBorder, 0.72),
          boxShadow: `
            0 24px 56px -28px ${withOpacity(uiScheme.fg, 0.22)},
            inset 0 1px 0 rgba(255,255,255,0.38)
          `,
        }}
      >
        <div
          className="flex h-[4.5rem] w-14 items-center justify-center rounded-[1.15rem] border"
          style={{
            background: withOpacity(uiScheme.buttonBg, 0.55),
            borderColor: withOpacity(uiScheme.cardBorder, 0.65),
          }}
        >
          <div
            className="h-9 w-9 animate-spin rounded-full border-2"
            style={{
              borderColor: withOpacity(uiScheme.link, 0.18),
              borderTopColor: uiScheme.link,
            }}
          />
        </div>
        <div className="text-center">
          <p
            className="text-sm font-semibold tracking-tight"
            style={{ color: uiScheme.fg }}
          >
            {loadingMsg}
          </p>
          <p className="mt-1.5 text-xs leading-5" style={{ color: uiScheme.mutedText }}>
            {loadingDetail}
          </p>
        </div>
      </div>
    </div>
  );
}
