'use client';

import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from 'react';
import { ActionIcon, Drawer, UnstyledButton } from '@mantine/core';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  Loader2,
  X,
} from 'lucide-react';
import { VoiceSelector } from '@/components/VoiceSelector';
import { getModernReaderSurface, getReaderPanelThemeVars, withOpacity } from '@/lib/reader-ui';
import { cn } from '@/lib/utils';
import type { TTSHighlightMode, TTSState, TTSSettings, Voice } from '@/lib/tts';
import type { ThemeColors } from '@/hooks/useReaderTheme';

const getTriggerSurface = (uiScheme: ThemeColors, active: boolean) => ({
  background: uiScheme.cardBg,
  border: `1px solid ${active ? uiScheme.link : uiScheme.cardBorder}`,
  boxShadow: 'var(--paper-shadow-control)',
});

const FAB_SIZE = 52;
const FLOATING_IDLE_DOCK_DELAY_MS = 3600;
const FLOATING_DOCK_RIGHT = 0;
const FLOATING_VIEWPORT_MARGIN = 12;
const FLOATING_PANEL_FOOTER_PADDING = 12;

// 悬浮按钮组件
interface FloatingButtonProps {
  isActive: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isDragging: boolean;
  position: { x: number; y: number };
  expanded: boolean;
  placement?: 'fixed' | 'inline';
  onClick: (e: React.MouseEvent) => void;
  onPointerDownCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
  panelThemeVars: CSSProperties;
}

const FloatingButton = ({
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
}: FloatingButtonProps) => {
  const ActiveIconGlyph = isPlaying ? Pause : isPaused ? Play : Volume2;

  return (
    <div
      data-reader-interactive="true"
      onPointerDownCapture={onPointerDownCapture}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={isActive ? 'TTS 控制面板（正在播放）' : 'TTS 控制面板'}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className={cn(
        'rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--reader-panel-accent)]',
        placement === 'fixed' ? 'fixed z-[60]' : 'relative z-10 shrink-0',
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
};

const RATE_OPTIONS = [
  { label: '1倍', value: 0 },
  { label: '1.25倍', value: 25 },
  { label: '1.5倍', value: 50 },
  { label: '1.75倍', value: 75 },
  { label: '2倍', value: 100 },
] as const;

interface RateButtonsProps {
  value: number;
  onChange: (value: number) => void;
}

const RateButtons = ({ value, onChange }: RateButtonsProps) => (
  <div
    role="group"
    aria-label="朗读倍速"
    className="grid grid-cols-5 gap-1.5"
  >
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
            active && 'font-medium',
          )}
          style={active ? undefined : { borderColor: 'var(--reader-panel-rule)' }}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

const TTSSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
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
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--reader-panel-muted)' }}
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>
    {children}
  </section>
);

// 复用的控制按钮
interface ControlButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  variant?: 'default' | 'danger' | 'accent';
}

