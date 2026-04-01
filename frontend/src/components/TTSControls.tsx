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
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
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
    primaryLight: `rgba(${r}, ${g}, ${b}, 0.93)`,
    primaryDark: `rgba(${r}, ${g}, ${b}, 0.8)`,

    // 光环颜色
    glowInner: `rgba(${r}, ${g}, ${b}, 0.15)`,
    glowOuter: `rgba(${r}, ${g}, ${b}, 0.07)`,

    // 波形渐变
    waveStart: `rgba(${r}, ${g}, ${b}, 0.44)`,
    waveEnd: `rgba(${r}, ${g}, ${b}, 0.19)`,

    // 边框
    border: `rgba(${r}, ${g}, ${b}, 0.38)`,
    borderHighlight: `rgba(${r}, ${g}, ${b}, 0.5)`,
  };
};

// 声音波形动画组件 - 播放时显示，使用主题色
const SoundWaveAnimation = ({ uiScheme }: { uiScheme: ThemeColors }) => {
  const colors = getActiveColorScheme(uiScheme.link);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden motion-reduce:hidden">
      {/* 波形条 - 使用主题色渐变 */}
      <div className="relative flex items-center gap-0.5 h-full py-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="w-1 rounded-full"
            style={{
              background: `linear-gradient(180deg, ${colors.waveStart} 0%, ${colors.waveEnd} 100%)`,
              height: index === 2 ? 22 : index % 2 === 0 ? 14 : 18,
              animation: `soundWave ${550 + index * 70}ms ease-in-out infinite`,
              animationDelay: `${index * 50}ms`,
              opacity: 0.85,
              boxShadow: `0 0 8px ${colors.glowInner}`,
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
      {/* 外层大光环 - 柔和扩散 */}
      <div
        className="absolute rounded-2xl motion-reduce:hidden"
        style={{
          inset: -6,
          background: `radial-gradient(circle, ${colors.glowOuter} 0%, transparent 70%)`,
          boxShadow: `0 0 80px ${colors.glowOuter}, 0 0 120px ${colors.glowOuter}`,
          animation: 'glowPulse 2.5s ease-in-out infinite',
        }}
      />
      {/* 中层光环 - 聚焦效果 */}
      <div
        className="absolute rounded-2xl motion-reduce:hidden"
        style={{
          inset: -3,
          background: `radial-gradient(circle, ${colors.glowInner} 0%, transparent 60%)`,
          boxShadow: `0 0 40px ${colors.glowInner}`,
          animation: 'glowPulse 2s ease-in-out infinite',
          animationDelay: '0.4s',
        }}
      />
    </>
  );
};

// 活动状态指示器 - 使用绿色系保持独立性
const ActiveIndicator = ({ uiScheme }: { uiScheme: ThemeColors }) => (
  <div className="absolute -top-1.5 -right-1.5 motion-reduce:static">
    {/* 外层光环 */}
    <div
      className="absolute rounded-full motion-reduce:hidden"
      style={{
        width: 16,
        height: 16,
        left: -3,
        top: -3,
        background: 'radial-gradient(circle, #22c55e30 0%, transparent 70%)',
        boxShadow: '0 0 20px #22c55e50',
        animation: 'indicatorPulse 1.5s ease-in-out infinite',
      }}
    />
    {/* 主指示器 - 渐变绿色 */}
    <div
      className="relative w-3.5 h-3.5 rounded-full motion-reduce:animate-none"
      style={{
        background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 50%, #16a34a 100%)',
        boxShadow: `
          0 0 12px #22c55e90,
          0 0 20px #22c55e50,
          inset 0 1px 0 rgba(255,255,255,0.4),
          inset 0 -1px 0 rgba(0,0,0,0.1)
        `,
        border: `2px solid ${uiScheme.bg}`,
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
  onMouseDown,
  onTouchStart,
  onTouchEnd,
  uiScheme,
}: FloatingButtonProps) => {
  // 获取播放状态颜色方案
  const colors = getActiveColorScheme(uiScheme.link);

  // 播放状态样式 - 使用多色渐变
  const getActiveStyles = () => {
    if (!isActive) {
      return {
        background: `linear-gradient(135deg, ${uiScheme.cardBg}f8 0%, ${uiScheme.cardBg}f0 100%)`,
        border: `2px solid ${uiScheme.cardBorder}40`,
        boxShadow: isDragging
          ? `0 12px 40px ${uiScheme.cardBorder}30, 0 6px 20px ${uiScheme.cardBorder}20`
          : `0 4px 20px ${uiScheme.cardBorder}20, 0 2px 10px ${uiScheme.cardBorder}10`,
      };
    }

    // 播放状态 - 多层渐变，从亮到暗
    return {
      background: `linear-gradient(135deg,
        ${colors.primary} 0%,
        ${colors.primaryLight} 30%,
        ${colors.primary} 60%,
        ${colors.primaryDark} 100%)`,
      border: `2px solid ${colors.border}`,
      boxShadow: isDragging
        ? `0 16px 48px ${colors.glowInner}, 0 8px 24px ${colors.glowOuter},
           inset 0 2px 0 rgba(255,255,255,0.2), inset 0 -2px 0 ${colors.primaryDark}`
        : `0 8px 32px ${colors.glowInner}, 0 4px 16px ${colors.glowOuter},
           inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 ${colors.primaryDark}`,
    };
  };

  const fabStyles = getActiveStyles();

  return (
    <div
      onClick={onClick}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
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
        width: 52,
        height: 52,
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
        className="relative w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden
          transition-all duration-250 ease-out
          motion-reduce:transition-none"
        style={{
          ...fabStyles,
          transform: isDragging ? 'scale(1.08)' : undefined,
        }}
      >
        {/* 内部光泽层 - 播放时使用白色高光 */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background: isActive
              ? `linear-gradient(180deg,
                  rgba(255,255,255,0.35) 0%,
                  rgba(255,255,255,0.15) 25%,
                  transparent 50%)`
              : `linear-gradient(180deg, ${uiScheme.fg}12 0%, transparent 50%)`,
            opacity: isActive ? 1 : 0.3,
          }}
        />

        {/* 底部暗色层 - 增强立体感，使用主色暗色 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3 rounded-b-2xl"
          style={{
            background: isActive
              ? `linear-gradient(0deg, ${colors.primaryDark}40 0%, transparent 100%)`
              : 'transparent',
          }}
        />

        {/* 声音波形动画 */}
        {isActive && <SoundWaveAnimation uiScheme={uiScheme} />}

        {/* 图标 - 播放时使用白色 */}
        <Volume2
          className="w-5 h-5 transition-all duration-200 ease-out relative z-10
            motion-reduce:transition-none"
          style={{
            color: isActive ? '#ffffff' : uiScheme.fg,
            filter: isActive
              ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.25)) drop-shadow(0 0 4px rgba(255,255,255,0.3))'
              : undefined,
          }}
        />

        {/* 活动状态指示器 */}
        {isActive && <ActiveIndicator uiScheme={uiScheme} />}
      </div>

      {/* Hover 效果层 - 播放时显示 */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100
            transition-opacity duration-300 ease-out motion-reduce:hidden pointer-events-none"
          style={{
            background: `radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)`,
            transform: 'scale(1.2)',
            boxShadow: `0 0 50px ${colors.glowInner}`,
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
      ? `${uiScheme.cardBg}f8`
      : `${uiScheme.cardBg}f0`,
    borderColor: `${uiScheme.cardBorder}80`,
    backdropFilter: 'blur(20px) saturate(180%)',
    boxShadow: isActive
      ? `0 8px 32px ${uiScheme.link}20, 0 2px 12px ${uiScheme.cardBorder}15`
      : `0 4px 24px ${uiScheme.cardBorder}20`,
  },
  selectTrigger: {
    background: `${uiScheme.buttonBg}d0`,
    borderColor: `${uiScheme.cardBorder}60`,
    color: uiScheme.fg,
    transition: 'all 0.2s ease-out',
  },
  selectContent: {
    background: `${uiScheme.cardBg}f5`,
    borderColor: `${uiScheme.cardBorder}70`,
    backdropFilter: 'blur(16px)',
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
  <div className="flex items-center gap-2 sm:gap-3 group">
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
      className="transition-all duration-200 ease-out hover:scale-110 active:scale-95 h-8 w-8 sm:h-9 sm:w-9 rounded-xl
        motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
      style={{
        color: getButtonColor(),
        opacity: disabled ? 0.4 : 1,
        background: active
          ? variant === 'accent'
            ? `${uiScheme.link}20`
            : `${uiScheme.link}12`
          : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
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
  const hasDraggedRef = useRef(false);

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

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;

    // 优化拖动检测阈值
    const threshold = prefersReducedMotion.current ? 2 : 5;
    if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
      hasDraggedRef.current = true;
    }

    // 使用 transform 优化性能，而非直接修改位置
    const newX = Math.max(0, Math.min(window.innerWidth - 48, dragRef.current.startPosX - deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, dragRef.current.startPosY - deltaY));

    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (!hasDraggedRef.current) {
      setExpanded(e => !e);
    }
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEndEvent);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEndEvent);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (!isDragging) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - dragRef.current.startX;
    const deltaY = touch.clientY - dragRef.current.startY;

    // 优化拖动检测阈值
    const threshold = prefersReducedMotion.current ? 2 : 5;
    if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
      hasDraggedRef.current = true;
    }

    const newX = Math.max(0, Math.min(window.innerWidth - 48, dragRef.current.startPosX - deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, dragRef.current.startPosY - deltaY));

    setPosition({ x: newX, y: newY });
  };

  const handleTouchEndEvent = () => {
    setIsDragging(false);
    hasDraggedRef.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(false);
    if (!hasDraggedRef.current) {
      setExpanded(expanded => !expanded);
    }
    hasDraggedRef.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
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
    onUpdateSettings({ style: value });
  };

  const formatRate = (rate: number) => {
    if (rate === 0) return '正常';
    return `${rate > 0 ? '+' : ''}${rate}%`;
  };

  const formatPitch = (pitch: number) => {
    if (pitch === 0) return '正常';
    return `${pitch > 0 ? '+' : ''}${pitch}%`;
  };

  const panelWidth = window.innerWidth < 640 ? Math.min(280, window.innerWidth - 16) : 256;
  const panelHeight = window.innerWidth < 640 ? 360 : 380;

  return (
    <div className="relative" style={{ pointerEvents: 'auto' }}>
      {/* 悬浮按钮 */}
      <FloatingButton
        isActive={isActive}
        isDragging={isDragging}
        position={position}
        expanded={expanded}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        uiScheme={uiScheme}
      />

      {/* 展开面板 - 增强动画和布局 */}
      {expanded && (
        <div
          className="fixed z-40 animate-in slide-in-from-bottom-3 fade-in duration-250 ease-out
            motion-reduce:animate-in motion-reduce:fade-in motion-reduce:duration-100"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          style={{
            right: Math.max(8, Math.min(position.x, window.innerWidth - panelWidth - 8)),
            bottom: Math.max(8, Math.min(position.y + 60, window.innerHeight - panelHeight - 8)),
            width: panelWidth,
          }}
        >
          <div
            className="flex flex-col gap-2 sm:gap-2.5 rounded-2xl border p-3 sm:p-4"
            style={styles.panel}
          >
            {/* 面板头部 */}
            <div className="flex items-center justify-between mb-1 sm:mb-1.5">
              <span
                className="font-heading text-xs sm:text-sm font-semibold tracking-wide"
                style={{ color: uiScheme.fg }}
              >
                控制面板
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setExpanded(false)}
                className="transition-all duration-150 ease-out hover:scale-110 active:scale-95
                  h-6 w-6 sm:h-7 sm:w-7 rounded-lg
                  motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                style={{ color: uiScheme.mutedText }}
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            </div>

            {/* 播放控制区域 */}
            <div
              className="border-t pt-2 sm:pt-2.5"
              style={{ borderColor: `${uiScheme.cardBorder}40` }}
            >
              <div className="flex items-center gap-2 mb-2 sm:mb-2.5">
                <label
                  className="text-[11px] sm:text-xs font-medium"
                  style={{ color: uiScheme.mutedText }}
                >
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

                {/* 主播放按钮 - 增强视觉效果 */}
                <Button
                  variant={isPlaying ? 'outline' : 'default'}
                  size="icon"
                  onClick={handleStartClick}
                  disabled={isPending}
                  title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                  aria-label={isPlaying ? '暂停播放' : isPaused ? '继续播放' : '开始播放'}
                  className="transition-all duration-200 ease-out hover:scale-105 active:scale-95
                    h-9 w-9 sm:h-10 sm:w-10 rounded-xl
                    motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                  style={{
                    background: isPlaying
                      ? uiScheme.buttonBg
                      : `linear-gradient(135deg, ${uiScheme.link}, ${uiScheme.link}dd)`,
                    borderColor: isPlaying ? `${uiScheme.cardBorder}60` : 'transparent',
                    color: isPlaying ? uiScheme.buttonText : uiScheme.bg,
                    opacity: isPending ? 0.5 : 1,
                    boxShadow: !isPlaying
                      ? `0 4px 16px ${uiScheme.link}30, 0 2px 8px ${uiScheme.link}20`
                      : `0 2px 8px ${uiScheme.cardBorder}15`,
                  }}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  ) : (
                    <Play className="w-4 h-4 sm:w-4.5 sm:h-4.5 ml-0.5" />
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

            {/* 参数调节区域 */}
            <div
              className="flex flex-col gap-2 sm:gap-2.5 pt-2 sm:pt-2.5 border-t"
              style={{ borderColor: `${uiScheme.cardBorder}40` }}
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
                        className="flex-1 text-[11px] sm:text-xs h-7 sm:h-8 rounded-lg
                          transition-all duration-200 ease-out hover:border-opacity-60"
                        style={styles.selectTrigger}
                      >
                        <SelectValue placeholder="选择语种" />
                      </SelectTrigger>
                      <SelectContent
                        className="rounded-xl"
                        style={styles.selectContent}
                      >
                        {localeVoicesMap.map((item) => (
                          <SelectItem
                            key={item.locale}
                            value={item.locale}
                            className="text-[11px] sm:text-xs rounded-lg my-0.5"
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
                        className="flex-1 text-[11px] sm:text-xs h-7 sm:h-8 rounded-lg
                          transition-all duration-200 ease-out hover:border-opacity-60"
                        style={styles.selectTrigger}
                      >
                        <SelectValue placeholder="选择语音" />
                      </SelectTrigger>
                      <SelectContent
                        className="rounded-xl"
                        style={styles.selectContent}
                      >
                        {currentLocaleVoices.map((voice) => (
                          <SelectItem
                            key={voice.Name}
                            value={voice.Name}
                            className="text-[11px] sm:text-xs rounded-lg my-0.5"
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
              {availableStyles.length > 1 && (
                <div className="flex items-center gap-2 sm:gap-3">
                  <label
                    className="text-[11px] sm:text-xs w-7 sm:w-8 shrink-0 font-medium"
                    style={{ color: uiScheme.mutedText }}
                  >
                    风格
                  </label>
                  <Select
                    value={settings.style}
                    onValueChange={handleStyleChange}
                  >
                    <SelectTrigger
                      className="flex-1 text-[11px] sm:text-xs h-7 sm:h-8 rounded-lg
                        transition-all duration-200 ease-out hover:border-opacity-60"
                      style={styles.selectTrigger}
                    >
                      <SelectValue placeholder="选择风格" />
                    </SelectTrigger>
                    <SelectContent
                      className="rounded-xl"
                      style={styles.selectContent}
                    >
                      {availableStyles.map((style) => (
                        <SelectItem
                          key={style}
                          value={style}
                          className="text-[11px] sm:text-xs rounded-lg my-0.5"
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
          </div>
        </div>
      )}
    </div>
  );
}
