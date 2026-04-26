'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
const useThemeStyles = (uiScheme: ThemeColors) => ({
  panel: {
    background: uiScheme.cardBg,
    borderColor: `${uiScheme.cardBorder}40`,
    boxShadow: `0 24px 60px -20px ${withOpacity(uiScheme.fg, 0.16)}, 0 10px 30px -15px ${withOpacity(uiScheme.fg, 0.12)}`,
  },
  section: {
    background: withOpacity(uiScheme.cardBg, 0.5),
    borderColor: `${uiScheme.cardBorder}24`,
  },
  selectTrigger: {
    background: uiScheme.buttonBg,
    borderColor: `${uiScheme.cardBorder}55`,
    color: uiScheme.fg,
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
  <div className="group space-y-3">
    <div className="flex items-center justify-between gap-3 px-1">
      <label
        className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70"
        style={{ color: uiScheme.mutedText }}
      >
        {label}
      </label>
      <div className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-black tabular-nums text-primary">
        {format(value)}
      </div>
    </div>
    <div className="flex items-center gap-3.5">
      <span
        className="w-6 shrink-0 text-center text-[10px] font-black tabular-nums opacity-40"
        style={{ color: uiScheme.mutedText }}
      >
        {min}%
      </span>
      <div className="relative flex flex-1 items-center px-1">
        <Slider
          value={[value]}
          onValueChange={(v) => onChange(v[0])}
          min={min}
          max={max}
          step={step}
          className="flex-1 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-background [&_[role=slider]]:bg-primary [&_[role=slider]]:shadow-lg [&_[role=slider]]:transition-transform [&_[role=slider]]:active:scale-125 [&_[role=track]]:h-1.5 [&_[role=track]]:bg-muted/30 [&_[data-orientation=horizontal]_[role=range]]:bg-primary/80"
        />
      </div>
      <span
        className="w-6 shrink-0 text-center text-[10px] font-black tabular-nums opacity-40"
        style={{ color: uiScheme.mutedText }}
      >
        +{max}%
      </span>
    </div>
  </div>
);

const TTSSectionCard = ({
  title,
  description,
  uiScheme,
  children,
}: {
  title: string;
  description?: string;
  uiScheme: ThemeColors;
  children: React.ReactNode;
}) => (
  <section
    className="space-y-4 rounded-[1.75rem] border border-border/40 bg-card p-5 shadow-sm transition-all hover:bg-card"
    style={{
      borderColor: withOpacity(uiScheme.cardBorder, 0.18),
    }}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-bold tracking-tight" style={{ color: uiScheme.fg }}>
          {title}
        </h3>
        {description ? (
          <p className="text-[11px] font-medium leading-relaxed opacity-60" style={{ color: uiScheme.mutedText }}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
    <div className="pt-1">{children}</div>
  </section>
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
      className="h-10 w-10 rounded-xl transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5 active:scale-90"
      style={{
        color: getButtonColor(),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
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

  const styles = useThemeStyles(uiScheme);
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
  const panelBodyMaxHeight = isToolbar
    ? 'calc(min(72vh, 720px) - 72px)'
    : `${floatingPopupMaxHeight - 120}px`;
  const sheetPanelStyle = {
    background: uiScheme.cardBg,
    borderLeft: `1px solid ${withOpacity(uiScheme.cardBorder, 0.22)}`,
    color: uiScheme.fg,
    boxShadow: `-10px 0 28px ${withOpacity(uiScheme.cardBorder, 0.08)}`,
  } as const;

  const renderStatusContent = (withDragHandle = false) => ttsStatus ? (
    <div
      className="flex items-center gap-2.5 px-1 py-1"
      style={{ color: uiScheme.fg }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
          <span
            className="absolute h-full w-full animate-ping rounded-full"
            style={{ background: statusColor, opacity: 0.3 }}
          />
          <span
            className="relative h-1.5 w-1.5 rounded-full"
            style={{ background: statusColor }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold leading-tight">
            {ttsStatus.headline}
            {ttsStatus.detail && (
              <span className="ml-1.5 font-medium opacity-50" style={{ color: uiScheme.mutedText }}>
                {ttsStatus.detail}
              </span>
            )}
          </p>
        </div>
      </div>
      {withDragHandle && (
        <button
          type="button"
          onPointerDown={handleDragHandlePointerDown}
          onPointerUp={handleDragHandlePointerUp}
          onPointerCancel={handleDragHandlePointerCancel}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
          style={{
            color: isDragging ? uiScheme.link : uiScheme.mutedText,
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          title="拖动控制面板"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      )}
    </div>
  ) : null;

  if (isToolbar) {
    return (
      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              data-reader-interactive="true"
              data-reader-tts-trigger="true"
              type="button"
              title={isActive ? '朗读控制（正在播放）' : '朗读控制'}
              aria-label={isActive ? '朗读控制（正在播放）' : '朗读控制'}
              aria-expanded={expanded}
              aria-haspopup="dialog"
              className={
                triggerClassName ??
                'paper-motion-interactive relative z-40 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border p-0 align-middle hover:scale-[1.03] active:scale-95 focus-visible:border-transparent! focus-visible:ring-0! sm:h-11 sm:w-11 sm:rounded-[1.05rem]'
              }
              style={{
                ...(
                  triggerStyle ?? {
                    color: isActive ? uiScheme.link : uiScheme.buttonText,
                    ...getGlassSurface(uiScheme, {
                      elevated: isActive,
                      accentBorder: isActive
                        ? withOpacity(uiScheme.link, 0.30)
                        : 'transparent',
                      accentGlow: isActive
                        ? withOpacity(uiScheme.link, 0.28)
                        : withOpacity(uiScheme.fg, 0.14),
                    }),
                  }
                ),
                opacity: isPending ? 0.72 : 1,
              }}
            />
          }
        >
          <Volume2 className="relative z-10 h-4 w-4" />
        </SheetTrigger>

        <SheetContent
          side="right"
          showCloseButton
          finalFocus={false}
          container={overlayContainer}
          data-reader-interactive="true"
          data-reader-tts-popup="true"
          className="flex flex-col border-l-0 p-0 sm:w-[380px] sm:max-w-[380px]"
          style={sheetPanelStyle}
        >
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {isActive ? (isPlaying ? '正在朗读' : isPaused ? '已暂停' : '待开始') : '朗读已停止'}
          </div>

          <SheetHeader className="relative overflow-hidden border-b border-border/40 px-6 py-8 pr-24">
            <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
            <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-accent/10" />

            <div className="relative min-w-0">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
                  <Volume2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-xl font-bold tracking-tight" style={{ color: uiScheme.fg }}>
                    朗读控制
                  </SheetTitle>
                  <SheetDescription
                    className="mt-1 text-[11px] font-medium opacity-60"
                    style={{ color: uiScheme.mutedText }}
                  >
                    调整最贴近当前阅读节奏的声音
                  </SheetDescription>
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-12 pt-6">
            {resumePromptVisible && (
              <section
                className="rounded-[1.75rem] border border-border/40 bg-card p-5 shadow-sm"
                style={{
                  background: withOpacity(uiScheme.link, 0.07),
                  borderColor: withOpacity(uiScheme.link, 0.18),
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: uiScheme.cardBg,
                      color: uiScheme.link,
                    }}
                  >
                    <AlertCircle className="h-4.5 w-4.5" />
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
                    className="h-10 shrink-0 rounded-[1.1rem] px-3.5 text-xs font-bold active:scale-[0.96]"
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

            {ttsStatus ? renderStatusContent() : null}

            <TTSSectionCard
              title="播放控制"
              description="从当前位置开始、暂停或切换到相邻句子。"
              uiScheme={uiScheme}
            >
              <div
                className="flex items-center justify-center gap-2 rounded-2xl bg-black/5 p-2 dark:bg-white/5"
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
                    className="h-12 w-12 rounded-full shadow-lg transition-all active:scale-90"
                    style={{
                      background: uiScheme.fg,
                      color: uiScheme.cardBg,
                      cursor: isPending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : isPaused ? (
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    ) : isPlaying ? (
                      <Pause className="h-5 w-5 fill-current" />
                    ) : (
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
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

              <div className="pt-5">
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
              </div>
            </TTSSectionCard>

            <TTSSectionCard
              title="高亮方式"
              description="选择朗读时跟随词语或整句。"
              uiScheme={uiScheme}
            >
              <div className="flex gap-2">
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
                      className="flex-1 rounded-[1.25rem] px-3 py-2.5 text-xs font-bold transition-all active:scale-[0.96]"
                      style={{
                        color: active ? uiScheme.fg : withOpacity(uiScheme.fg, 0.5),
                        background: active ? withOpacity(uiScheme.buttonBg, 0.8) : withOpacity(uiScheme.buttonBg, 0.2),
                        border: `1px solid ${active ? withOpacity(uiScheme.cardBorder, 0.4) : withOpacity(uiScheme.cardBorder, 0.1)}`,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </TTSSectionCard>

            <TTSSectionCard
              title="睡眠定时"
              description={sleepTimerActive ? sleepTimer?.label : '到点自动停止，适合睡前阅读。'}
              uiScheme={uiScheme}
            >
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 60].map((minutes) => {
                  const active = sleepTimer?.mode === 'minutes' && sleepTimer.minutes === minutes;
                  return (
                    <Button
                      key={minutes}
                      type="button"
                      variant="ghost"
                      onClick={() => onSleepTimerMinutes?.(minutes)}
                      className="h-10 rounded-[1.15rem] text-xs font-bold transition-all active:scale-[0.96]"
                      style={{
                        color: active ? uiScheme.fg : withOpacity(uiScheme.fg, 0.5),
                        background: active ? withOpacity(uiScheme.buttonBg, 0.8) : withOpacity(uiScheme.buttonBg, 0.2),
                        border: `1px solid ${active ? withOpacity(uiScheme.cardBorder, 0.4) : withOpacity(uiScheme.cardBorder, 0.1)}`,
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
                  className="h-10 rounded-[1.15rem] text-xs font-bold"
                  style={{
                    color: sleepTimerActive ? uiScheme.mutedText : `${uiScheme.mutedText}40`,
                    background: withOpacity(uiScheme.buttonBg, 0.2),
                    border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.1)}`,
                  }}
                >
                  取消
                </Button>
              </div>
            </TTSSectionCard>

            {showSettingsPanel && (
              <TTSSectionCard
                title="语音偏好"
                description="选择发音人、情绪风格与输出声音。"
                uiScheme={uiScheme}
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
              </TTSSectionCard>
            )}
          </div>
        </SheetContent>
      </Sheet>
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
            className={
              triggerClassName ??
              'paper-motion-interactive relative z-40 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border p-0 align-middle hover:scale-[1.03] active:scale-95 focus-visible:border-transparent! focus-visible:ring-0! sm:h-11 sm:w-11 sm:rounded-[1.05rem]'
            }
            style={{
              ...(
                triggerStyle ?? {
                  color: isActive ? uiScheme.link : uiScheme.buttonText,
                  ...getGlassSurface(uiScheme, {
                    elevated: isActive,
                    accentBorder: isActive
                      ? withOpacity(uiScheme.link, 0.30)
                      : 'transparent',
                    accentGlow: isActive
                      ? withOpacity(uiScheme.link, 0.28)
                      : withOpacity(uiScheme.fg, 0.14),
                  }),
                }
              ),
              opacity: isPending ? 0.72 : 1,
            }}
          >
            <Volume2 className="relative z-10 h-4 w-4" />
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
                ? 'paper-reveal-soft fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+4.9rem)] z-[70] origin-top sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:origin-top-right'
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
                className="flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Volume2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold leading-tight" style={{ color: uiScheme.fg }}>
                      朗读控制
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onPointerDown={preserveReaderSelection}
                  onClick={closePanel}
                  className="h-8 w-8 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: uiScheme.mutedText }}
                  aria-label="关闭朗读控制面板"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div 
                className="space-y-4 overflow-y-auto px-4 pb-4 pt-3"
                style={{ maxHeight: panelBodyMaxHeight }}
              >
                {resumePromptVisible && (
                  <section
                    className="rounded-2xl border px-3.5 py-3"
                    style={{
                      background: withOpacity(uiScheme.link, 0.07),
                      borderColor: withOpacity(uiScheme.link, 0.18),
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
                        <p className="text-[13px] font-bold" style={{ color: uiScheme.fg }}>
                          继续朗读
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void onResume?.()}
                        className="h-8 shrink-0 rounded-lg px-3 text-[11px] font-bold transition-all active:scale-95"
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

                <div className="flex flex-col gap-4 px-1 py-1">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h3 className="text-[11px] font-black uppercase tracking-wider opacity-40" style={{ color: uiScheme.mutedText }}>
                      快捷控制
                    </h3>
                    {showSettingsPanel && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailsExpanded((value) => !value)}
                        className="h-7 rounded-lg px-2 text-[10px] font-black uppercase tracking-wide transition-all hover:bg-black/5 dark:hover:bg-white/5"
                        style={{
                          color: detailsExpanded ? uiScheme.link : uiScheme.mutedText,
                        }}
                      >
                        {detailsExpanded ? '收起设置' : '更多设置'}
                        {detailsExpanded ? (
                          <ChevronUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ChevronDown className="ml-1 h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-2 rounded-2xl bg-black/5 p-2 dark:bg-white/5">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleStartClick}
                        disabled={isPending}
                        title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                        className="h-11 w-11 rounded-full shadow-lg transition-all active:scale-90"
                        style={{
                          background: uiScheme.fg,
                          color: uiScheme.cardBg,
                          cursor: isPending ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : isPaused ? (
                          <Play className="ml-0.5 h-5 w-5 fill-current" />
                        ) : isPlaying ? (
                          <Pause className="h-5 w-5 fill-current" />
                        ) : (
                          <Play className="ml-0.5 h-5 w-5 fill-current" />
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

                  <div className="px-3 pb-1">
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
                  </div>

                  {detailsExpanded && (
                    <div className="paper-reveal-soft space-y-3 px-1 pt-2">
                      <div className="flex items-center justify-between gap-3 px-3">
                        <h3 className="text-[11px] font-black uppercase tracking-wider opacity-40" style={{ color: uiScheme.mutedText }}>
                          高亮方式
                        </h3>
                      </div>
                      <div className="flex gap-1 rounded-xl p-1" style={{ background: withOpacity(uiScheme.muted, 0.4) }}>
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
                              className="flex-1 rounded-lg py-2 text-[11px] font-bold transition-all"
                              style={{
                                color: active ? uiScheme.fg : withOpacity(uiScheme.fg, 0.4),
                                background: active ? uiScheme.cardBg : 'transparent',
                                boxShadow: active ? `0 2px 8px ${withOpacity(uiScheme.fg, 0.1)}` : 'none',
                              }}
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
                      <div className="flex items-center justify-between gap-3 px-3">
                        <h3 className="text-[11px] font-black uppercase tracking-wider opacity-40" style={{ color: uiScheme.mutedText }}>
                          睡眠定时
                        </h3>
                        {sleepTimerActive && (
                          <span className="text-[10px] font-black text-primary uppercase">
                            {sleepTimer?.label}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        {[15, 30, 60].map((minutes) => {
                          const active = sleepTimer?.mode === 'minutes' && sleepTimer.minutes === minutes;
                          return (
                            <Button
                              key={minutes}
                              type="button"
                              variant="ghost"
                              onClick={() => onSleepTimerMinutes?.(minutes)}
                              className="h-9 rounded-xl text-[11px] font-bold transition-all"
                              style={{
                                color: active ? uiScheme.fg : withOpacity(uiScheme.fg, 0.5),
                                background: active ? withOpacity(uiScheme.link, 0.12) : withOpacity(uiScheme.muted, 0.4),
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
                          className="h-9 rounded-xl text-[11px] font-bold"
                          style={{
                            color: sleepTimerActive ? uiScheme.mutedText : `${uiScheme.mutedText}40`,
                            background: withOpacity(uiScheme.muted, 0.2),
                          }}
                        >
                          取消
                        </Button>
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
                        uiScheme={uiScheme}
                        overlayContainer={overlayContainer}
                      />
                    </div>
                  )}
                </div>
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
