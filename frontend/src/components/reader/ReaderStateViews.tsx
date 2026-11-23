"use client";

import { Button } from "@mantine/core";
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
  onRetry?: () => void;
  isRetrying?: boolean;
  retryLabel?: string;
}

export function ReaderErrorState({
  error,
  uiScheme,
  onBack,
  onRetry,
  isRetrying = false,
  retryLabel = "重试连接",
}: ReaderErrorStateProps) {
  return (
    <div
      className="flex h-dvh flex-col items-center justify-center gap-5 p-8"
      style={{ background: uiScheme.bg }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl border"
        style={{
          borderColor: withOpacity("#c43b2e", 0.25),
          background: withOpacity("#c43b2e", 0.08),
          color: "#c43b2e",
        }}
      >
        <span className="font-heading text-xl font-medium">!</span>
      </div>
      <div className="max-w-sm text-center">
        <p className="font-heading text-lg font-medium text-destructive">
          无法打开本书
        </p>
        <p
          className="mt-2 text-sm leading-6"
          style={{ color: uiScheme.mutedText }}
        >
          {error}
        </p>
      </div>
      {onRetry ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="h-10 rounded-lg px-5"
          >
            {isRetrying ? "正在重新连接..." : retryLabel}
          </Button>
          <Button
            onClick={onBack}
            variant="default"
            className="h-10 rounded-lg px-5"
          >
            返回书库
          </Button>
        </div>
      ) : (
        <Button
          onClick={onBack}
          variant="default"
          className="mt-1 h-10 rounded-lg px-5"
        >
          返回书库
        </Button>
      )}
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
        background: withOpacity(uiScheme.bg, 0.94),
      }}
    >
      {/* Page skeleton for perceived readiness */}
      <div
        className="pointer-events-none absolute inset-x-8 top-10 bottom-16 mx-auto max-w-2xl opacity-35 sm:inset-x-16"
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
        className="paper-reveal-soft relative z-10 flex min-w-[min(100%,260px)] max-w-sm flex-col items-center gap-4 rounded-2xl border px-7 py-7"
        style={{
          background: uiScheme.cardBg,
          borderColor: withOpacity(uiScheme.cardBorder, 0.8),
          boxShadow: `0 16px 40px -20px ${withOpacity(uiScheme.fg, 0.2)}`,
        }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl border"
          style={{
            background: withOpacity(uiScheme.buttonBg, 0.65),
            borderColor: withOpacity(uiScheme.cardBorder, 0.7),
          }}
        >
          <div
            className="h-6 w-6 animate-spin rounded-full border-2"
            style={{
              borderColor: withOpacity(uiScheme.link, 0.18),
              borderTopColor: uiScheme.link,
            }}
          />
        </div>
        <div className="text-center">
          <p
            className="text-sm font-medium"
            style={{ color: uiScheme.fg }}
          >
            {loadingMsg}
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: uiScheme.mutedText }}>
            {loadingDetail}
          </p>
        </div>
      </div>
    </div>
  );
}
