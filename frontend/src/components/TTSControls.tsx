'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Play,
  Pause,
  SlidersHorizontal,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  Loader2,
  X,
} from 'lucide-react';
import { VoiceSelector } from '@/components/VoiceSelector';
import { withOpacity } from '@/lib/reader-ui';
import type { TTSHighlightMode, TTSState, TTSSettings, Voice } from '@/lib/tts';
import type { ThemeColors } from '@/hooks/useReaderTheme';

const getGlassSurface = (
  uiScheme: ThemeColors,
  options?: {
    elevated?: boolean;
    accentBorder?: string;
    accentGlow?: string;
  }
) => ({
  background: uiScheme.cardBg,
  border: `1px solid ${options?.accentBorder ?? withOpacity(uiScheme.cardBorder, 0.3)}`,
  boxShadow: options?.elevated
    ? `0 16px 30px -18px ${options?.accentGlow ?? withOpacity(uiScheme.fg, 0.18)}`
    : `0 10px 20px -14px ${withOpacity(uiScheme.fg, 0.12)}`,
});

const getInsetControlSurface = (uiScheme: ThemeColors) => ({
  background: withOpacity(uiScheme.muted, 0.72),
  border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.16)}`,
  boxShadow: `inset 0 1px 0 ${withOpacity('#ffffff', 0.22)}`,
});

const getPrimaryActionSurface = (uiScheme: ThemeColors, disabled?: boolean) => ({
  background: disabled
    ? uiScheme.muted
    : uiScheme.fg,
  color: withOpacity('#ffffff', 0.96),
  boxShadow: disabled
    ? 'none'
    : `0 10px 20px -12px ${withOpacity(uiScheme.fg, 0.2)}, inset 0 1px 0 rgba(255,255,255,0.18)`,
});

const FAB_SIZE = 52;
const FLOATING_IDLE_DOCK_DELAY_MS = 3600;
const FLOATING_DOCK_RIGHT = 0;
const FLOATING_VIEWPORT_MARGIN = 12;
const FLOATING_PANEL_FOOTER_PADDING = 12;

// 悬浮按钮组件 - 精致的视觉效果
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
  uiScheme: ThemeColors;
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
  uiScheme,
}: FloatingButtonProps) => {
  const ActiveIconGlyph = isPlaying ? Pause : isPaused ? Play : Volume2;
  const iconColor = withOpacity(uiScheme.buttonText, 0.92);
  const buttonStyles = {
    ...getGlassSurface(uiScheme, {
      elevated: expanded || isDragging,
    }),
    background: uiScheme.cardBg,
    boxShadow: isDragging
      ? `0 16px 30px -16px ${withOpacity(uiScheme.fg, 0.24)}`
      : expanded
        ? `0 14px 26px -16px ${withOpacity(uiScheme.fg, 0.2)}`
        : `0 10px 20px -14px ${withOpacity(uiScheme.fg, 0.16)}`,
    transform: isDragging ? 'scale(1.06)' : expanded ? 'scale(1.03)' : 'scale(1)',
  };

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
      className={
        placement === 'fixed'
          ? 'fixed z-[60] focus-visible:outline-none'
          : 'relative z-10 shrink-0 focus-visible:outline-none'
      }
      style={{
        ...(placement === 'fixed'
          ? {
              right: `calc(env(safe-area-inset-right, 0px) + ${position.x}px)`,
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${position.y}px)`,
            }
          : {}),
        cursor: 'pointer',
        userSelect: 'none',
        pointerEvents: 'auto',
        opacity: 0.7,
        outline: 'none',
      }}
      title="朗读控制"
    >
      <div
        className="paper-motion-interactive relative flex h-[42px] w-[42px] items-center justify-center rounded-full transition-all duration-200 ease-out motion-reduce:transition-none"
        style={buttonStyles}
      >
        <div
          className="absolute inset-[1px] rounded-full pointer-events-none"
          style={{
            border: `1px solid ${withOpacity('#ffffff', 0.06)}`,
          }}
        />
        <ActiveIconGlyph
          className={isPaused ? 'relative ml-0.5 h-4.5 w-4.5' : 'relative h-4.5 w-4.5'}
          style={{ color: iconColor }}
        />
      </div>
    </div>
  );
};

