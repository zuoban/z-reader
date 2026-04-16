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
} from 'lucide-react';
import { TTSState, TTSSettings, Voice } from '@/lib/tts';
import { VoiceSelector } from '@/components/VoiceSelector';
import type { ThemeColors } from '@/hooks/useReaderTheme';

// 悬浮按钮组件 - 精致的视觉效果
interface FloatingButtonProps {
  isActive: boolean;
  isDragging: boolean;
  position: { x: number; y: number };
  expanded: boolean;
  onClick: (e: React.MouseEvent) => void;
  onPointerDownCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
  uiScheme: ThemeColors;
}

// 播放状态配色方案 - 生成丰富的颜色组合
const getActiveColorScheme = (primaryColor: string) => {
  // 验证 hex 格式，确保是有效的 6 位 hex 颜色
  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(primaryColor);
  const hex = isValidHex ? primaryColor : '#3b82f6'; // 默认蓝色

  // 解析 RGB 值
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // 使用 rgba 格式确保跨浏览器兼容性
  return {
    // 主色系
    primary: hex,
    primaryLight: `rgba(${r}, ${g}, ${b}, 0.9)`,
    primarySoft: `rgba(${r}, ${g}, ${b}, 0.16)`,
    primaryDark: `rgba(${r}, ${g}, ${b}, 0.74)`,

    // 光环颜色
    glowInner: `rgba(${r}, ${g}, ${b}, 0.2)`,
    glowOuter: `rgba(${r}, ${g}, ${b}, 0.08)`,

    // 波形渐变
    waveStart: `rgba(${r}, ${g}, ${b}, 0.55)`,
    waveEnd: `rgba(${r}, ${g}, ${b}, 0.2)`,

    // 边框
    border: `rgba(${r}, ${g}, ${b}, 0.28)`,
    borderHighlight: `rgba(${r}, ${g}, ${b}, 0.42)`,
  };
};

