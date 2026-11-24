"use client";

import { AlertCircle, ArrowLeft, RotateCw } from "lucide-react";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import {
  getModernReaderSurface,
  getReaderPanelThemeVars,
  withOpacity,
} from "@/lib/reader-ui";

interface ReaderAuthLoadingProps {
  uiScheme: ThemeColors;
}

export function ReaderAuthLoading({ uiScheme }: ReaderAuthLoadingProps) {
  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);

  return (
    <div
      className="flex h-dvh items-center justify-center px-[max(1.25rem,env(safe-area-inset-left,0px))] py-[max(1.5rem,env(safe-area-inset-top,0px))]"
      style={{ background: uiScheme.bg }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="正在验证登录"
    >
      <div
        className="reader-state-card paper-reveal-soft flex min-w-[min(100%,260px)] max-w-sm flex-col items-center gap-4 rounded-2xl px-7 py-7"
        style={panelThemeVars}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl border"
          style={{
            background: "color-mix(in srgb, var(--reader-panel-hover) 68%, transparent)",
            borderColor: "var(--reader-panel-rule)",
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
            style={{ color: surface.fg }}
          >
            验证登录…
          </p>
          <p
            className="mt-1 text-xs leading-5"
            style={{ color: surface.muted }}
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
  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);

  return (
    <div
      className="flex h-dvh items-center justify-center px-[max(1.25rem,env(safe-area-inset-left,0px))] py-[max(1.5rem,env(safe-area-inset-top,0px))]"
      style={{ background: uiScheme.bg }}
    >
      <div
        role="alert"
        className="reader-state-card paper-reveal-soft flex w-full max-w-sm flex-col items-center rounded-2xl px-6 py-7 text-center sm:px-7"
        style={panelThemeVars}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl border"
          style={{
            borderColor: "color-mix(in srgb, var(--reader-panel-danger) 28%, transparent)",
            background: "color-mix(in srgb, var(--reader-panel-danger) 10%, transparent)",
            color: "var(--reader-panel-danger)",
          }}
        >
          <AlertCircle className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </div>
        <div className="mt-4 max-w-xs">
          <p
            className="font-heading text-lg font-medium leading-snug"
            style={{ color: "var(--reader-panel-danger)" }}
          >
            无法打开本书
          </p>
          <p
            className="mt-2 text-sm leading-6"
            style={{ color: surface.muted }}
          >
            {error}
          </p>
        </div>
        {onRetry ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              aria-busy={isRetrying || undefined}
              className="reader-panel-action h-10 px-4 lg:h-10"
            >
              <RotateCw
                className={isRetrying ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <span>{isRetrying ? "正在重新连接..." : retryLabel}</span>
            </button>
            <button
              type="button"
              onClick={onBack}
              className="reader-panel-secondary h-10 px-4 lg:h-10"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
              <span>返回书库</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onBack}
            className="reader-panel-secondary mt-6 h-10 px-4 lg:h-10"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
            <span>返回书库</span>
          </button>
        )}
      </div>
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
  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);

  return (
    <div
      className="absolute z-20 flex flex-col items-center justify-center overflow-hidden px-4"
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
        className="pointer-events-none absolute inset-x-8 top-10 bottom-16 mx-auto max-w-2xl animate-pulse opacity-35 sm:inset-x-16"
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
        className="reader-state-card paper-reveal-soft relative z-10 flex min-w-[min(100%,260px)] max-w-sm flex-col items-center gap-4 rounded-2xl px-7 py-7"
        style={panelThemeVars}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl border"
          style={{
            background: "color-mix(in srgb, var(--reader-panel-hover) 68%, transparent)",
            borderColor: "var(--reader-panel-rule)",
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
            style={{ color: surface.fg }}
          >
            {loadingMsg}
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: surface.muted }}>
            {loadingDetail}
          </p>
        </div>
      </div>
    </div>
  );
}
