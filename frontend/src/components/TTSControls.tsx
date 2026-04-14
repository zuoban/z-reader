'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import { TTSState, TTSSettings, Voice } from '@/lib/tts';
import type { ThemeColors } from '@/hooks/useReaderTheme';

const SUPPORTED_LOCALES = ['zh', 'en', 'ja', 'ko'];

const LOCALE_LABELS: Record<string, string> = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
};

// 悬浮按钮组件 - 精致的视觉效果
interface FloatingButtonProps {
  isActive: boolean;
  isDragging: boolean;
  position: { x: number; y: number };
  expanded: boolean;
  onClick: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
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
      <div className="relative flex items-center gap-0.5 h-full py-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="w-0.5 rounded-full"
            style={{
              background: `linear-gradient(180deg, ${colors.waveStart} 0%, ${colors.waveEnd} 100%)`,
              height: index === 2 ? 16 : index % 2 === 0 ? 10 : 13,
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
        className="absolute rounded-[1.4rem] motion-reduce:hidden pointer-events-none"
        style={{
          inset: -5,
          background: `radial-gradient(circle, ${colors.glowOuter} 0%, transparent 72%)`,
          boxShadow: `0 10px 30px ${colors.glowInner}, 0 0 36px ${colors.glowOuter}`,
          animation: 'glowPulse 2.5s ease-in-out infinite',
        }}
      />
      <div
        className="absolute rounded-[1.4rem] motion-reduce:hidden pointer-events-none"
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
        width: 14,
        height: 14,
        left: -3,
        top: -3,
        background: 'radial-gradient(circle, #22c55e30 0%, transparent 70%)',
        boxShadow: '0 0 14px #22c55e45',
        animation: 'indicatorPulse 1.5s ease-in-out infinite',
      }}
    />
    {/* 主指示器 - 渐变绿色 */}
    <div
      className="relative h-2.5 w-2.5 rounded-full motion-reduce:animate-none"
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
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
      className="fixed z-40 flex items-center justify-center touch-none
        transition-all duration-250 ease-out
        motion-reduce:transition-none
        group"
      style={{
        right: position.x,
        bottom: position.y,
        width: 56,
        height: 56,
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
      title="控制面板（拖动移动）"
    >
      {/* 播放状态外层光环 */}
      {isActive && <ActiveGlowRing uiScheme={uiScheme} />}

      {/* 主按钮 */}
      <div
        className="relative h-12 w-12 rounded-[1.35rem] flex items-center justify-center overflow-hidden
          transition-all duration-250 ease-out
          motion-reduce:transition-none"
        style={{
          ...fabStyles,
          transform: isDragging ? 'scale(1.06)' : expanded ? 'scale(1.02)' : undefined,
        }}
      >
        {/* 内部光泽层 - 播放时使用白色高光 */}
        <div
          className="absolute inset-0 rounded-[1.35rem]"
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
          className="absolute bottom-0 left-0 right-0 h-1/2 rounded-b-[1.35rem]"
          style={{
            background: isActive
              ? `linear-gradient(0deg, ${colors.primaryDark}40 0%, transparent 100%)`
              : `linear-gradient(0deg, ${uiScheme.cardBorder}10 0%, transparent 100%)`,
          }}
        />

        <div
          className="absolute inset-[1px] rounded-[calc(1.35rem-1px)] pointer-events-none"
          style={{
            border: `1px solid ${isActive ? colors.borderHighlight : `${uiScheme.fg}0d`}`,
            opacity: isActive ? 1 : 0.7,
          }}
        />

        {/* 声音波形动画 */}
        {isActive && <SoundWaveAnimation uiScheme={uiScheme} />}

        {/* 图标 - 播放时使用白色 */}
        <Volume2
          className="h-4.5 w-4.5 transition-all duration-200 ease-out relative z-10
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
          className="absolute inset-0 rounded-[1.4rem] opacity-0 group-hover:opacity-100
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
    background: isActive
      ? `${uiScheme.cardBg}f4`
      : `${uiScheme.cardBg}f1`,
    borderColor: `${uiScheme.cardBorder}72`,
    backdropFilter: 'blur(22px) saturate(180%)',
    boxShadow: isActive
      ? `0 24px 60px ${uiScheme.link}10, 0 10px 28px ${uiScheme.cardBorder}14, inset 0 1px 0 rgba(255,255,255,0.42)`
      : `0 20px 56px ${uiScheme.cardBorder}18, inset 0 1px 0 rgba(255,255,255,0.35)`,
  },
  section: {
    background: `${uiScheme.buttonBg}42`,
    borderColor: `${uiScheme.cardBorder}4d`,
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
  <div className="flex items-center gap-2 sm:gap-3 group rounded-xl border px-2.5 py-2" style={{
    background: `${uiScheme.buttonBg}42`,
    borderColor: `${uiScheme.cardBorder}55`,
  }}>
    <label
      className="text-[11px] sm:text-xs w-7 sm:w-8 shrink-0 font-medium transition-colors duration-200"
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
      className="flex-1 [&_[role=slider]]:transition-all [&_[role=slider]]:duration-200 [&_[role=slider]]:ease-out [&_[role=slider]]:hover:scale-110 [&_[role=slider]]:active:scale-95"
    />
    <span
      className="text-[11px] sm:text-xs w-10 sm:w-12 tabular-nums text-right font-semibold tracking-tight transition-colors duration-200"
      style={{ color: uiScheme.fg }}
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
      className="transition-all duration-200 ease-out hover:scale-110 active:scale-95 h-9 w-9 sm:h-10 sm:w-10 rounded-xl
        motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
      style={{
        color: getButtonColor(),
        background: disabled
          ? `${uiScheme.buttonBg}50`
          : active
            ? variant === 'accent'
              ? `${uiScheme.link}20`
              : `${uiScheme.buttonBg}80`
            : `${uiScheme.buttonBg}40`,
        border: `1px solid ${disabled ? `${uiScheme.cardBorder}30` : `${uiScheme.cardBorder}50`}`,
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
  onStart: () => void | Promise<void>;
  onStop: () => void;
  onNext: () => void | Promise<void>;
  onPrev: () => void | Promise<void>;
  onUpdateSettings: (settings: Partial<TTSSettings>) => void;
  uiScheme: ThemeColors;
  variant?: 'floating' | 'toolbar';
  onExpandedChange?: (expanded: boolean) => void;
  showSettingsPanel?: boolean;
}

export function TTSControls({
  state,
  settings,
  voices,
  onStart,
  onStop,
  onNext,
  onPrev,
  onUpdateSettings,
  uiScheme,
  variant = 'floating',
  onExpandedChange,
  showSettingsPanel = true,
}: TTSControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [localRate, setLocalRate] = useState(settings.rate);
  const [localPitch, setLocalPitch] = useState(settings.pitch);
  const [localVolume, setLocalVolume] = useState(settings.volume);
  const [selectedLocale, setSelectedLocale] = useState<string>('');
  const [position, setPosition] = useState({ x: 8, y: 8 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number }>({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
  });
  const positionRef = useRef(position);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingPositionRef = useRef(position);
  const rootRef = useRef<HTMLDivElement>(null);

  const FAB_SIZE = 48;
  const FAB_OFFSET = 56;

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
    setLocalRate(settings.rate);
    setLocalPitch(settings.pitch);
    setLocalVolume(settings.volume);
  }, [settings]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [expanded]);

  // 失去焦点自动隐藏
  useEffect(() => {
    if (!expanded) return;

    const handleBlur = (e: MouseEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        setExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleBlur);
    return () => document.removeEventListener('mousedown', handleBlur);
  }, [expanded]);

  const availableLocales = SUPPORTED_LOCALES.filter(locale =>
    voices.some(v => v.Locale.startsWith(locale))
  );

  const localeVoicesMap = availableLocales.map(locale => ({
    locale,
    label: LOCALE_LABELS[locale] || locale,
    voices: voices.filter(v => v.Locale.startsWith(locale)),
  }));

  useEffect(() => {
    if (!selectedLocale && voices.length > 0) {
      if (settings.voiceName) {
        const currentVoice = voices.find(v => v.Name === settings.voiceName);
        if (currentVoice) {
          const locale = SUPPORTED_LOCALES.find(l => currentVoice.Locale.startsWith(l)) || '';
          if (locale) {
            setSelectedLocale(locale);
            return;
          }
        }
      }
      if (availableLocales.length > 0) {
        setSelectedLocale(availableLocales[0]);
      }
    }
  }, [voices, settings.voiceName, selectedLocale, availableLocales]);

  const currentLocaleVoices = localeVoicesMap.find(l => l.locale === selectedLocale)?.voices || [];

  const filteredVoices = selectedLocale
    ? voices.filter(v => v.Locale.startsWith(selectedLocale))
    : voices.filter(v => SUPPORTED_LOCALES.some(l => v.Locale.startsWith(l)));

  const selectedVoice = voices.find(v => v.Name === settings.voiceName);
  const availableStyles = selectedVoice?.StyleList || ['general'];

  const handleLocaleChange = (value: string) => {
    setSelectedLocale(value);
    const localeVoices = voices.filter(v => v.Locale.startsWith(value));
    if (localeVoices.length > 0) {
      const currentVoiceInLocale = localeVoices.find(v => v.Name === settings.voiceName);
      if (!currentVoiceInLocale) {
        onUpdateSettings({ voiceName: localeVoices[0].Name });
      }
    }
  };

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
    pendingPositionRef.current = nextPosition;
    positionRef.current = nextPosition;

    if (rafRef.current !== null) return;

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setPosition(pendingPositionRef.current);
    });
  }, []);

  const clampPosition = useCallback((clientX: number, clientY: number) => {
    const deltaX = clientX - dragRef.current.startX;
    const deltaY = clientY - dragRef.current.startY;
    const threshold = prefersReducedMotion.current ? 2 : 5;

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
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    hasDraggedRef.current = false;
    suppressClickRef.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: positionRef.current.x,
      startPosY: positionRef.current.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    commitPosition(clampPosition(e.clientX, e.clientY));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopDragging();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
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
    setExpanded((value) => !value);
  };

  const stopInteractivePropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleRateChange = (value: number) => {
    setLocalRate(value);
    onUpdateSettings({ rate: value });
  };

  const handlePitchChange = (value: number) => {
    setLocalPitch(value);
    onUpdateSettings({ pitch: value });
  };

  const handleVolumeChange = (value: number) => {
    setLocalVolume(value);
    onUpdateSettings({ volume: value });
  };

  const handleVoiceChange = (value: string) => {
    onUpdateSettings({ voiceName: value });
  };

  const handleStyleChange = (value: string) => {
    onUpdateSettings({ style: value === "__clear__" ? undefined : value });
  };

  const formatRate = (rate: number) => {
    if (rate === 0) return '正常';
    return `${rate > 0 ? '+' : ''}${rate}%`;
  };

  const formatPitch = (pitch: number) => {
    if (pitch === 0) return '正常';
    return `${pitch > 0 ? '+' : ''}${pitch}%`;
  };

  const isToolbar = variant === 'toolbar';
  const panelWidth = typeof window !== 'undefined' && window.innerWidth < 640
    ? Math.min(320, window.innerWidth - 24)
    : isToolbar
      ? 320
      : 256;
  const panelHeight = typeof window !== 'undefined'
    ? window.innerWidth < 640
      ? showSettingsPanel ? 360 : 214
      : showSettingsPanel ? 380 : 228
    : 380;

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  return (
    <div
      ref={rootRef}
      className={`relative ${isToolbar ? 'z-40' : ''}`}
      style={{ pointerEvents: 'auto' }}
    >
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
          className="relative z-40 inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border p-0 align-middle transition-all duration-200 hover:scale-[1.03] active:scale-95"
          style={{
            color: isActive ? uiScheme.link : uiScheme.buttonText,
            background: isActive ? uiScheme.cardBg : uiScheme.buttonBg,
            border: `1px solid ${isActive ? `${uiScheme.link}33` : `${uiScheme.cardBorder}66`}`,
            boxShadow: isActive
              ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 20px -18px ${uiScheme.link}40`
              : `inset 0 1px 0 ${uiScheme.headerBg}42, 0 10px 20px -18px ${uiScheme.cardBorder}26`,
            opacity: isPending ? 0.88 : 1,
          }}
        >
          <Volume2 className="h-3 w-3" />
          {isActive && (
            <span className="absolute right-[3px] top-[3px] flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
          )}
        </Button>
      ) : (
        <FloatingButton
          isActive={isActive}
          isDragging={isDragging}
          position={position}
          expanded={expanded}
          onClick={handleClick}
          onPointerDownCapture={stopInteractivePropagation}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          uiScheme={uiScheme}
        />
      )}

      {/* 展开面板 - 增强动画和布局 */}
      {expanded && (
        <>
          <div
            data-reader-interactive="true"
            className="fixed inset-0 z-30"
            onClick={() => setExpanded(false)}
            onPointerDown={stopInteractivePropagation}
            onTouchStart={stopInteractivePropagation}
            onTouchEnd={stopInteractivePropagation}
            aria-hidden="true"
          />

          <div
            data-reader-interactive="true"
            data-reader-tts-popup="true"
            className={isToolbar
              ? `absolute z-50 animate-in fade-in duration-200 ease-out
                motion-reduce:animate-in motion-reduce:fade-in motion-reduce:duration-100
                right-0 top-[calc(100%+10px)]`
              : `fixed z-40 animate-in slide-in-from-bottom-3 fade-in duration-250 ease-out
                motion-reduce:animate-in motion-reduce:fade-in motion-reduce:duration-100`}
            onClick={stopInteractivePropagation}
            onPointerDownCapture={stopInteractivePropagation}
            onPointerDown={stopInteractivePropagation}
            onTouchStart={stopInteractivePropagation}
            onTouchEnd={stopInteractivePropagation}
            onTouchMove={stopInteractivePropagation}
            style={{
              right: isToolbar
                ? undefined
                : Math.max(8, Math.min(position.x, window.innerWidth - panelWidth - 8)),
              bottom: isToolbar
                ? undefined
                : Math.max(8, Math.min(position.y + FAB_OFFSET, window.innerHeight - panelHeight - 8)),
              width: panelWidth,
            }}
          >
            <div
              className={`flex flex-col gap-3 rounded-[24px] border p-3 sm:p-4 ${
                isToolbar ? 'max-h-[min(78vh,560px)] overflow-y-auto' : ''
              }`}
              style={styles.panel}
            >
            <div className="flex items-start justify-between rounded-2xl border px-3.5 py-3" style={styles.section}>
              <div>
                <span
                  className="font-heading text-sm font-semibold tracking-wide"
                  style={{ color: uiScheme.fg }}
                >
                  {showSettingsPanel ? '朗读控制与偏好' : '朗读控制'}
                </span>
                <p className="mt-1 text-[11px]" style={{ color: uiScheme.mutedText }}>
                  {showSettingsPanel ? '播放控制、语速与声线设置' : '开始、暂停与切换段落'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setExpanded(false)}
                className="transition-all duration-150 ease-out hover:scale-110 active:scale-95
                  h-7 w-7 rounded-xl motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                style={{ color: uiScheme.mutedText, background: `${uiScheme.buttonBg}60` }}
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            </div>

            <div className="rounded-2xl border p-3 sm:p-3.5" style={styles.section}>
              <div className="mb-3 flex items-center gap-2">
                <label className="text-[11px] sm:text-xs font-medium" style={{ color: uiScheme.mutedText }}>
                  文字转语音
                </label>
              </div>

              {/* 播放按钮组 - 优化布局和交互 */}
              <div className="flex items-center justify-center gap-2 sm:gap-2.5 py-1.5 sm:py-2">
                <ControlButton
                  onClick={onPrev}
                  disabled={!isActive || isPending}
                  title="上一句"
                  active={isActive}
                  uiScheme={uiScheme}
                >
                  <SkipBack className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </ControlButton>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStartClick}
                  disabled={isPending}
                  title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                  aria-label={isPlaying ? '暂停播放' : isPaused ? '继续播放' : '开始播放'}
                  className="transition-all duration-200 ease-out hover:scale-105 active:scale-95 bg-transparent! hover:bg-transparent! aria-expanded:bg-transparent! dark:hover:bg-transparent!
                    h-10 w-10 sm:h-11 sm:w-11 rounded-2xl
                    motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
                  style={{
                    color: isPending ? uiScheme.mutedText : uiScheme.link,
                    boxShadow: !isPlaying && !isPending
                      ? `0 0 0 1px ${uiScheme.link}40`
                      : 'none',
                  }}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
                  ) : (
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
                  )}
                </Button>

                <ControlButton
                  onClick={onNext}
                  disabled={!isActive || isPending}
                  title="下一句"
                  active={isActive}
                  uiScheme={uiScheme}
                >
                  <SkipForward className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </ControlButton>

                <ControlButton
                  onClick={handleStopClick}
                  disabled={!isActive || isPending}
                  title="停止"
                  active={isActive}
                  variant="danger"
                  uiScheme={uiScheme}
                >
                  <Square className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </ControlButton>
              </div>
            </div>

            {showSettingsPanel && (
              <div
                className="flex flex-col gap-2.5 rounded-2xl border p-3 sm:p-3.5"
                style={styles.section}
              >
                <VoiceSlider
                  label="速度"
                  value={localRate}
                  onChange={handleRateChange}
                  min={-50}
                  max={100}
                  step={10}
                  format={formatRate}
                  uiScheme={uiScheme}
                />

                <VoiceSlider
                  label="音调"
                  value={localPitch}
                  onChange={handlePitchChange}
                  min={-50}
                  max={50}
                  step={10}
                  format={formatPitch}
                  uiScheme={uiScheme}
                />

                <VoiceSlider
                  label="音量"
                  value={localVolume}
                  onChange={handleVolumeChange}
                  min={0}
                  max={1}
                  step={0.1}
                  format={(v) => `${Math.round(v * 100)}%`}
                  uiScheme={uiScheme}
                />

                {/* 语音选择区域 */}
                {filteredVoices.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <label
                        className="text-[11px] sm:text-xs w-7 sm:w-8 shrink-0 font-medium"
                        style={{ color: uiScheme.mutedText }}
                      >
                        语种
                      </label>
                      <Select
                        value={selectedLocale}
                        onValueChange={handleLocaleChange}
                      >
                        <SelectTrigger
                          data-reader-interactive="true"
                          className="flex-1 min-w-0 max-w-full text-[11px] sm:text-xs h-7 sm:h-8 rounded-lg
                            transition-all duration-200 ease-out hover:border-opacity-60"
                          style={styles.selectTrigger}
                        >
                          <SelectValue placeholder="选择语种" className="truncate" />
                        </SelectTrigger>
                        <SelectContent
                          data-reader-interactive="true"
                          className="rounded-xl max-w-[200px]"
                          style={styles.selectContent}
                        >
                          {localeVoicesMap.map((item) => (
                            <SelectItem
                              key={item.locale}
                              value={item.locale}
                              className="text-[11px] sm:text-xs rounded-lg my-0.5 truncate"
                              style={{ color: uiScheme.fg }}
                            >
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <label
                        className="text-[11px] sm:text-xs w-7 sm:w-8 shrink-0 font-medium"
                        style={{ color: uiScheme.mutedText }}
                      >
                        语音
                      </label>
                      <Select
                        value={settings.voiceName}
                        onValueChange={handleVoiceChange}
                      >
                        <SelectTrigger
                          data-reader-interactive="true"
                          className="flex-1 min-w-0 max-w-full text-[11px] sm:text-xs h-7 sm:h-8 rounded-lg
                            transition-all duration-200 ease-out hover:border-opacity-60"
                          style={styles.selectTrigger}
                        >
                          <SelectValue placeholder="选择语音" className="truncate" />
                        </SelectTrigger>
                        <SelectContent
                          data-reader-interactive="true"
                          className="rounded-xl max-w-[220px]"
                          style={styles.selectContent}
                        >
                          {currentLocaleVoices.map((voice) => (
                            <SelectItem
                              key={voice.Name}
                              value={voice.Name}
                              className="text-[11px] sm:text-xs rounded-lg my-0.5 truncate"
                              style={{ color: uiScheme.fg }}
                            >
                              {voice.LocalName} ({voice.Gender === 'Female' ? '女' : voice.Gender === 'Male' ? '男' : ''})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* 风格选择 */}
                {availableStyles.length > 0 && (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <label
                      className="text-[11px] sm:text-xs w-7 sm:w-8 shrink-0 font-medium"
                      style={{ color: uiScheme.mutedText }}
                    >
                      风格
                    </label>
                    <Select
                      value={settings.style ?? "__clear__"}
                      onValueChange={handleStyleChange}
                    >
                      <SelectTrigger
                        data-reader-interactive="true"
                        className="flex-1 min-w-0 max-w-full text-[11px] sm:text-xs h-7 sm:h-8 rounded-lg
                          transition-all duration-200 ease-out hover:border-opacity-60"
                        style={styles.selectTrigger}
                      >
                        <SelectValue
                          placeholder="选择风格"
                          className="truncate"
                        />
                      </SelectTrigger>
                      <SelectContent
                        data-reader-interactive="true"
                        className="rounded-xl max-w-[200px]"
                        style={styles.selectContent}
                      >
                        <SelectItem
                          value="__clear__"
                          className="text-[11px] sm:text-xs rounded-lg my-0.5 truncate"
                          style={{ color: uiScheme.mutedText }}
                        >
                          不指定
                        </SelectItem>
                        {availableStyles.map((style) => (
                          <SelectItem
                            key={style}
                            value={style}
                            className="text-[11px] sm:text-xs rounded-lg my-0.5 truncate"
                            style={{ color: uiScheme.fg }}
                          >
                            {style}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
