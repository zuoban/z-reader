'use client';

import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TTSPosition } from './types';

export interface TTSFloatingButtonProps {
  isActive: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isDragging: boolean;
  position: TTSPosition;
  expanded: boolean;
  placement?: 'fixed' | 'inline';
  onClick: (e: MouseEvent) => void;
  onPointerDownCapture: (e: PointerEvent<HTMLDivElement>) => void;
  panelThemeVars: CSSProperties;
}

export function TTSFloatingButton({
  isActive,
  isPlaying,
  isPaused,
  isDragging,
  position,
  expanded,
  placement = 'fixed',
  onClick,
  onPointerDownCapture,
  panelThemeVars,
}: TTSFloatingButtonProps) {
  const ActiveIconGlyph = isPlaying ? Pause : isPaused ? Play : Volume2;

  return (
    <div
      data-reader-interactive="true"
      onPointerDownCapture={onPointerDownCapture}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as MouseEvent);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={isActive ? 'TTS 控制面板（正在播放）' : 'TTS 控制面板'}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className={cn(
        'rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--reader-panel-accent)]',
        placement === 'fixed' ? 'fixed z-[60]' : 'relative z-10 shrink-0'
      )}
      style={{
        ...panelThemeVars,
        ...(placement === 'fixed'
          ? {
              right: `calc(env(safe-area-inset-right, 0px) + ${position.x}px)`,
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${position.y}px)`,
            }
          : {}),
        cursor: 'pointer',
        userSelect: 'none',
        pointerEvents: 'auto',
        opacity: isActive || isDragging || expanded ? 1 : 0.86,
      }}
      title="朗读控制"
    >
      <div
        data-active={isActive ? 'true' : undefined}
        className="reader-tts-fab motion-reduce:transition-none"
        style={{
          transform: isDragging ? 'scale(1.06)' : expanded ? 'scale(1.03)' : undefined,
        }}
      >
        <ActiveIconGlyph
          aria-hidden="true"
          className={isPaused ? 'relative ml-0.5 h-4.5 w-4.5' : 'relative h-4.5 w-4.5'}
        />
      </div>
    </div>
  );
}