// 声音波形动画组件 - 播放时显示，使用主题色
const SoundWaveAnimation = ({ uiScheme }: { uiScheme: ThemeColors }) => {
  const colors = getActiveColorScheme(uiScheme.link);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden motion-reduce:hidden">
      {/* 波形条 - 使用主题色渐变 */}
      <div className="relative flex items-center gap-0.5 h-full py-2.5">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="w-0.5 rounded-full"
            style={{
              background: `linear-gradient(180deg, ${colors.waveStart} 0%, ${colors.waveEnd} 100%)`,
              height: index === 2 ? 14 : index % 2 === 0 ? 9 : 11,
              animation: `soundWave ${550 + index * 70}ms ease-in-out infinite`,
              animationDelay: `${index * 50}ms`,
              opacity: 0.75,
              boxShadow: `0 0 6px ${colors.glowInner}`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

// 播放状态外层光环 - 使用主题色脉冲
const ActiveGlowRing = ({ uiScheme }: { uiScheme: ThemeColors }) => {
  const colors = getActiveColorScheme(uiScheme.link);

  return (
    <>
      {/* 外层柔光 - 降低存在感，避免按钮显得臃肿 */}
      <div
        className="absolute rounded-full motion-reduce:hidden pointer-events-none"
        style={{
          inset: -5,
          background: `radial-gradient(circle, ${colors.glowOuter} 0%, transparent 72%)`,
          boxShadow: `0 10px 30px ${colors.glowInner}, 0 0 36px ${colors.glowOuter}`,
          animation: 'glowPulse 2.5s ease-in-out infinite',
        }}
      />
      <div
        className="absolute rounded-full motion-reduce:hidden pointer-events-none"
        style={{
          inset: -1,
          border: `1px solid ${colors.borderHighlight}`,
          boxShadow: `0 0 0 1px ${colors.primarySoft}`,
          animation: 'glowPulse 2s ease-in-out infinite',
          animationDelay: '0.4s',
        }}
      />
    </>
  );
};

// 活动状态指示器 - 使用绿色系保持独立性
const ActiveIndicator = ({ uiScheme }: { uiScheme: ThemeColors }) => (
  <div className="absolute top-1.5 right-1.5 motion-reduce:static">
    {/* 外层光环 */}
    <div
      className="absolute rounded-full motion-reduce:hidden"
      style={{
        width: 12,
        height: 12,
        left: -3,
        top: -3,
        background: 'radial-gradient(circle, #22c55e30 0%, transparent 70%)',
        boxShadow: '0 0 14px #22c55e45',
        animation: 'indicatorPulse 1.5s ease-in-out infinite',
      }}
    />
    {/* 主指示器 - 渐变绿色 */}
    <div
      className="relative h-2 w-2 rounded-full motion-reduce:animate-none"
      style={{
        background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 50%, #16a34a 100%)',
        boxShadow: `
          0 0 8px #22c55e75,
          0 0 14px #22c55e35,
          inset 0 1px 0 rgba(255,255,255,0.4),
          inset 0 -1px 0 rgba(0,0,0,0.1)
        `,
        border: `1.5px solid ${uiScheme.bg}`,
        animation: 'indicatorPulse 1.5s ease-in-out infinite',
      }}
    />
  </div>
);

const FloatingButton = ({
  isActive,
  isDragging,
  position,
  expanded,
  onClick,
  onPointerDownCapture,
  uiScheme,
}: FloatingButtonProps) => {
  // 获取播放状态颜色方案
  const colors = getActiveColorScheme(uiScheme.link);

  // 播放状态样式 - 使用多色渐变
  const getActiveStyles = () => {
    if (!isActive) {
      return {
        background: `linear-gradient(180deg, ${uiScheme.cardBg}fa 0%, ${uiScheme.cardBg}ef 100%)`,
        border: `1px solid ${uiScheme.cardBorder}52`,
        boxShadow: isDragging
          ? `0 14px 36px ${uiScheme.cardBorder}24, 0 8px 18px ${uiScheme.cardBorder}16`
          : `0 8px 22px ${uiScheme.cardBorder}14, 0 2px 8px ${uiScheme.cardBorder}10`,
        backdropFilter: 'blur(18px) saturate(150%)',
      };
    }

    // 播放状态 - 改为更清爽的高亮玻璃按钮，减少厚重块感
    return {
      background: `linear-gradient(180deg,
        rgba(255,255,255,0.96) 0%,
        ${colors.primarySoft} 22%,
        rgba(255,255,255,0.9) 100%)`,
      border: `1px solid ${colors.border}`,
      boxShadow: isDragging
        ? `0 16px 36px ${colors.glowInner}, 0 8px 20px ${colors.glowOuter},
           inset 0 1px 0 rgba(255,255,255,0.95)`
        : `0 10px 24px ${colors.glowInner}, 0 4px 12px ${colors.glowOuter},
           inset 0 1px 0 rgba(255,255,255,0.95)`,
      backdropFilter: 'blur(18px) saturate(165%)',
    };
  };

  const fabStyles = getActiveStyles();

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
      className="fixed z-[60] flex items-center justify-center touch-none
        transition-all duration-250 ease-out
        motion-reduce:transition-none
        group"
      style={{
        right: `calc(env(safe-area-inset-right, 0px) + ${position.x}px)`,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${position.y}px)`,
        width: 52,
        height: 52,
        cursor: 'pointer',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
      title="朗读控制"
    >
      {/* 播放状态外层光环 */}
      {isActive && <ActiveGlowRing uiScheme={uiScheme} />}

      {/* 主按钮 */}
      <div
        className="relative h-11 w-11 rounded-full flex items-center justify-center overflow-hidden
          transition-all duration-250 ease-out
          motion-reduce:transition-none"
        style={{
          ...fabStyles,
          transform: isDragging ? 'scale(1.06)' : expanded ? 'scale(1.02)' : undefined,
        }}
      >
        {/* 内部光泽层 - 播放时使用白色高光 */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: isActive
              ? `linear-gradient(180deg,
                  rgba(255,255,255,0.9) 0%,
                  rgba(255,255,255,0.45) 28%,
                  transparent 60%)`
              : `linear-gradient(180deg, rgba(255,255,255,0.72) 0%, transparent 58%)`,
            opacity: isActive ? 1 : 0.55,
          }}
        />

        {/* 底部轻微染色，保留层次但不过度压暗 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/2 rounded-b-full"
          style={{
            background: isActive
              ? `linear-gradient(0deg, ${colors.primaryDark}40 0%, transparent 100%)`
              : `linear-gradient(0deg, ${uiScheme.cardBorder}10 0%, transparent 100%)`,
          }}
        />

        <div
          className="absolute inset-[1px] rounded-full pointer-events-none"
          style={{
            border: `1px solid ${isActive ? colors.borderHighlight : `${uiScheme.fg}0d`}`,
            opacity: isActive ? 1 : 0.7,
          }}
        />

        {/* 声音波形动画 */}
        {isActive && <SoundWaveAnimation uiScheme={uiScheme} />}

        {/* 图标 - 播放时使用白色 */}
        <Volume2
          className="h-4 w-4 transition-all duration-200 ease-out relative z-10
            motion-reduce:transition-none"
          style={{
            color: isActive ? colors.primary : uiScheme.fg,
            filter: isActive
              ? `drop-shadow(0 1px 1px rgba(255,255,255,0.45)) drop-shadow(0 0 6px ${colors.glowOuter})`
              : undefined,
          }}
        />

        {/* 活动状态指示器 */}
        {isActive && <ActiveIndicator uiScheme={uiScheme} />}
      </div>

      {/* Hover 效果层 - 播放时显示 */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100
            transition-opacity duration-300 ease-out motion-reduce:hidden pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 35%, rgba(255,255,255,0.35) 0%, transparent 70%)`,
            transform: 'scale(1.08)',
            boxShadow: `0 0 28px ${colors.glowInner}`,
          }}
        />
      )}
    </div>
  );
};

