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

// 提取通用样式配置
const useThemeStyles = (uiScheme: ThemeColors, isActive: boolean) => ({
  panel: {
    background: `${uiScheme.cardBg}fa`,
    borderColor: uiScheme.cardBorder,
    backdropFilter: 'blur(16px)',
  },
  selectTrigger: {
    background: uiScheme.buttonBg,
    borderColor: uiScheme.cardBorder,
    color: uiScheme.fg,
  },
  selectContent: {
    background: uiScheme.cardBg,
    borderColor: uiScheme.cardBorder,
  },
  fab: {
    background: isActive ? uiScheme.link : `${uiScheme.cardBg}f0`,
    border: `1.5px solid ${uiScheme.cardBorder}`,
  },
});

// 复用的 Slider 控件
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
  <div className="flex items-center gap-1.5 sm:gap-2">
    <label
      className="text-[10px] sm:text-xs w-7 sm:w-8 shrink-0"
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
      className="flex-1 [&_[role=slider]]:transition-transform [&_[role=slider]]:duration-150"
    />
    <span
      className="text-[10px] sm:text-xs w-9 sm:w-10 tabular-nums text-right font-medium"
      style={{ color: uiScheme.fg }}
    >
      {format(value)}
    </span>
  </div>
);

// 复用的控制按钮
interface ControlButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  variant?: 'default' | 'danger';
  uiScheme: ThemeColors;
}

