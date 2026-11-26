'use client';

import { AlertCircle, Loader2, Play } from 'lucide-react';
import { withOpacity } from '@/lib/reader-ui';
import { cn } from '@/lib/utils';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import { getStatusColor, type TTSStatusInfo, type TTSStatusTone } from './types';

export interface TTSStatusBannerProps {
  ttsStatus: TTSStatusInfo;
  isActive: boolean;
}

export function TTSStatusBanner({
  ttsStatus,
  isActive,
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
          className={cn(
            'size-2 shrink-0 rounded-full',
            statusTone === 'active' && 'animate-pulse motion-reduce:animate-none'
          )}
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
    </div>
  );
}

export interface TTSResumePromptProps {
  message: string;
  isResuming: boolean;
  onResume: () => void | Promise<void>;
  uiScheme: ThemeColors;
}

export function TTSResumePrompt({
  message,
  isResuming,
  onResume,
  uiScheme,
}: TTSResumePromptProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-xl border p-3"
      style={{
        background: withOpacity(uiScheme.link, 0.06),
        borderColor: withOpacity(uiScheme.link, 0.2),
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex size-5 shrink-0 items-center justify-center"
          style={{ color: uiScheme.link }}
        >
          <AlertCircle className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-semibold"
            style={{ color: uiScheme.fg }}
          >
            继续朗读
          </p>
          <p className="mt-0.5 text-xs leading-5" style={{ color: uiScheme.mutedText }}>
            {message}
          </p>
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