// 提取通用样式配置，保持与阅读器纸面主题一致
const useThemeStyles = (uiScheme: ThemeColors, isActive: boolean) => ({
  panel: {
    background: uiScheme.cardBg,
    borderColor: `${uiScheme.cardBorder}72`,
    boxShadow: isActive
      ? `0 28px 54px -30px ${uiScheme.link}22, 0 14px 28px -24px ${uiScheme.cardBorder}20, inset 0 1px 0 rgba(255,255,255,0.4)`
      : `0 24px 46px -30px ${uiScheme.cardBorder}26, inset 0 1px 0 rgba(255,255,255,0.34)`,
  },
  section: {
    background: uiScheme.cardBg,
    borderColor: `${uiScheme.cardBorder}32`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
  },
  selectTrigger: {
    background: uiScheme.buttonBg,
    borderColor: `${uiScheme.cardBorder}55`,
    color: uiScheme.fg,
    transition: 'border-color var(--paper-duration-fast) var(--paper-ease-soft), background-color var(--paper-duration-fast) var(--paper-ease-soft), color var(--paper-duration-fast) var(--paper-ease-soft), box-shadow var(--paper-duration-fast) var(--paper-ease-soft)',
  },
  selectContent: {
    background: uiScheme.cardBg,
    borderColor: `${uiScheme.cardBorder}68`,
  },
});

// 复用的 Slider 控件 - 优化交互反馈
interface VoiceSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  uiScheme: ThemeColors;
}

