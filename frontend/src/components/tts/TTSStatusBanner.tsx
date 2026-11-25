'use client';

import type { PointerEvent } from 'react';
import { AlertCircle, GripVertical, Loader2, Play } from 'lucide-react';
import { withOpacity } from '@/lib/reader-ui';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import { getStatusColor, type TTSStatusInfo, type TTSStatusTone } from './types';

export interface TTSStatusBannerProps {
  ttsStatus: TTSStatusInfo;
  isActive: boolean;
  withDragHandle?: boolean;
  isDragging?: boolean;
  onDragHandlePointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerUp?: (e: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerCancel?: (e: PointerEvent<HTMLButtonElement>) => void;
}

export function TTSStatusBanner({
  ttsStatus,
  isActive,
  withDragHandle = false,
  isDragging = false,
  onDragHandlePointerDown,
  onDragHandlePointerUp,
  onDragHandlePointerCancel,
}: TTSStatusBannerProps) {
  const statusTone: TTSStatusTone = ttsStatus.tone ?? (isActive ? 'active' : 'idle');
  const statusColor = getStatusColor(statusTone);

  return (
    <div className="reader-tts-status flex items-center gap-2.5 px-3 py-2">
      <div
        role={statusTone === 'error' ? 'alert' : 'status'}
        aria-live={statusTone === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
        className="flex min-w-0 flex-1 items-center gap-2.5"
      >
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: statusColor }}
        />
        <p className="min-w-0 flex-1 text-xs font-medium leading-5 [overflow-wrap:anywhere]">
          {ttsStatus.headline}
          {ttsStatus.detail && (
            <span className="ml-2 font-normal" style={{ color: 'var(--reader-panel-muted)' }}>
              {ttsStatus.detail}
            </span>
          )}
        </p>
      </div>
      {withDragHandle && (
        <button
          type="button"
          onPointerDown={onDragHandlePointerDown}
          onPointerUp={onDragHandlePointerUp}
          onPointerCancel={onDragHandlePointerCancel}
          data-active={isDragging ? 'true' : undefined}
          data-variant={isDragging ? 'accent' : undefined}
          className="reader-panel-icon !size-7"
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          aria-label="拖动控制面板"
          title="拖动控制面板"
        >
          <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export interface TTSResumePromptProps {
  message: string;
  isResuming: boolean;
  onResume: () => void | Promise<void>;
  uiScheme: ThemeColors;
  variant: 'drawer' | 'floating';
}

export function TTSResumePrompt({
  message,
  isResuming,
  onResume,
  uiScheme,
  variant,
}: TTSResumePromptProps) {
  const isDrawer = variant === 'drawer';

  return (
    <section
      role="status"
      aria-live="polite"
      className={isDrawer ? 'rounded-xl border p-3' : 'rounded-xl border px-3.5 py-3'}
      style={{
        background: withOpacity(uiScheme.link, 0.06),
        borderColor: withOpacity(uiScheme.link, isDrawer ? 0.2 : 0.22),
      }}
    >
      <div className="flex items-center gap-3">
        {isDrawer ? (
          <div
            className="flex size-5 shrink-0 items-center justify-center"
            style={{ color: uiScheme.link }}
          >
            <AlertCircle className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: withOpacity(uiScheme.buttonBg, 0.6),
              color: uiScheme.link,
            }}
          >
            <AlertCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={isDrawer ? 'text-sm font-semibold' : 'text-[13px] font-medium'}
            style={{ color: uiScheme.fg }}
          >
            继续朗读
          </p>
          {isDrawer ? (
            <p className="mt-0.5 text-xs leading-5" style={{ color: uiScheme.mutedText }}>
              {message}
            </p>
          ) : message ? (
            <p
              className="mt-0.5 line-clamp-2 text-xs leading-5"
              style={{ color: uiScheme.mutedText }}
            >
              {message}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={isResuming}
          aria-busy={isResuming || undefined}
          onClick={() => void onResume()}
          className="reader-panel-action px-3 text-xs"
        >
          {isResuming ? (
            <Loader2
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Play aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
          )}
          <span>{isResuming ? '恢复中…' : '继续'}</span>
        </button>
      </div>
    </section>
  );
}
