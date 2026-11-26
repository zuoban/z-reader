'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { TTSHighlightMode } from '@/lib/tts';
import { HIGHLIGHT_MODE_OPTIONS, SLEEP_TIMER_MINUTES, type TTSSleepTimer } from './types';

export interface TTSSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function TTSSection({ title, description, children }: TTSSectionProps) {
  return (
    <section
      className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
      style={{ borderColor: 'var(--reader-panel-rule)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3
            className="text-sm font-medium tracking-tight"
            style={{ color: 'var(--reader-panel-fg)' }}
          >
            {title}
          </h3>
          {description ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--reader-panel-muted)' }}>
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export interface TTSHighlightModeGroupProps {
  value: TTSHighlightMode;
  onChange: (mode: TTSHighlightMode) => void;
}

export function TTSHighlightModeGroup({ value, onChange }: TTSHighlightModeGroupProps) {
  return (
    <div
      role="group"
      aria-label="高亮方式"
      className="grid grid-cols-2 gap-2"
    >
      {HIGHLIGHT_MODE_OPTIONS.map(([mode, label]) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={cn(
              'reader-settings-option min-h-11 border px-3 py-2 text-xs lg:min-h-9',
              active && 'font-medium'
            )}
            style={active ? undefined : { borderColor: 'var(--reader-panel-rule)' }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export interface TTSSleepTimerGroupProps {
  sleepTimer?: TTSSleepTimer;
  sleepTimerActive: boolean;
  onSleepTimerMinutes?: (minutes: number) => void;
  onClearSleepTimer?: () => void;
}

export function TTSSleepTimerGroup({
  sleepTimer,
  sleepTimerActive,
  onSleepTimerMinutes,
  onClearSleepTimer,
}: TTSSleepTimerGroupProps) {
  return (
    <div
      role="group"
      aria-label="睡眠定时"
      className="grid grid-cols-4 gap-2"
    >
      {SLEEP_TIMER_MINUTES.map((minutes) => {
        const active = sleepTimer?.mode === 'minutes' && sleepTimer.minutes === minutes;
        return (
          <button
            key={minutes}
            type="button"
            aria-pressed={active}
            onClick={() => onSleepTimerMinutes?.(minutes)}
            className={cn(
              'reader-settings-option min-h-11 border text-xs tabular-nums lg:min-h-9',
              active && 'font-medium'
            )}
            style={active ? undefined : { borderColor: 'var(--reader-panel-rule)' }}
          >
            {minutes}分
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onClearSleepTimer?.()}
        disabled={!sleepTimerActive}
        className="reader-settings-option min-h-11 border text-xs lg:min-h-9"
        style={{
          borderColor: 'var(--reader-panel-rule)',
          color: 'var(--reader-panel-muted)',
        }}
      >
        取消
      </button>
    </div>
  );
}