const ControlButton = ({ onClick, disabled, title, children, active, variant, uiScheme }: ControlButtonProps) => (
  <Button
    variant="ghost"
    size="icon-sm"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="transition-all duration-200 hover:bg-opacity-20 hover:scale-110 active:scale-95 h-7 w-7 sm:h-8 sm:w-8 rounded-lg"
    style={{
      color: variant === 'danger' && active ? '#ef4444' : active ? uiScheme.fg : uiScheme.mutedText,
      opacity: disabled ? 0.5 : 1,
      background: active ? `${uiScheme.link}15` : 'transparent',
    }}
  >
    {children}
  </Button>
);

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

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      hasDraggedRef.current = true;
    }

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

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
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
      <div
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e as unknown as React.MouseEvent);
          }
        }}
        role="button"
        tabIndex={0}
        className="fixed z-40 w-11 h-11 sm:w-12 sm:h-12 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-200 touch-none"
        style={{
          right: position.x,
          bottom: position.y,
          ...styles.fab,
          boxShadow: isDragging
            ? `0 8px 32px ${uiScheme.link}40`
            : `0 4px 16px ${uiScheme.cardBorder}30, 0 2px 8px ${uiScheme.cardBorder}20`,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          pointerEvents: 'auto',
        }}
        title="控制面板（拖动移动）"
      >
        <Volume2
          className="w-4 h-4 sm:w-5 sm:h-5"
          style={{
            color: isActive ? uiScheme.bg : uiScheme.fg,
          }}
        />
        {isActive && (
          <div
            className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full"
            style={{
              background: '#22c55e',
              boxShadow: '0 0 8px #22c55e80',
            }}
          />
        )}
      </div>

      {expanded && (
        <div
          className="fixed z-40 animate-in slide-in-from-bottom-2 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          style={{
            right: Math.max(8, Math.min(position.x, window.innerWidth - panelWidth - 8)),
            bottom: Math.max(8, Math.min(position.y + 56, window.innerHeight - panelHeight - 8)),
            width: panelWidth,
          }}
        >
          <div
            className="flex flex-col gap-2 rounded-2xl border p-2.5 sm:p-3"
            style={{
              ...styles.panel,
              boxShadow: `0 8px 32px ${uiScheme.cardBorder}30, 0 2px 12px ${uiScheme.cardBorder}20`,
            }}
          >
            <div className="flex items-center justify-between mb-0.5 sm:mb-1">
              <span
                className="font-heading text-xs sm:text-sm"
                style={{ color: uiScheme.fg }}
              >
                控制面板
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setExpanded(false)}
                className="transition-all duration-150 hover:bg-opacity-20 hover:scale-110 active:scale-95 h-6 w-6 sm:h-7 sm:w-7 rounded-lg"
                style={{ color: uiScheme.mutedText }}
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            </div>

            <div
              className="border-t pt-1.5 sm:pt-2"
              style={{ borderColor: uiScheme.cardBorder }}
            >
              <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                <label
                  className="text-[10px] sm:text-xs"
                  style={{ color: uiScheme.mutedText }}
                >
                  文字转语音
                </label>
              </div>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2 py-1">
                <ControlButton
                  onClick={onPrev}
                  disabled={!isActive || isPending}
                  title="上一句"
                  active={isActive}
                  uiScheme={uiScheme}
                >
                  <SkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </ControlButton>

                <Button
                  variant={isPlaying ? 'outline' : 'default'}
                  size="icon"
                  onClick={handleStartClick}
                  disabled={isPending}
                  title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                  className="transition-all duration-200 hover:scale-105 active:scale-95 h-9 w-9 sm:h-10 sm:w-10 rounded-xl"
                  style={{
                    background: isPlaying
                      ? uiScheme.buttonBg
                      : `linear-gradient(135deg, ${uiScheme.link}, ${uiScheme.link}dd)`,
                    borderColor: isPlaying ? uiScheme.cardBorder : 'transparent',
                    color: isPlaying ? uiScheme.buttonText : uiScheme.bg,
                    opacity: isPending ? 0.5 : 1,
                    boxShadow: !isPlaying ? `0 2px 8px ${uiScheme.link}40` : 'none',
                  }}
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5" />
                  )}
                </Button>

                <ControlButton
                  onClick={onNext}
                  disabled={!isActive || isPending}
                  title="下一句"
                  active={isActive}
                  uiScheme={uiScheme}
                >
                  <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </ControlButton>

                <ControlButton
                  onClick={handleStopClick}
                  disabled={!isActive || isPending}
                  title="停止"
                  active={isActive}
                  variant="danger"
                  uiScheme={uiScheme}
                >
                  <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </ControlButton>
              </div>
            </div>

            <div
              className="flex flex-col gap-1.5 sm:gap-2 pt-1.5 sm:pt-2 border-t"
              style={{ borderColor: uiScheme.cardBorder }}
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

              {filteredVoices.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <label
                      className="text-[10px] sm:text-xs w-7 sm:w-8 shrink-0"
                      style={{ color: uiScheme.mutedText }}
                    >
                      语种
                    </label>
                    <Select
                      value={selectedLocale}
                      onValueChange={handleLocaleChange}
                    >
                      <SelectTrigger
                        className="flex-1 text-[10px] sm:text-xs h-6 sm:h-7"
                        style={styles.selectTrigger}
                      >
                        <SelectValue placeholder="选择语种" />
                      </SelectTrigger>
                      <SelectContent style={styles.selectContent}>
                        {localeVoicesMap.map((item) => (
                          <SelectItem
                            key={item.locale}
                            value={item.locale}
                            className="text-[10px] sm:text-xs"
                            style={{ color: uiScheme.fg }}
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <label
                      className="text-[10px] sm:text-xs w-7 sm:w-8 shrink-0"
                      style={{ color: uiScheme.mutedText }}
                    >
                      语音
                    </label>
                    <Select
                      value={settings.voiceName}
                      onValueChange={handleVoiceChange}
                    >
                      <SelectTrigger
                        className="flex-1 text-[10px] sm:text-xs h-6 sm:h-7"
                        style={styles.selectTrigger}
                      >
                        <SelectValue placeholder="选择语音" />
                      </SelectTrigger>
                      <SelectContent style={styles.selectContent}>
                        {currentLocaleVoices.map((voice) => (
                          <SelectItem
                            key={voice.Name}
                            value={voice.Name}
                            className="text-[10px] sm:text-xs"
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

              {availableStyles.length > 1 && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <label
                    className="text-[10px] sm:text-xs w-7 sm:w-8 shrink-0"
                    style={{ color: uiScheme.mutedText }}
                  >
                    风格
                  </label>
                  <Select
                    value={settings.style}
                    onValueChange={handleStyleChange}
                  >
                    <SelectTrigger
                      className="flex-1 text-[10px] sm:text-xs h-6 sm:h-7"
                      style={styles.selectTrigger}
                    >
                      <SelectValue placeholder="选择风格" />
                    </SelectTrigger>
                    <SelectContent style={styles.selectContent}>
                      {availableStyles.map((style) => (
                        <SelectItem
                          key={style}
                          value={style}
                          className="text-[10px] sm:text-xs"
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