const ControlButton = ({ onClick, disabled, title, children, active, variant }: ControlButtonProps) => (
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

export interface TTSControlsProps {
  state: TTSState;
  preparing?: boolean;
  settings: TTSSettings;
  voices: Voice[];
  voicesLoading?: boolean;
  voicesError?: string | null;
  onReloadVoices?: () => void | Promise<void>;
  onStart: () => void | Promise<void>;
  onStop: () => void;
  onNext: () => void | Promise<void>;
  onPrev: () => void | Promise<void>;
  onUpdateSettings: (settings: Partial<TTSSettings>) => void;
  onPreviewStart?: () => void;
  uiScheme: ThemeColors;
  variant?: 'floating' | 'toolbar';
  triggerContent?: ReactNode;
  triggerClassName?: string;
  triggerStyle?: React.CSSProperties;
  onExpandedChange?: (expanded: boolean) => void;
  showSettingsPanel?: boolean;
  resumePromptVisible?: boolean;
  resumePromptMessage?: string;
  onResume?: () => void | Promise<void>;
  overlayContainer?: HTMLElement | null;
  ttsStatus?: {
    headline: string;
    detail?: string;
    tone?: 'idle' | 'active' | 'warning' | 'error';
  };
  sleepTimer?: {
    mode: 'off' | 'minutes';
    minutes?: number;
    endsAt?: number;
    label: string;
  };
  onSleepTimerMinutes?: (minutes: number) => void;
  onClearSleepTimer?: () => void;
  initialExpanded?: boolean;
}

export function TTSControls({
  state,
  preparing = false,
  settings,
  voices,
  voicesLoading = false,
  voicesError = null,
  onReloadVoices,
  onStart,
  onStop,
  onNext,
  onPrev,
  onUpdateSettings,
  onPreviewStart,
  uiScheme,
  variant = 'floating',
  triggerContent,
  triggerClassName,
  triggerStyle,
  onExpandedChange,
  showSettingsPanel = true,
  resumePromptVisible = false,
  resumePromptMessage = '朗读被系统中断，轻触即可继续。',
  onResume,
  overlayContainer,
  ttsStatus,
  sleepTimer,
  onSleepTimerMinutes,
  onClearSleepTimer,
  initialExpanded = false,
}: TTSControlsProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const operationRef = useRef(0);
  const pendingRef = useRef(false);
  const resumingRef = useRef(false);
  const mountedRef = useRef(true);
  const isBusy = isPending || preparing;
  const [position, setPosition] = useState({ x: 22, y: 12 });
  const [isDragging, setIsDragging] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number }>({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  });
  const positionRef = useRef(position);
  const isDraggingRef = useRef(false);
  const draggingPointerIdRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const autoDockTimerRef = useRef<number | null>(null);

  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);
  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const isActive = state !== 'stopped';
  const isToolbar = variant === 'toolbar';
  const isVoiceDropdownOpen = expanded && voiceDropdownOpen;
  // 检测用户是否偏好减少动画
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mediaQuery.matches;
    const handler = (e: MediaQueryListEvent) => prefersReducedMotion.current = e.matches;
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const syncViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  const handleStartClick = async () => {
    if (pendingRef.current || preparing) return;
    const operation = ++operationRef.current;
    pendingRef.current = true;
    const shouldCloseAfterStart = !isPlaying;
    setIsPending(true);
    try {
      await onStart();
      if (operation === operationRef.current && shouldCloseAfterStart) {
        setExpanded(false);
      }
    } finally {
      if (operation === operationRef.current) {
        pendingRef.current = false;
        setIsPending(false);
      }
    }
  };

  const handleStopClick = () => {
    operationRef.current += 1;
    pendingRef.current = false;
    setIsPending(false);
    onStop();
  };

  const handleResumeClick = async () => {
    if (resumingRef.current || !onResume) return;
    resumingRef.current = true;
    setIsResuming(true);
    try {
      await onResume();
    } finally {
      resumingRef.current = false;
      if (mountedRef.current) {
        setIsResuming(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
    };
  }, []);

  const commitPosition = useCallback((nextPosition: { x: number; y: number }) => {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);

  const clearAutoDockTimer = useCallback(() => {
    if (autoDockTimerRef.current) {
      window.clearTimeout(autoDockTimerRef.current);
      autoDockTimerRef.current = null;
    }
  }, []);

  const dockFloatingButton = useCallback(() => {
    const nextPosition = {
      x: FLOATING_DOCK_RIGHT,
      y: Math.min(
        Math.max(positionRef.current.y, 0),
        Math.max(window.innerHeight - FAB_SIZE, 0)
      ),
    };
    commitPosition(nextPosition);
  }, [commitPosition]);

  const getDragSurfaceSize = useCallback(() => {
    if (!expanded) {
      return { width: FAB_SIZE, height: FAB_SIZE };
    }

    return {
      width: Math.min(364, Math.max(window.innerWidth - 28, 280)),
      height: Math.min(window.innerHeight * 0.72, 720),
    };
  }, [expanded]);

  const scheduleAutoDock = useCallback(() => {
    clearAutoDockTimer();
    if (isToolbar || expanded || isDraggingRef.current) return;

    autoDockTimerRef.current = window.setTimeout(() => {
      if (expanded || isDraggingRef.current) return;
      dockFloatingButton();
    }, FLOATING_IDLE_DOCK_DELAY_MS);
  }, [clearAutoDockTimer, dockFloatingButton, expanded, isToolbar]);

  const clampPosition = useCallback((clientX: number, clientY: number) => {
    const deltaX = clientX - dragRef.current.startX;
    const deltaY = clientY - dragRef.current.startY;
    const threshold = prefersReducedMotion.current ? 1 : 2;
    const dragSurfaceSize = getDragSurfaceSize();

    if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
      hasDraggedRef.current = true;
      suppressClickRef.current = true;
    }

    return {
      x: Math.max(
        0,
        Math.min(
          Math.max(window.innerWidth - dragSurfaceSize.width - FLOATING_VIEWPORT_MARGIN, 0),
          dragRef.current.startPosX - deltaX
        )
      ),
      y: Math.max(
        0,
        Math.min(
          Math.max(window.innerHeight - dragSurfaceSize.height - FLOATING_VIEWPORT_MARGIN, 0),
          dragRef.current.startPosY - deltaY
        )
      ),
    };
  }, [getDragSurfaceSize]);

  const stopDragging = useCallback(() => {
    if (!isDraggingRef.current) return;
    draggingPointerIdRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);
    scheduleAutoDock();
  }, [scheduleAutoDock]);

  const startDragging = useCallback((clientX: number, clientY: number, pointerId?: number) => {
    clearAutoDockTimer();
    draggingPointerIdRef.current = pointerId ?? null;
    hasDraggedRef.current = false;
    suppressClickRef.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      startPosX: positionRef.current.x,
      startPosY: positionRef.current.y,
    };
  }, [clearAutoDockTimer]);

  const handleDragHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startDragging(e.clientX, e.clientY, e.pointerId);
  };

  const handleDragHandlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopDragging();
  };

  const handleDragHandlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopDragging();
    hasDraggedRef.current = false;
    suppressClickRef.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      hasDraggedRef.current = false;
      scheduleAutoDock();
      return;
    }
    // 仅当点击目标是 FloatingButton 本身（或其子元素但不是弹出面板内）时才切换
    if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
      return;
    }
    clearAutoDockTimer();
    setExpanded((value) => !value);
  };

  const stopInteractivePropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    scheduleAutoDock();
  };

  const handleRateChange = (value: number) => {
    onUpdateSettings({ rate: value });
  };

  const handleHighlightModeChange = (highlightMode: TTSHighlightMode) => {
    onUpdateSettings({ highlightMode });
  };

  const statusTone = ttsStatus?.tone ?? (isActive ? 'active' : 'idle');
  const statusColor =
    statusTone === 'error'
      ? 'var(--reader-panel-danger)'
      : statusTone === 'warning'
        ? 'var(--reader-panel-warning)'
        : statusTone === 'active'
          ? 'var(--reader-panel-accent)'
          : 'var(--reader-panel-muted)';
  const sleepTimerActive = sleepTimer?.mode && sleepTimer.mode !== 'off';
  const closePanel = useCallback(() => {
    setExpanded(false);
  }, []);

  const preserveReaderSelection = (event: React.PointerEvent) => {
    event.preventDefault();
  };

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    if (!expanded) {
      queueMicrotask(() => {
        setDetailsExpanded(false);
      });
    }
  }, [expanded]);

  useEffect(() => {
    scheduleAutoDock();
    return clearAutoDockTimer;
  }, [clearAutoDockTimer, scheduleAutoDock]);

  useEffect(() => {
    if (!isDragging) return;

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (
        draggingPointerIdRef.current !== null &&
        event.pointerId !== draggingPointerIdRef.current
      ) {
        return;
      }

      event.preventDefault();
      commitPosition(clampPosition(event.clientX, event.clientY));
    };

    const handleWindowPointerEnd = (event: PointerEvent) => {
      if (
        draggingPointerIdRef.current !== null &&
        event.pointerId !== draggingPointerIdRef.current
      ) {
        return;
      }

      stopDragging();
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerEnd);
    window.addEventListener('pointercancel', handleWindowPointerEnd);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
    };
  }, [clampPosition, commitPosition, isDragging, stopDragging]);

  useEffect(() => {
    if (!expanded || isToolbar) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        isVoiceDropdownOpen
      ) {
        return;
      }
      event.preventDefault();
      setExpanded(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded, isToolbar, isVoiceDropdownOpen]);

  const floatingPopupWidth = Math.min(364, Math.max(viewport.width - 28, 280));
  const floatingPopupMaxHeight = Math.min(viewport.height * 0.72, 720);
  const maxPopupRight = Math.max(
    0,
    viewport.width - floatingPopupWidth - FLOATING_VIEWPORT_MARGIN
  );
  const maxPopupBottom = Math.max(
    0,
    viewport.height - floatingPopupMaxHeight - FLOATING_VIEWPORT_MARGIN
  );

  const floatingPopupStyle = {
    right: `calc(env(safe-area-inset-right, 0px) + ${
      Math.min(
        maxPopupRight,
        Math.max(position.x - FLOATING_PANEL_FOOTER_PADDING, 0)
      )
    }px)`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${
      Math.min(
        maxPopupBottom,
        Math.max(position.y - FLOATING_PANEL_FOOTER_PADDING, 0)
      )
    }px)`,
    width: `${floatingPopupWidth}px`,
    maxHeight: `${floatingPopupMaxHeight}px`,
  } as const;

  const toolbarPopupStyle = {
    width: 'min(364px, calc(100vw - 24px))',
    maxHeight: 'min(72vh, 720px)',
  } as const;
  const panelBodyMaxHeight = isToolbar
    ? 'calc(min(72vh, 720px) - 72px)'
    : `${floatingPopupMaxHeight - 120}px`;

  const renderStatusContent = (withDragHandle = false) => ttsStatus ? (
    <div className="reader-tts-status flex items-center gap-2.5 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
          onPointerDown={handleDragHandlePointerDown}
          onPointerUp={handleDragHandlePointerUp}
          onPointerCancel={handleDragHandlePointerCancel}
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
  ) : null;

  if (isToolbar) {
    const triggerLabel = isActive ? '朗读控制（正在播放）' : '朗读控制';
    const resolvedTriggerStyle = {
      ...(
        triggerStyle ?? {
          color: isActive ? uiScheme.link : uiScheme.buttonText,
          ...getTriggerSurface(uiScheme, isActive),
        }
      ),
      opacity: isBusy ? 0.72 : 1,
    };

    return (
      <>
        {triggerContent ? (
          <UnstyledButton
            type="button"
            data-reader-interactive="true"
            data-reader-tts-trigger="true"
            data-reader-tts-active={isActive ? 'true' : undefined}
            title={triggerLabel}
            aria-label={triggerLabel}
            aria-expanded={expanded}
            aria-haspopup="dialog"
            onClick={() => setExpanded((value) => !value)}
            className={
              triggerClassName ??
              'relative z-40 inline-flex shrink-0 items-center justify-center rounded-lg border px-2.5 align-middle transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2'
            }
            style={resolvedTriggerStyle}
          >
            {triggerContent}
          </UnstyledButton>
        ) : (
          <ActionIcon
            type="button"
            variant="subtle"
            size={44}
            radius="md"
            data-reader-interactive="true"
            data-reader-tts-trigger="true"
            data-reader-tts-active={isActive ? 'true' : undefined}
            title={triggerLabel}
            aria-label={triggerLabel}
            aria-expanded={expanded}
            aria-haspopup="dialog"
            onClick={() => setExpanded((value) => !value)}
            className={cn(
              'min-h-0 min-w-0',
              triggerClassName ??
                'relative z-40 inline-flex size-11 shrink-0 items-center justify-center rounded-lg border p-0 align-middle transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2'
            )}
            style={resolvedTriggerStyle}
          >
            <Volume2 className="relative z-10 h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        )}

        <Drawer.Root
          opened={expanded}
          onClose={() => setExpanded(false)}
          closeOnEscape={!isVoiceDropdownOpen}
          position="bottom"
          size="auto"
          padding={0}
          zIndex={90}
          returnFocus={false}
          portalProps={{ target: overlayContainer ?? undefined }}
          classNames={{
            inner:
              'items-end justify-center pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]',
            content:
              'reader-panel flex max-h-[min(42rem,calc(100svh-1.5rem))] w-full flex-col overflow-hidden rounded-2xl border p-0 sm:max-h-[min(78svh,42rem)] sm:w-[480px] sm:max-w-[calc(100vw-2rem)]',
          }}
          styles={{
            content: {
              ...panelThemeVars,
              flex: '0 1 auto',
              height: 'auto',
              background: uiScheme.cardBg,
              borderColor: surface.border,
              color: surface.fg,
              boxShadow: 'var(--paper-shadow-floating)',
            },
          }}
        >
          <Drawer.Overlay backgroundOpacity={0.42} blur={3} />
          <Drawer.Content
            data-reader-interactive="true"
            data-reader-tts-popup="true"
          >
            <div className="reader-panel-header shrink-0 bg-transparent px-4 py-3.5 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Drawer.Title
                    className="font-heading text-lg font-medium leading-tight"
                    style={{ color: 'var(--reader-panel-fg)' }}
                  >
                    朗读控制
                  </Drawer.Title>
                  <p className="sr-only">
                    播放、调整倍速与设置睡眠定时
                  </p>
                </div>
                <ActionIcon
                  type="button"
                  variant="subtle"
                  size={44}
                  radius="md"
                  onClick={() => setExpanded(false)}
                  className="reader-panel-icon"
                  aria-label="关闭朗读控制"
                  title="关闭"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </ActionIcon>
              </div>
            </div>

            <div className="reader-panel-body custom-scrollbar space-y-4 px-4 py-4 sm:px-6">
              {resumePromptVisible && (
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
                      style={{
                        color: uiScheme.link,
                      }}
                    >
                      <AlertCircle className="h-4.5 w-4.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold" style={{ color: uiScheme.fg }}>
                        继续朗读
                      </p>
                      <p className="mt-0.5 text-xs leading-5" style={{ color: uiScheme.mutedText }}>
                        {resumePromptMessage}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isResuming}
                      aria-busy={isResuming || undefined}
                      onClick={() => void handleResumeClick()}
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
              )}

              {ttsStatus ? renderStatusContent() : null}

              <TTSSection
                title="播放控制"
                description="从当前位置开始、暂停或切换到相邻句子。"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2.5">
                    <ControlButton
                      onClick={onPrev}
                      disabled={!isActive || isBusy}
                      title="上一句"
                      active={isActive}
                    >
                      <SkipBack className="h-5 w-5" aria-hidden="true" />
                    </ControlButton>

                    <div className="relative flex items-center justify-center">
                      <button
                        type="button"
                        onClick={handleStartClick}
                        disabled={isBusy}
                        aria-busy={isBusy || undefined}
                        data-playing={isPlaying ? 'true' : undefined}
                        title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                        aria-label={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                        className="reader-tts-primary size-12"
                      >
                        {isBusy ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                        ) : isPaused ? (
                          <Play aria-hidden="true" className="ml-0.5 h-4 w-4 fill-current" />
                        ) : isPlaying ? (
                          <Pause aria-hidden="true" className="h-4 w-4 fill-current" />
                        ) : (
                          <Play aria-hidden="true" className="ml-0.5 h-4 w-4 fill-current" />
                        )}
                      </button>
                    </div>

                    <ControlButton
                      onClick={onNext}
                      disabled={!isActive || isBusy}
                      title="下一句"
                      active={isActive}
                    >
                      <SkipForward className="h-5 w-5" aria-hidden="true" />
                    </ControlButton>

                    <ControlButton
                      onClick={handleStopClick}
                      disabled={!isActive && !isBusy}
                      title="停止"
                      active={isActive || isBusy}
                      variant="danger"
                    >
                      <Square className="h-5 w-5" aria-hidden="true" />
                    </ControlButton>
                  </div>

                  <RateButtons
                    value={settings.rate}
                    onChange={handleRateChange}
                  />
                </div>
              </TTSSection>

              <TTSSection
                title="高亮方式"
                description="选择朗读时跟随词语或整句。"
              >
                <div role="group" aria-label="高亮方式" className="grid grid-cols-2 gap-2">
                  {([
                    ['word', '词语'],
                    ['sentence', '句子'],
                  ] as const).map(([mode, label]) => {
                    const active = settings.highlightMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleHighlightModeChange(mode)}
                        aria-pressed={active}
                        className={cn(
                          'reader-settings-option min-h-11 border px-3 py-2 text-xs lg:min-h-9',
                          active && 'font-medium',
                        )}
                        style={active ? undefined : { borderColor: 'var(--reader-panel-rule)' }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </TTSSection>

              <TTSSection
                title="睡眠定时"
                description={sleepTimerActive ? sleepTimer?.label : '到点自动停止，适合睡前阅读。'}
              >
                <div role="group" aria-label="睡眠定时" className="grid grid-cols-4 gap-2">
                  {[15, 30, 60].map((minutes) => {
                    const active = sleepTimer?.mode === 'minutes' && sleepTimer.minutes === minutes;
                    return (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => onSleepTimerMinutes?.(minutes)}
                        aria-pressed={active}
                        className={cn(
                          'reader-settings-option min-h-11 border text-xs tabular-nums lg:min-h-9',
                          active && 'font-medium',
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
              </TTSSection>

              {showSettingsPanel && (
                <TTSSection
                  title="语音偏好"
                  description="选择发音人、情绪风格与输出声音。"
                >
                  <VoiceSelector
                    settings={settings}
                    voices={voices}
                    voicesLoading={voicesLoading}
                    voicesError={voicesError}
                    onReloadVoices={onReloadVoices}
                    onUpdateSettings={onUpdateSettings}
                    onPreviewStart={onPreviewStart}
                    onDropdownOpenChange={setVoiceDropdownOpen}
                    uiScheme={uiScheme}
                    overlayContainer={overlayContainer}
                  />
                </TTSSection>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Root>
      </>
    );
  }

  return (
    <>
      {expanded && (
        <button
          type="button"
          aria-label="关闭朗读控制弹层"
          className="fixed inset-0 z-[59] cursor-default bg-transparent"
          onPointerDown={preserveReaderSelection}
          onClick={closePanel}
        />
      )}

      <div
        ref={rootRef}
        className={`relative ${isToolbar ? 'z-40' : ''}`}
        style={{ pointerEvents: 'auto' }}
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {isBusy ? '正在准备朗读' : isActive ? (isPlaying ? '正在朗读' : isPaused ? '已暂停' : '待开始') : '朗读已停止'}
        </div>
        {isToolbar ? (
          <ActionIcon
            variant="subtle"
            size={44}
            radius="md"
            data-reader-interactive="true"
            data-reader-tts-trigger="true"
            onClick={handleClick}
            type="button"
            title={isActive ? '朗读控制（正在播放）' : '朗读控制'}
            aria-label={isActive ? '朗读控制（正在播放）' : '朗读控制'}
            aria-expanded={expanded}
            aria-haspopup="dialog"
            className={cn(
              'min-h-0 min-w-0',
              triggerClassName ??
                'relative z-40 inline-flex size-11 shrink-0 items-center justify-center rounded-lg border p-0 align-middle transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2'
            )}
            style={{
              ...(
                triggerStyle ?? {
                  color: isActive ? uiScheme.link : uiScheme.buttonText,
                  ...getTriggerSurface(uiScheme, isActive),
                }
              ),
              opacity: isBusy ? 0.72 : 1,
            }}
          >
            <Volume2 className="relative z-10 h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        ) : (
          !expanded && (
            <FloatingButton
              isActive={isActive}
              isPlaying={isPlaying}
              isPaused={isPaused}
              isDragging={isDragging}
              position={position}
              expanded={expanded}
              onClick={handleClick}
              onPointerDownCapture={stopInteractivePropagation}
              panelThemeVars={panelThemeVars}
            />
          )
        )}

        {expanded && (
          <div
            data-reader-interactive="true"
            data-reader-tts-popup="true"
            role="dialog"
            aria-modal="false"
            aria-label={showSettingsPanel ? '朗读控制与偏好' : '朗读控制'}
            className={
              isToolbar
                ? 'paper-reveal-soft fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+4.9rem)] z-[70] origin-top sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:origin-top-right'
                : 'paper-reveal-soft fixed z-[70] origin-bottom-right'
            }
            style={{
              ...panelThemeVars,
              ...(isToolbar ? toolbarPopupStyle : floatingPopupStyle),
            }}
            onClick={stopInteractivePropagation}
          >
            <div
              className="paper-motion-surface paper-stack relative overflow-hidden rounded-xl border p-0 motion-reduce:transition-none"
              style={{
                background: uiScheme.cardBg,
                borderColor: surface.border,
                color: surface.fg,
                boxShadow: 'var(--paper-shadow-floating)',
              }}
            >
              {!isToolbar && (
                <div
                  className="pointer-events-none absolute bottom-[-8px] right-5 h-4 w-4 rotate-45 border-r border-b"
                  style={{
                    background: 'var(--reader-panel-bg)',
                    borderColor: 'var(--reader-panel-border)',
                  }}
                />
              )}

              <div className="reader-panel-header flex items-center justify-between gap-3 px-4 py-3.5">
                <p
                  className="font-heading text-lg font-medium leading-tight"
                  style={{ color: 'var(--reader-panel-fg)' }}
                >
                  朗读控制
                </p>
                <ActionIcon
                  type="button"
                  variant="subtle"
                  size={44}
                  radius="md"
                  onPointerDown={preserveReaderSelection}
                  onClick={closePanel}
                  className="reader-panel-icon"
                  aria-label="关闭朗读控制面板"
                  title="关闭"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </ActionIcon>
              </div>

              <div
                className="custom-scrollbar space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-3"
                style={{ maxHeight: panelBodyMaxHeight }}
              >
                {resumePromptVisible && (
                  <section
                    role="status"
                    aria-live="polite"
                    className="rounded-xl border px-3.5 py-3"
                    style={{
                      background: withOpacity(uiScheme.link, 0.06),
                      borderColor: withOpacity(uiScheme.link, 0.22),
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          background: withOpacity(uiScheme.buttonBg, 0.6),
                          color: uiScheme.link,
                        }}
                      >
                        <AlertCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium" style={{ color: uiScheme.fg }}>
                          继续朗读
                        </p>
                        {resumePromptMessage ? (
                          <p
                            className="mt-0.5 line-clamp-2 text-xs leading-5"
                            style={{ color: uiScheme.mutedText }}
                          >
                            {resumePromptMessage}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={isResuming}
                        aria-busy={isResuming || undefined}
                        onClick={() => void handleResumeClick()}
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
                )}

                {isToolbar && ttsStatus && !detailsExpanded && <div>{renderStatusContent()}</div>}

                <div className="flex flex-col gap-4 px-1 py-1">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h3
                      className="text-xs font-medium"
                      style={{ color: 'var(--reader-panel-muted)' }}
                    >
                      快捷控制
                    </h3>
                    {showSettingsPanel && (
                      <button
                        type="button"
                        aria-expanded={detailsExpanded}
                        onClick={() => setDetailsExpanded((value) => !value)}
                        className={cn(
                          detailsExpanded ? 'reader-panel-action' : 'reader-panel-secondary',
                          'px-2.5 text-xs',
                        )}
                      >
                        <span>{detailsExpanded ? '收起设置' : '更多设置'}</span>
                        {detailsExpanded ? (
                          <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  <div
                    className="flex items-center justify-center gap-2"
                  >
                    <ControlButton
                      onClick={onPrev}
                      disabled={!isActive || isBusy}
                      title="上一句"
                      active={isActive}
                    >
                      <SkipBack className="h-5 w-5" aria-hidden="true" />
                    </ControlButton>

                    <div className="relative flex items-center justify-center">
                      <button
                        type="button"
                        onClick={handleStartClick}
                        disabled={isBusy}
                        aria-busy={isBusy || undefined}
                        data-playing={isPlaying ? 'true' : undefined}
                        title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                        aria-label={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                        className="reader-tts-primary size-11"
                      >
                        {isBusy ? (
                          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                        ) : isPaused ? (
                          <Play aria-hidden="true" className="ml-0.5 h-5 w-5 fill-current" />
                        ) : isPlaying ? (
                          <Pause aria-hidden="true" className="h-5 w-5 fill-current" />
                        ) : (
                          <Play aria-hidden="true" className="ml-0.5 h-5 w-5 fill-current" />
                        )}
                      </button>
                    </div>

                    <ControlButton
                      onClick={onNext}
                      disabled={!isActive || isBusy}
                      title="下一句"
                      active={isActive}
                    >
                      <SkipForward className="h-5 w-5" aria-hidden="true" />
                    </ControlButton>

                    <ControlButton
                      onClick={handleStopClick}
                      disabled={!isActive && !isBusy}
                      title="停止"
                      active={isActive || isBusy}
                      variant="danger"
                    >
                      <Square className="h-5 w-5" aria-hidden="true" />
                    </ControlButton>
                  </div>

                  <div className="pb-1">
                    <RateButtons
                      value={settings.rate}
                      onChange={handleRateChange}
                    />
                  </div>

                  {detailsExpanded && (
                    <div className="paper-reveal-soft space-y-3 px-1 pt-2">
                      <div className="flex items-center justify-between gap-3 px-1">
                        <h3
                          className="text-xs font-medium"
                          style={{ color: 'var(--reader-panel-muted)' }}
                        >
                          高亮方式
                        </h3>
                      </div>
                      <div role="group" aria-label="高亮方式" className="grid grid-cols-2 gap-1.5">
                        {([
                          ['word', '词语'],
                          ['sentence', '句子'],
                        ] as const).map(([mode, label]) => {
                          const active = settings.highlightMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              aria-pressed={active}
                              onClick={() => handleHighlightModeChange(mode)}
                              className={cn(
                                'reader-settings-option touch-control min-h-11 border py-2 text-xs lg:min-h-9',
                                active && 'font-medium',
                              )}
                              style={active ? undefined : { borderColor: 'var(--reader-panel-rule)' }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {detailsExpanded && (
                    <div className="paper-reveal-soft space-y-3 px-1">
                      <div className="flex items-center justify-between gap-3 px-1">
                        <h3
                          className="text-xs font-medium"
                          style={{ color: 'var(--reader-panel-muted)' }}
                        >
                          睡眠定时
                        </h3>
                        {sleepTimerActive && (
                          <span
                            className="text-[11px] font-medium tabular-nums"
                            style={{ color: 'var(--reader-panel-accent)' }}
                          >
                            {sleepTimer?.label}
                          </span>
                        )}
                      </div>

                      <div role="group" aria-label="睡眠定时" className="grid grid-cols-4 gap-1.5">
                        {[15, 30, 60].map((minutes) => {
                          const active =
                            sleepTimer?.mode === 'minutes' && sleepTimer.minutes === minutes;
                          return (
                            <button
                              key={minutes}
                              type="button"
                              aria-pressed={active}
                              onClick={() => onSleepTimerMinutes?.(minutes)}
                              className={cn(
                                'reader-settings-option min-h-11 border text-xs tabular-nums lg:min-h-9',
                                active && 'font-medium',
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
                    </div>
                  )}
                  {showSettingsPanel && detailsExpanded && (
                    <div className="paper-reveal-soft px-1">
                      <VoiceSelector
                        settings={settings}
                        voices={voices}
                        voicesLoading={voicesLoading}
                        voicesError={voicesError}
                        onReloadVoices={onReloadVoices}
                        onUpdateSettings={onUpdateSettings}
                        onPreviewStart={onPreviewStart}
                        onDropdownOpenChange={setVoiceDropdownOpen}
                        uiScheme={uiScheme}
                        overlayContainer={overlayContainer}
                      />
                    </div>
                  )}
                </div>
              </div>

              {!isToolbar && ttsStatus && !detailsExpanded && (
                <div
                  data-testid="tts-floating-status-footer"
                  className="border-t p-3"
                  style={{
                    borderColor: 'var(--reader-panel-rule)',
                  }}
                >
                  {renderStatusContent(true)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