const VoiceSlider = ({ label, value, onChange, min, max, step, format, uiScheme }: VoiceSliderProps) => (
  <div
    className="paper-field group flex min-h-11 items-center gap-3 rounded-[18px] border px-3.5 py-2.5"
    style={{
      ...getInsetControlSurface(uiScheme),
    }}
  >
    <label
      className="w-9 shrink-0 text-[11px] font-bold transition-colors duration-200"
      style={{ color: uiScheme.mutedText }}
    >
      {label}
    </label>
    <div className="relative flex flex-1 items-center">
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={min}
        max={max}
        step={step}
        className="flex-1 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:bg-white [&_[role=slider]]:shadow-lg [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:ease-out [&_[role=slider]]:hover:scale-110 [&_[role=slider]]:active:scale-95"
      />
    </div>
    <div
      className="flex h-8 min-w-[58px] items-center justify-center rounded-[14px] px-2 text-xs font-bold tabular-nums tracking-tight transition-colors duration-200"
      style={{
        color: uiScheme.fg,
        background: uiScheme.cardBg,
        border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.16)}`,
        boxShadow: `0 8px 16px -14px ${withOpacity(uiScheme.fg, 0.18)}`,
      }}
    >
      {format(value)}
    </div>
  </div>
);

// 复用的控制按钮 - 增强交互反馈和动画
interface ControlButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  variant?: 'default' | 'danger' | 'accent';
  uiScheme: ThemeColors;
}

const ControlButton = ({ onClick, disabled, title, children, active, variant, uiScheme }: ControlButtonProps) => {
  const getButtonColor = () => {
    if (disabled) return uiScheme.mutedText;
    if (variant === 'danger' && active) return '#ef4444';
    if (variant === 'accent' && active) return uiScheme.link;
    return active ? uiScheme.fg : uiScheme.mutedText;
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="paper-motion-interactive h-11 w-11 rounded-[18px] hover:scale-[1.04] active:scale-95
        motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
      style={{
        color: getButtonColor(),
        background: active ? uiScheme.cardBg : withOpacity(uiScheme.cardBg, 0.68),
        border: `1px solid ${active ? withOpacity(uiScheme.cardBorder, 0.24) : withOpacity(uiScheme.cardBorder, 0.14)}`,
        boxShadow: disabled
          ? 'none'
          : active
            ? `0 10px 20px -16px ${withOpacity(uiScheme.fg, 0.18)}, inset 0 1px 0 rgba(255,255,255,0.28)`
            : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </Button>
  );
};

interface TTSControlsProps {
  state: TTSState;
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
  uiScheme: ThemeColors;
  variant?: 'floating' | 'toolbar';
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
}

export function TTSControls({
  state,
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
  uiScheme,
  variant = 'floating',
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
}: TTSControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [localRate, setLocalRate] = useState(settings.rate);
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

  const styles = useThemeStyles(uiScheme, state !== 'stopped');
  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const isActive = state !== 'stopped';
  const isToolbar = variant === 'toolbar';
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
    setLocalRate(settings.rate);
  }, [settings]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  const handleStartClick = async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      await onStart();
    } finally {
      setTimeout(() => setIsPending(false), 300);
    }
  };

  const handleStopClick = async () => {
    if (isPending) return;
    setIsPending(true);
    await onStop();
    setTimeout(() => setIsPending(false), 300);
  };

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
    setLocalRate(value);
    onUpdateSettings({ rate: value });
  };

  const handleHighlightModeChange = (highlightMode: TTSHighlightMode) => {
    onUpdateSettings({ highlightMode });
  };

  const formatRate = (rate: number) => {
    if (rate === 0) return '正常';
    return `${rate > 0 ? '+' : ''}${rate}%`;
  };

  const statusTone = ttsStatus?.tone ?? (isActive ? 'active' : 'idle');
  const statusColor =
    statusTone === 'error'
      ? '#ef4444'
      : statusTone === 'warning'
        ? '#f59e0b'
        : statusTone === 'active'
          ? uiScheme.link
          : uiScheme.mutedText;
  const sleepTimerActive = sleepTimer?.mode && sleepTimer.mode !== 'off';

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    if (!expanded) {
      setDetailsExpanded(false);
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
    if (!expanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

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

  const renderStatusContent = (withDragHandle = false) => ttsStatus ? (
    <div
      className="paper-panel-soft flex items-center gap-3 rounded-[18px] border px-3.5 py-2.5"
      style={{
        background: uiScheme.cardBg,
        borderColor: `${statusColor}25`,
        color: uiScheme.fg,
      }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="relative mt-1 flex h-2 w-2 shrink-0 items-center justify-center">
          <span
            className="absolute h-full w-full animate-ping rounded-full"
            style={{ background: statusColor, opacity: 0.4 }}
          />
          <span
            className="relative h-2 w-2 rounded-full"
            style={{
              background: statusColor,
              boxShadow: `0 0 8px ${statusColor}`,
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold leading-tight" style={{ color: uiScheme.fg }}>
            {ttsStatus.headline}
          </p>
          {ttsStatus.detail && (
            <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-relaxed" style={{ color: uiScheme.mutedText }}>
              {ttsStatus.detail}
            </p>
          )}
        </div>
      </div>
      {withDragHandle && (
        <button
          type="button"
          onPointerDown={handleDragHandlePointerDown}
          onPointerUp={handleDragHandlePointerUp}
          onPointerCancel={handleDragHandlePointerCancel}
          className="paper-motion-interactive -mr-1 inline-flex h-9 w-9 shrink-0 touch-none select-none items-center justify-center rounded-full border-0 bg-transparent p-0 hover:scale-[1.03] active:scale-95"
          style={{
            color: isDragging ? uiScheme.link : uiScheme.mutedText,
            background: 'transparent',
            borderColor: 'transparent',
            boxShadow: 'none',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          aria-label="拖动朗读控制面板位置"
          title="按住拖动控制面板"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  ) : null;

  return (
    <>
      {expanded && (
        <button
          type="button"
          aria-label="关闭朗读控制弹层"
          className="fixed inset-0 z-[59] cursor-default bg-transparent"
          onClick={() => setExpanded(false)}
        />
      )}

      <div
        ref={rootRef}
        className={`relative ${isToolbar ? 'z-40' : ''}`}
        style={{ pointerEvents: 'auto' }}
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {isActive ? (isPlaying ? '正在朗读' : isPaused ? '已暂停' : '待开始') : '朗读已停止'}
        </div>
        {isToolbar ? (
          <Button
            variant="ghost"
            size="icon"
            data-reader-interactive="true"
            data-reader-tts-trigger="true"
            onClick={handleClick}
            type="button"
            title={isActive ? '朗读控制（正在播放）' : '朗读控制'}
            aria-label={isActive ? '朗读控制（正在播放）' : '朗读控制'}
            aria-expanded={expanded}
            aria-haspopup="dialog"
            className="paper-motion-interactive relative z-40 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border p-0 align-middle hover:scale-[1.04] hover:opacity-100 active:scale-95 focus-visible:border-transparent! focus-visible:ring-0!"
            style={{
              color: uiScheme.buttonText,
              ...getGlassSurface(uiScheme, {
                elevated: true,
                accentBorder: isActive
                  ? withOpacity(uiScheme.link, 0.34)
                  : withOpacity(uiScheme.cardBorder, 0.34),
                accentGlow: isActive
                  ? withOpacity(uiScheme.link, 0.28)
                  : withOpacity(uiScheme.fg, 0.14),
              }),
              opacity: isPending ? 0.72 : 1,
            }}
          >
            <span
              className="pointer-events-none absolute inset-[1px] rounded-full"
              style={{
                background: uiScheme.cardBg,
              }}
            />
            <Volume2 className="relative z-10 h-4.5 w-4.5" />
            {isActive && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full border border-white/70 bg-emerald-500" />
              </span>
            )}
          </Button>
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
              uiScheme={uiScheme}
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
                ? 'paper-reveal-soft absolute bottom-full right-0 z-[70] mb-3 origin-bottom-right'
                : 'paper-reveal-soft fixed z-[70] origin-bottom-right'
            }
            style={isToolbar ? toolbarPopupStyle : floatingPopupStyle}
            onClick={stopInteractivePropagation}
          >
            <div
              className="paper-motion-surface paper-panel paper-stack relative overflow-hidden rounded-[28px] border p-0 shadow-2xl motion-reduce:transition-none"
              style={styles.panel}
            >
              {!isToolbar && (
                <div
                  className="pointer-events-none absolute bottom-[-8px] right-5 h-4 w-4 rotate-45 border-r border-b"
                  style={{
                    background: uiScheme.cardBg,
                    borderColor: `${uiScheme.cardBorder}72`,
                    boxShadow: `8px 8px 18px -16px ${uiScheme.cardBorder}40`,
                  }}
                />
              )}

              <div
                className="flex items-center justify-between gap-3 border-b px-4 py-3"
                style={{
                  borderColor: withOpacity(uiScheme.cardBorder, 0.18),
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight" style={{ color: uiScheme.fg }}>
                    朗读控制
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium leading-tight" style={{ color: uiScheme.mutedText }}>
                    播放、定时与语速
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setExpanded(false)}
                  className="paper-motion-interactive h-9 w-9 shrink-0 rounded-full hover:scale-[1.03] active:scale-95"
                  style={{
                    color: uiScheme.mutedText,
                    background: withOpacity(uiScheme.muted, 0.72),
                    border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.16)}`,
                    boxShadow: `inset 0 1px 0 ${withOpacity('#ffffff', 0.18)}`,
                  }}
                  aria-label="关闭朗读控制面板"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div 
                className="space-y-3 overflow-y-auto px-4 pb-4 pt-3" 
                style={{ maxHeight: `${floatingPopupMaxHeight - (isToolbar ? 72 : 120)}px` }}
              >
                {resumePromptVisible && (
                  <section
                    className="paper-panel-soft rounded-[18px] border px-3.5 py-3"
                    style={{
                      background: withOpacity(uiScheme.link, 0.07),
                      borderColor: withOpacity(uiScheme.link, 0.18),
                      boxShadow: `inset 0 1px 0 ${withOpacity('#ffffff', 0.2)}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: uiScheme.cardBg,
                          color: uiScheme.link,
                        }}
                      >
                        <AlertCircle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: uiScheme.fg }}>
                          继续朗读
                        </p>
                        <p className="mt-0.5 text-xs leading-5" style={{ color: uiScheme.mutedText }}>
                          {resumePromptMessage}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void onResume?.()}
                        className="paper-motion-interactive h-9 shrink-0 rounded-full px-3 text-xs font-bold hover:scale-[1.02] active:scale-95"
                        style={{
                          color: uiScheme.link,
                          background: uiScheme.cardBg,
                          border: `1px solid ${withOpacity(uiScheme.link, 0.14)}`,
                        }}
                      >
                        继续
                      </Button>
                    </div>
                  </section>
                )}

                {isToolbar && ttsStatus && !detailsExpanded && <div>{renderStatusContent()}</div>}

                <section className="paper-panel-soft flex flex-col gap-3 rounded-[24px] border p-3.5" style={styles.section}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <label className="text-[11px] font-bold" style={{ color: uiScheme.mutedText }}>
                        快捷控制
                      </label>
                      <p className="mt-0.5 text-[13px] font-semibold" style={{ color: uiScheme.fg }}>
                        播放与速度
                      </p>
                    </div>
                    {showSettingsPanel && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailsExpanded((value) => !value)}
                        className="paper-motion-interactive h-9 rounded-full px-3 text-xs font-bold hover:scale-[1.02] active:scale-95"
                        style={{
                          color: detailsExpanded ? uiScheme.link : uiScheme.mutedText,
                          background: detailsExpanded ? withOpacity(uiScheme.link, 0.1) : withOpacity(uiScheme.muted, 0.76),
                          border: `1px solid ${withOpacity(detailsExpanded ? uiScheme.link : uiScheme.cardBorder, 0.16)}`,
                          boxShadow: `inset 0 1px 0 ${withOpacity('#ffffff', 0.18)}`,
                        }}
                      >
                        <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                        更多设置
                        {detailsExpanded ? (
                          <ChevronUp className="ml-1 h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="ml-1 h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>

                  <div
                    className="flex items-center justify-center gap-2 rounded-[20px] border px-2.5 py-2.5"
                    style={{
                      ...getInsetControlSurface(uiScheme),
                    }}
                  >
                    <ControlButton
                      onClick={onPrev}
                      disabled={!isActive || isPending}
                      title="上一句"
                      active={isActive}
                      uiScheme={uiScheme}
                    >
                      <SkipBack className="h-5 w-5" />
                    </ControlButton>

                    <div className="relative flex items-center justify-center">
                      {isPlaying && (
                        <div
                          className="absolute inset-0 animate-ping rounded-full opacity-20"
                          style={{ background: uiScheme.cardBg }}
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleStartClick}
                        disabled={isPending}
                        title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                        className="paper-motion-interactive h-14 w-14 rounded-full hover:scale-[1.03] active:scale-95 focus-visible:outline-none"
                        style={{
                          ...getPrimaryActionSurface(uiScheme, isPending),
                          cursor: isPending ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isPending ? (
                          <Loader2
                            className="h-6 w-6 animate-spin"
                            style={{ color: uiScheme.fg }}
                          />
                        ) : isPaused ? (
                          <Play className="ml-0.5 h-6 w-6 fill-current" />
                        ) : isPlaying ? (
                          <Pause className="h-6 w-6 fill-current" />
                        ) : (
                          <Play className="ml-0.5 h-6 w-6 fill-current" />
                        )}
                      </Button>
                    </div>

                    <ControlButton
                      onClick={onNext}
                      disabled={!isActive || isPending}
                      title="下一句"
                      active={isActive}
                      uiScheme={uiScheme}
                    >
                      <SkipForward className="h-5 w-5" />
                    </ControlButton>

                    <ControlButton
                      onClick={handleStopClick}
                      disabled={!isActive || isPending}
                      title="停止"
                      active={isActive}
                      uiScheme={uiScheme}
                    >
                      <Square className="h-5 w-5" />
                    </ControlButton>
                  </div>

                  <VoiceSlider
                    label="语速"
                    value={localRate}
                    onChange={handleRateChange}
                    min={-50}
                    max={100}
                    step={10}
                    format={formatRate}
                    uiScheme={uiScheme}
                  />

                  {detailsExpanded && (
                    <div
                      className="paper-reveal-soft paper-field rounded-[18px] border p-3"
                      style={{
                        ...getInsetControlSurface(uiScheme),
                        borderColor: withOpacity(uiScheme.cardBorder, 0.16),
                      }}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold" style={{ color: uiScheme.fg }}>
                            高亮方式
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium" style={{ color: uiScheme.mutedText }}>
                            朗读时标记当前内容
                          </p>
                        </div>
                        <div
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                          style={{ background: uiScheme.cardBg, color: uiScheme.mutedText }}
                        >
                          {settings.highlightMode === 'sentence' ? '句子' : '词语'}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['word', '词语'],
                          ['sentence', '句子'],
                        ] as const).map(([mode, label]) => {
                          const active = settings.highlightMode === mode;
                          return (
                            <Button
                              key={mode}
                              type="button"
                              variant="ghost"
                              onClick={() => handleHighlightModeChange(mode)}
                              className="h-9 rounded-xl text-xs font-bold transition-all duration-200"
                              style={{
                                color: active ? uiScheme.link : uiScheme.fg,
                                background: active ? uiScheme.cardBg : withOpacity(uiScheme.cardBg, 0.64),
                                border: `1px solid ${active ? withOpacity(uiScheme.link, 0.34) : withOpacity(uiScheme.cardBorder, 0.12)}`,
                                boxShadow: active ? `0 8px 16px -12px ${withOpacity(uiScheme.link, 0.34)}` : 'none',
                              }}
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {detailsExpanded && (
                    <div
                      className="paper-reveal-soft paper-field rounded-[18px] border p-3"
                      style={{
                        ...getInsetControlSurface(uiScheme),
                        borderColor: sleepTimerActive ? withOpacity(uiScheme.link, 0.2) : withOpacity(uiScheme.cardBorder, 0.16),
                      }}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-[14px]"
                            style={{
                              background: sleepTimerActive ? withOpacity(uiScheme.link, 0.1) : uiScheme.cardBg,
                              color: sleepTimerActive ? uiScheme.link : uiScheme.mutedText,
                              border: `1px solid ${withOpacity(sleepTimerActive ? uiScheme.link : uiScheme.cardBorder, 0.14)}`,
                            }}
                          >
                            <Clock className="h-4 w-4" />
                          </div>
                          <p className="text-sm font-bold" style={{ color: uiScheme.fg }}>
                            睡眠定时
                          </p>
                        </div>
                        <div
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                          style={{
                            background: sleepTimerActive ? withOpacity(uiScheme.link, 0.1) : uiScheme.cardBg,
                            color: sleepTimerActive ? uiScheme.link : uiScheme.mutedText,
                          }}
                        >
                          {sleepTimerActive ? sleepTimer?.label : '未设置'}
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        {[15, 30, 60].map((minutes) => {
                          const active = sleepTimer?.mode === 'minutes' && sleepTimer.minutes === minutes;
                          return (
                            <Button
                              key={minutes}
                              type="button"
                              variant="ghost"
                              onClick={() => onSleepTimerMinutes?.(minutes)}
                              className="h-9 rounded-xl text-xs font-bold transition-all duration-200"
                              style={{
                                color: active ? uiScheme.link : uiScheme.fg,
                                background: active ? uiScheme.cardBg : withOpacity(uiScheme.cardBg, 0.64),
                                border: `1px solid ${active ? withOpacity(uiScheme.link, 0.34) : withOpacity(uiScheme.cardBorder, 0.12)}`,
                                boxShadow: active ? `0 8px 16px -12px ${withOpacity(uiScheme.link, 0.34)}` : 'none',
                              }}
                            >
                              {minutes}分
                            </Button>
                          );
                        })}
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onClearSleepTimer?.()}
                          disabled={!sleepTimerActive}
                          className="h-9 rounded-xl text-xs font-bold transition-all duration-200"
                          style={{
                            color: sleepTimerActive ? uiScheme.mutedText : `${uiScheme.mutedText}60`,
                            background: uiScheme.cardBg,
                            border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.1)}`,
                          }}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                </section>

                {showSettingsPanel && detailsExpanded && (
                  <section
                    className="paper-reveal-soft flex flex-col gap-2 rounded-[22px] border p-3"
                    style={styles.section}
                  >
                    <VoiceSelector
                      settings={settings}
                      voices={voices}
                      voicesLoading={voicesLoading}
                      voicesError={voicesError}
                      onReloadVoices={onReloadVoices}
                      onUpdateSettings={onUpdateSettings}
                      uiScheme={uiScheme}
                      overlayContainer={overlayContainer}
                    />
                  </section>
                )}
              </div>

              {!isToolbar && (
                <div
                  className="border-t p-3"
                  style={{
                    borderColor: `${uiScheme.cardBorder}24`,
                  }}
                >
                  {ttsStatus && !detailsExpanded ? renderStatusContent(true) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
