'use client';

import type { ReactNode } from 'react';
import { ActionIcon } from '@mantine/core';
import { Loader2, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RATE_OPTIONS } from './types';

export interface TTSControlButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: ReactNode;
  active?: boolean;
  variant?: 'default' | 'danger' | 'accent';
}

export function TTSControlButton({
  onClick,
  disabled,
  title,
  children,
  active,
  variant,
}: TTSControlButtonProps) {
  return (
    <ActionIcon
      type="button"
      variant="subtle"
      size={44}
      radius="md"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      data-active={active ? 'true' : undefined}
      data-variant={variant && variant !== 'default' ? variant : undefined}
      className="reader-panel-icon"
    >
      {children}
    </ActionIcon>
  );
}

export interface TTSPlaybackButtonsProps {
  isActive: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isBusy: boolean;
  onPrev: () => void | Promise<void>;
  onStartClick: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  onStopClick: () => void;
}

export function TTSPlaybackButtons({
  isActive,
  isPlaying,
  isPaused,
  isBusy,
  onPrev,
  onStartClick,
  onNext,
  onStopClick,
}: TTSPlaybackButtonsProps) {
  const primaryLabel = isPlaying ? '暂停' : isPaused ? '继续' : '开始';
  const iconSizeClass = 'h-4 w-4';

  return (
    <div className="flex items-center justify-center gap-2.5">
      <TTSControlButton
        onClick={() => void onPrev()}
        disabled={!isActive || isBusy}
        title="上一句"
        active={isActive}
      >
        <SkipBack className="h-5 w-5" aria-hidden="true" />
      </TTSControlButton>

      <div className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={() => void onStartClick()}
          disabled={isBusy}
          aria-busy={isBusy || undefined}
          data-playing={isPlaying ? 'true' : undefined}
          title={primaryLabel}
          aria-label={primaryLabel}
          className="reader-tts-primary size-12"
        >
          {isBusy ? (
            <Loader2
              aria-hidden="true"
              className={cn(iconSizeClass, 'animate-spin motion-reduce:animate-none')}
            />
          ) : isPaused ? (
            <Play aria-hidden="true" className={cn('ml-0.5 fill-current', iconSizeClass)} />
          ) : isPlaying ? (
            <Pause aria-hidden="true" className={cn('fill-current', iconSizeClass)} />
          ) : (
            <Play aria-hidden="true" className={cn('ml-0.5 fill-current', iconSizeClass)} />
          )}
        </button>
      </div>

      <TTSControlButton
        onClick={() => void onNext()}
        disabled={!isActive || isBusy}
        title="下一句"
        active={isActive}
      >
        <SkipForward className="h-5 w-5" aria-hidden="true" />
      </TTSControlButton>

      <TTSControlButton
        onClick={onStopClick}
        disabled={!isActive && !isBusy}
        title="停止"
        active={isActive || isBusy}
        variant="danger"
      >
        <Square className="h-5 w-5" aria-hidden="true" />
      </TTSControlButton>
    </div>
  );
}

export interface TTSRateButtonsProps {
  value: number;
  onChange: (value: number) => void;
}

export function TTSRateButtons({ value, onChange }: TTSRateButtonsProps) {
  return (
    <div role="group" aria-label="朗读倍速" className="grid grid-cols-5 gap-1.5">
      {RATE_OPTIONS.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'reader-settings-option min-h-11 border px-0.5 text-xs tabular-nums lg:min-h-9',
              active && 'font-medium'
            )}
            style={active ? undefined : { borderColor: 'var(--reader-panel-rule)' }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