// 提取通用样式配置 - 增强 glassmorphism 效果
const useThemeStyles = (uiScheme: ThemeColors, isActive: boolean) => ({
  panel: {
    background: `${uiScheme.cardBg}f0`,
    borderColor: `${uiScheme.cardBorder}72`,
    backdropFilter: 'blur(22px) saturate(180%)',
    boxShadow: isActive
      ? `0 26px 64px ${uiScheme.link}12, 0 12px 30px ${uiScheme.cardBorder}16, inset 0 1px 0 rgba(255,255,255,0.48)`
      : `0 22px 58px ${uiScheme.cardBorder}18, inset 0 1px 0 rgba(255,255,255,0.38)`,
  },
  section: {
    background: 'transparent',
    borderColor: `${uiScheme.cardBorder}36`,
    boxShadow: 'none',
  },
  selectTrigger: {
    background: `${uiScheme.buttonBg}78`,
    borderColor: `${uiScheme.cardBorder}55`,
    color: uiScheme.fg,
    transition: 'all 0.2s ease-out',
  },
  selectContent: {
    background: `${uiScheme.cardBg}f4`,
    borderColor: `${uiScheme.cardBorder}68`,
    backdropFilter: 'blur(18px)',
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
    className="group flex min-h-10 items-center gap-3 rounded-2xl border px-3 py-2"
    style={{
      background: 'transparent',
      borderColor: `${uiScheme.cardBorder}34`,
      boxShadow: 'none',
    }}
  >
    <label
      className="w-10 shrink-0 text-xs font-semibold uppercase tracking-[0.14em] transition-colors duration-200"
      style={{ color: uiScheme.mutedText }}
    >
      {label}
    </label>
    <Slider
      value={[value]}
      onValueChange={(v) => onChange(v[0])}
      min={min}
      max={max}
      step={step}
      className="flex-1 [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:ease-out [&_[role=slider]]:hover:scale-105 [&_[role=slider]]:active:scale-95"
    />
    <span
      className="w-16 rounded-full px-2 py-1 text-right text-xs font-semibold tabular-nums tracking-tight transition-colors duration-200"
      style={{
        color: uiScheme.fg,
        background: 'transparent',
        boxShadow: 'none',
      }}
    >
      {format(value)}
    </span>
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
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-10 w-10 rounded-2xl transition-all duration-200 ease-out hover:scale-[1.03] active:scale-95
        motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
      style={{
        color: getButtonColor(),
        background: 'transparent',
        border: 'none',
        boxShadow: disabled
          ? 'none'
          : active
            ? `0 10px 20px -18px ${uiScheme.cardBorder}66, inset 0 1px 0 rgba(255,255,255,0.38)`
            : `inset 0 1px 0 rgba(255,255,255,0.2)`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
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
    mode: 'off' | 'segment' | 'minutes';
    minutes?: number;
    endsAt?: number;
    label: string;
  };
  onSleepTimerMinutes?: (minutes: number) => void;
  onSleepTimerSegment?: () => void;
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
  onSleepTimerSegment,
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

  const FAB_SIZE = 52;

  const styles = useThemeStyles(uiScheme, state !== 'stopped');
  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const isActive = state !== 'stopped';
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

  const clampPosition = useCallback((clientX: number, clientY: number) => {
    const deltaX = clientX - dragRef.current.startX;
    const deltaY = clientY - dragRef.current.startY;
    const threshold = prefersReducedMotion.current ? 1 : 2;

    if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
      hasDraggedRef.current = true;
      suppressClickRef.current = true;
    }

    return {
      x: Math.max(0, Math.min(window.innerWidth - FAB_SIZE, dragRef.current.startPosX - deltaX)),
      y: Math.max(0, Math.min(window.innerHeight - FAB_SIZE, dragRef.current.startPosY - deltaY)),
    };
  }, []);

  const stopDragging = useCallback(() => {
    if (!isDraggingRef.current) return;
    draggingPointerIdRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const startDragging = useCallback((clientX: number, clientY: number, pointerId?: number) => {
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
  }, []);

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
      return;
    }
    // 仅当点击目标是 FloatingButton 本身（或其子元素但不是弹出面板内）时才切换
    if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
      return;
    }
    setExpanded((value) => !value);
  };

  const stopInteractivePropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleRateChange = (value: number) => {
    setLocalRate(value);
    onUpdateSettings({ rate: value });
  };

  const formatRate = (rate: number) => {
    if (rate === 0) return '正常';
    return `${rate > 0 ? '+' : ''}${rate}%`;
  };

  const isToolbar = variant === 'toolbar';
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
  const floatingPopupMaxHeight = Math.min(viewport.height * 0.62, 680);
  const popupViewportMargin = 12;
  const maxPopupRight = Math.max(
    popupViewportMargin,
    viewport.width - floatingPopupWidth - popupViewportMargin
  );
  const maxPopupBottom = Math.max(
    popupViewportMargin,
    viewport.height - floatingPopupMaxHeight - popupViewportMargin
  );

  const floatingPopupStyle = {
    right: `calc(env(safe-area-inset-right, 0px) + ${
      Math.min(maxPopupRight, Math.max(position.x - 4, popupViewportMargin))
    }px)`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${
      Math.min(maxPopupBottom, Math.max(position.y + FAB_SIZE + 14, popupViewportMargin))
    }px)`,
    width: `${floatingPopupWidth}px`,
    maxHeight: `${floatingPopupMaxHeight}px`,
  } as const;

  const toolbarPopupStyle = {
    width: 'min(364px, calc(100vw - 24px))',
    maxHeight: 'min(64vh, 680px)',
  } as const;

  const floatingStatusStyle = {
    right: `calc(env(safe-area-inset-right, 0px) + ${position.x + 42}px)`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${position.y + FAB_SIZE + 23}px)`,
    width: `min(500px, calc(100vw - ${position.x + 66}px))`,
  } as const;

  const statusContent = ttsStatus ? (
    <div
      className="rounded-[16px] border px-3 py-2"
      style={{
        background: 'transparent',
        borderColor: `${statusColor}30`,
        color: uiScheme.fg,
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: statusColor,
            boxShadow: `0 0 10px ${statusColor}66`,
          }}
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold" style={{ color: uiScheme.fg }}>
            {ttsStatus.headline}
          </p>
          {ttsStatus.detail && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4" style={{ color: uiScheme.mutedText }}>
              {ttsStatus.detail}
            </p>
          )}
        </div>
      </div>
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
            className="relative z-40 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-transparent! p-0 align-middle transition-all duration-200 hover:scale-[1.04] hover:bg-transparent! hover:opacity-100 active:scale-95 active:bg-transparent! aria-expanded:bg-transparent! focus-visible:border-transparent! focus-visible:ring-0! dark:bg-transparent! dark:hover:bg-transparent! dark:active:bg-transparent!"
            style={{
              color: isActive ? '#ffffff' : uiScheme.fg,
              background: isActive
                ? `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.55) 0%, ${uiScheme.link} 46%, ${uiScheme.link}dd 100%)`
                : `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.82) 0%, ${uiScheme.cardBg} 48%, ${uiScheme.cardBg}f2 100%)`,
              border: `1px solid ${isActive ? `${uiScheme.link}55` : `${uiScheme.cardBorder}58`}`,
              boxShadow: isActive
                ? `0 12px 24px -12px ${uiScheme.link}aa, 0 0 0 1px ${uiScheme.link}1f, inset 0 1px 0 rgba(255,255,255,0.5)`
                : `0 10px 20px -14px ${uiScheme.cardBorder}66, inset 0 1px 0 rgba(255,255,255,0.72)`,
              backdropFilter: 'blur(14px) saturate(150%)',
              opacity: isPending ? 0.72 : 1,
            }}
          >
            <span
              className="pointer-events-none absolute inset-[1px] rounded-full"
              style={{
                background: isActive
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, transparent 58%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.58) 0%, transparent 62%)',
              }}
            />
            <Volume2 className="relative z-10 h-4.5 w-4.5" />
            {isActive && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/45" />
                <span className="relative inline-flex h-2 w-2 rounded-full border border-white/70 bg-emerald-500" />
              </span>
            )}
          </Button>
        ) : (
          <>
            {expanded && (
              <button
                type="button"
                onPointerDown={handleDragHandlePointerDown}
                onPointerUp={handleDragHandlePointerUp}
                onPointerCancel={handleDragHandlePointerCancel}
                className="fixed z-[71] inline-flex h-8 touch-none select-none items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                style={{
                  right: `calc(env(safe-area-inset-right, 0px) + ${position.x}px)`,
                  bottom: `calc(env(safe-area-inset-bottom, 0px) + ${position.y + FAB_SIZE + 23}px)`,
                  color: isDragging ? uiScheme.link : uiScheme.mutedText,
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  cursor: isDragging ? 'grabbing' : 'grab',
                }}
                aria-label="拖动悬浮球位置"
                title="按住拖动悬浮球"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            )}
            {expanded && ttsStatus && !detailsExpanded && (
              <div
                data-reader-interactive="true"
                className="fixed z-[71] transition-transform duration-200 ease-out motion-reduce:transition-none"
                style={floatingStatusStyle}
              >
                {statusContent}
              </div>
            )}
            <FloatingButton
              isActive={isActive}
              isDragging={isDragging}
              position={position}
              expanded={expanded}
              onClick={handleClick}
              onPointerDownCapture={stopInteractivePropagation}
              uiScheme={uiScheme}
            />
          </>
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
                ? 'absolute bottom-full right-0 z-[70] mb-3 origin-bottom-right animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200'
                : 'fixed z-[70] origin-bottom-right animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-3 duration-200'
            }
            style={isToolbar ? toolbarPopupStyle : floatingPopupStyle}
            onClick={stopInteractivePropagation}
          >
            <div
              className="relative overflow-hidden rounded-[28px] border p-0 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out motion-reduce:transition-none"
              style={styles.panel}
            >
              {!isToolbar && (
                <div
                  className="pointer-events-none absolute bottom-[-8px] right-5 h-4 w-4 rotate-45 border-r border-b"
                  style={{
                    background: `${uiScheme.cardBg}f4`,
                    borderColor: `${uiScheme.cardBorder}72`,
                    boxShadow: `8px 8px 18px -16px ${uiScheme.cardBorder}40`,
                  }}
                />
              )}

              <div className="relative px-4 pt-2.5 sm:px-4">
                <div aria-hidden="true" className="h-4" />
              </div>

              <div className="space-y-2 overflow-y-auto px-4 pb-14 pt-2.5" style={{ maxHeight: 'inherit' }}>
                {resumePromptVisible && (
                  <section
                    className="rounded-[20px] border px-3 py-2.5"
                    style={{
                      background: 'transparent',
                      borderColor: `${uiScheme.link}36`,
                      boxShadow: 'none',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: `${uiScheme.link}18`,
                          color: uiScheme.link,
                        }}
                      >
                        <AlertCircle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: uiScheme.fg }}>
                          继续朗读
                        </p>
                        <p className="mt-1 text-xs leading-5" style={{ color: uiScheme.mutedText }}>
                          {resumePromptMessage}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void onResume?.()}
                            className="h-8 rounded-xl px-3 text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-95"
                            style={{
                              color: uiScheme.link,
                              background: 'transparent',
                              border: 'none',
                            }}
                          >
                            继续朗读
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <section className="rounded-[22px] border p-3" style={styles.section}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: uiScheme.mutedText }}>
                        快捷控制
                      </label>
                      <p className="mt-1 text-[11px]" style={{ color: uiScheme.mutedText }}>
                        播放与速度
                      </p>
                    </div>
                    {showSettingsPanel && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailsExpanded((value) => !value)}
                        className="h-8 rounded-full px-2.5 text-[11px] font-semibold transition-transform duration-200 hover:scale-[1.02] active:scale-95"
                        style={{
                          color: detailsExpanded ? uiScheme.link : uiScheme.mutedText,
                          background: 'transparent',
                          border: 'none',
                          boxShadow: 'none',
                        }}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        更多设置
                        {detailsExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>

                  {isToolbar && ttsStatus && <div className="mb-2">{statusContent}</div>}

                  <div
                    className="mb-2 rounded-[16px] border px-3 py-2"
                    style={{
                      background: 'transparent',
                      borderColor: sleepTimerActive ? `${uiScheme.link}32` : `${uiScheme.cardBorder}24`,
                      color: uiScheme.fg,
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Clock
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: sleepTimerActive ? uiScheme.link : uiScheme.mutedText }}
                        />
                        <p className="truncate text-xs font-semibold" style={{ color: uiScheme.fg }}>
                          睡眠定时
                        </p>
                      </div>
                      <p className="truncate text-[11px]" style={{ color: uiScheme.mutedText }}>
                        {sleepTimerActive ? sleepTimer?.label : '未设置'}
                      </p>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5">
                      {[15, 30, 60].map((minutes) => {
                        const active = sleepTimer?.mode === 'minutes' && sleepTimer.minutes === minutes;
                        return (
                          <Button
                            key={minutes}
                            type="button"
                            variant="ghost"
                            onClick={() => onSleepTimerMinutes?.(minutes)}
                            className="h-7 rounded-lg px-2 text-[11px] font-semibold"
                            style={{
                              color: active ? uiScheme.link : uiScheme.mutedText,
                              background: active ? `${uiScheme.link}14` : 'transparent',
                              border: 'none',
                            }}
                          >
                            {minutes}分
                          </Button>
                        );
                      })}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onSleepTimerSegment?.()}
                        className="h-7 rounded-lg px-2 text-[11px] font-semibold"
                        style={{
                          color: sleepTimer?.mode === 'segment' ? uiScheme.link : uiScheme.mutedText,
                          background: sleepTimer?.mode === 'segment' ? `${uiScheme.link}14` : 'transparent',
                          border: 'none',
                        }}
                      >
                        本段
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onClearSleepTimer?.()}
                        disabled={!sleepTimerActive}
                        className="h-7 rounded-lg px-2 text-[11px] font-semibold"
                        style={{
                          color: sleepTimerActive ? uiScheme.mutedText : `${uiScheme.mutedText}70`,
                          background: 'transparent',
                          border: 'none',
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  </div>

                  <div
                    className="mb-2 flex items-center justify-center gap-2 rounded-[20px] border px-2 py-2"
                    style={{
                      background: 'transparent',
                      borderColor: `${uiScheme.cardBorder}24`,
                      boxShadow: 'none',
                    }}
                  >
                    <ControlButton
                      onClick={onPrev}
                      disabled={!isActive || isPending}
                      title="上一句"
                      active={isActive}
                      uiScheme={uiScheme}
                    >
                      <SkipBack className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                    </ControlButton>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleStartClick}
                      disabled={isPending}
                      title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                      aria-label={isPlaying ? '暂停播放' : isPaused ? '继续播放' : '开始播放'}
                      className="h-12 w-12 rounded-[1rem] bg-transparent! transition-all duration-200 ease-out hover:scale-[1.03] hover:bg-transparent! active:scale-95 aria-expanded:bg-transparent! dark:hover:bg-transparent! motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
                      style={{
                        color: isPending ? uiScheme.mutedText : uiScheme.link,
                        background: 'transparent',
                        border: 'none',
                        boxShadow: isPending
                          ? 'none'
                          : `0 16px 28px -22px ${uiScheme.link}aa, 0 8px 20px -18px ${uiScheme.link}88, inset 0 1px 0 rgba(255,255,255,0.42)`,
                      }}
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5 sm:h-5 sm:w-5" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5 sm:h-5 sm:w-5" />
                      )}
                    </Button>

                    <ControlButton
                      onClick={onNext}
                      disabled={!isActive || isPending}
                      title="下一句"
                      active={isActive}
                      uiScheme={uiScheme}
                    >
                      <SkipForward className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                    </ControlButton>

                    <ControlButton
                      onClick={handleStopClick}
                      disabled={!isActive || isPending}
                      title="停止"
                      active={isActive}
                      variant="danger"
                      uiScheme={uiScheme}
                    >
                      <Square className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
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
                </section>

                {showSettingsPanel && detailsExpanded && (
                  <section
                    className="flex flex-col gap-2 rounded-[22px] border p-3 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1 duration-200"
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
            </div>
          </div>
        )}
      </div>
    </>
  );
}
