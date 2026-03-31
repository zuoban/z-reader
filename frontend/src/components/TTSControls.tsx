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
  ChevronLeft,
  ChevronRight,
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

interface TTSControlsProps {
  state: TTSState;
  settings: TTSSettings;
  voices: Voice[];
  onStart: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrev: () => void;
  onUpdateSettings: (settings: Partial<TTSSettings>) => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
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
  onPrevPage,
  onNextPage,
  uiScheme,
}: TTSControlsProps) {
  const [expanded, setExpanded] = useState(false);
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

  const handleMouseDown = (e: React.MouseEvent) => {
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
      window.addEventListener('touchend', handleTouchEnd);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleTouchStart = (e: React.TouchEvent) => {
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

  const handleTouchEnd = () => {
    setIsDragging(false);
    hasDraggedRef.current = false;
  };

  const handleClick = () => {
    if (!hasDraggedRef.current) {
      setExpanded(!expanded);
    }
    hasDraggedRef.current = false;
  };

  const handleRateChange = (value: number[]) => {
    setLocalRate(value[0]);
    onUpdateSettings({ rate: value[0] });
  };

  const handlePitchChange = (value: number[]) => {
    setLocalPitch(value[0]);
    onUpdateSettings({ pitch: value[0] });
  };

  const handleVolumeChange = (value: number[]) => {
    setLocalVolume(value[0]);
    onUpdateSettings({ volume: value[0] });
  };

  const handleVoiceChange = (value: string) => {
    onUpdateSettings({ voiceName: value });
  };

  const handleStyleChange = (value: string) => {
    onUpdateSettings({ style: value });
  };

  const formatRate = (rate: number) => {
    if (rate === 0) return '正常';
    return rate > 0 ? `+${rate}%` : `${rate}%`;
  };

  const formatPitch = (pitch: number) => {
    if (pitch === 0) return '正常';
    return pitch > 0 ? `+${pitch}%` : `${pitch}%`;
  };

  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const isActive = state !== 'stopped';

  const panelWidth = 256;
  const panelHeight = 380;

  return (
    <div className="relative">
      <div
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="fixed z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-shadow duration-150 touch-none"
        style={{
          right: position.x,
          bottom: position.y,
          background: isActive ? uiScheme.link : `${uiScheme.cardBg}ee`,
          border: `2px solid ${uiScheme.cardBorder}`,
          boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.25)' : '0 4px 12px rgba(0,0,0,0.15)',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        title="控制面板（拖动移动）"
      >
        <Volume2
          className="w-5 h-5"
          style={{
            color: isActive ? uiScheme.bg : uiScheme.fg,
          }}
        />
        {isActive && (
          <div
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
            style={{ background: '#22c55e' }}
          />
        )}
      </div>

      {expanded && (
        <div
          className="fixed z-40 w-64 animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{
            right: Math.max(8, Math.min(position.x, window.innerWidth - panelWidth - 8)),
            bottom: Math.max(8, Math.min(position.y + 56, window.innerHeight - panelHeight - 8)),
          }}
        >
          <div
            className="flex flex-col gap-2 backdrop-blur-md rounded-xl border p-3 shadow-xl"
            style={{
              background: `${uiScheme.cardBg}f5`,
              borderColor: uiScheme.cardBorder,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="font-heading text-sm"
                style={{ color: uiScheme.fg }}
              >
                控制面板
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setExpanded(false)}
                className="transition-transform hover:scale-110 active:scale-95"
                style={{ color: uiScheme.mutedText }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center justify-center gap-3 py-2">
              <Button
                variant="outline"
                size="icon"
                onClick={onPrevPage}
                title="上一页"
                className="transition-transform hover:scale-105 active:scale-95 h-10 w-10"
                style={{
                  background: `${uiScheme.buttonBg}ee`,
                  borderColor: uiScheme.cardBorder,
                  color: uiScheme.buttonText,
                }}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={onNextPage}
                title="下一页"
                className="transition-transform hover:scale-105 active:scale-95 h-10 w-10"
                style={{
                  background: `${uiScheme.buttonBg}ee`,
                  borderColor: uiScheme.cardBorder,
                  color: uiScheme.buttonText,
                }}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <div
              className="border-t pt-2"
              style={{ borderColor: uiScheme.cardBorder }}
            >
              <div className="flex items-center gap-2 mb-2">
                <label
                  className="text-xs"
                  style={{ color: uiScheme.mutedText }}
                >
                  文字转语音
                </label>
              </div>

              <div className="flex items-center justify-center gap-2 py-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onPrev}
                  disabled={!isActive}
                  title="上一句"
                  className="transition-transform hover:scale-110 active:scale-95"
                  style={{
                    color: isActive ? uiScheme.fg : uiScheme.mutedText,
                  }}
                >
                  <SkipBack className="w-4 h-4" />
                </Button>

                <Button
                  variant={isPlaying ? 'outline' : 'default'}
                  size="icon"
                  onClick={onStart}
                  title={isPlaying ? '暂停' : isPaused ? '继续' : '开始'}
                  className="transition-transform hover:scale-105 active:scale-95"
                  style={{
                    background: isPlaying
                      ? uiScheme.buttonBg
                      : uiScheme.link,
                    borderColor: uiScheme.cardBorder,
                    color: isPlaying ? uiScheme.buttonText : uiScheme.bg,
                  }}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onNext}
                  disabled={!isActive}
                  title="下一句"
                  className="transition-transform hover:scale-110 active:scale-95"
                  style={{
                    color: isActive ? uiScheme.fg : uiScheme.mutedText,
                  }}
                >
                  <SkipForward className="w-4 h-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onStop}
                  disabled={!isActive}
                  title="停止"
                  className="transition-transform hover:scale-110 active:scale-95"
                  style={{
                    color: isActive ? '#ef4444' : uiScheme.mutedText,
                  }}
                >
                  <Square className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div
              className="flex flex-col gap-2 pt-2 border-t"
              style={{ borderColor: uiScheme.cardBorder }}
            >
              <div className="flex items-center gap-2">
                <label
                  className="text-xs w-8 shrink-0"
                  style={{ color: uiScheme.mutedText }}
                >
                  速度
                </label>
                <Slider
                  value={[localRate]}
                  onValueChange={handleRateChange}
                  min={-50}
                  max={100}
                  step={10}
                  className="flex-1"
                />
                <span
                  className="text-xs w-10 tabular-nums text-right"
                  style={{ color: uiScheme.fg }}
                >
                  {formatRate(localRate)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <label
                  className="text-xs w-8 shrink-0"
                  style={{ color: uiScheme.mutedText }}
                >
                  音调
                </label>
                <Slider
                  value={[localPitch]}
                  onValueChange={handlePitchChange}
                  min={-50}
                  max={50}
                  step={10}
                  className="flex-1"
                />
                <span
                  className="text-xs w-10 tabular-nums text-right"
                  style={{ color: uiScheme.fg }}
                >
                  {formatPitch(localPitch)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <label
                  className="text-xs w-8 shrink-0"
                  style={{ color: uiScheme.mutedText }}
                >
                  音量
                </label>
                <Slider
                  value={[localVolume]}
                  onValueChange={handleVolumeChange}
                  min={0}
                  max={1}
                  step={0.1}
                  className="flex-1"
                />
                <span
                  className="text-xs w-10 tabular-nums text-right"
                  style={{ color: uiScheme.fg }}
                >
                  {Math.round(localVolume * 100)}%
                </span>
              </div>

              {filteredVoices.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <label
                      className="text-xs w-8 shrink-0"
                      style={{ color: uiScheme.mutedText }}
                    >
                      语种
                    </label>
                    <Select
                      value={selectedLocale}
                      onValueChange={handleLocaleChange}
                    >
                      <SelectTrigger
                        className="flex-1 text-xs h-7"
                        style={{
                          background: uiScheme.buttonBg,
                          borderColor: uiScheme.cardBorder,
                          color: uiScheme.fg,
                        }}
                      >
                        <SelectValue placeholder="选择语种" />
                      </SelectTrigger>
                      <SelectContent
                        style={{
                          background: uiScheme.cardBg,
                          borderColor: uiScheme.cardBorder,
                        }}
                      >
                        {localeVoicesMap.map((item) => (
                          <SelectItem
                            key={item.locale}
                            value={item.locale}
                            style={{ color: uiScheme.fg }}
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label
                      className="text-xs w-8 shrink-0"
                      style={{ color: uiScheme.mutedText }}
                    >
                      语音
                    </label>
                    <Select
                      value={settings.voiceName}
                      onValueChange={handleVoiceChange}
                    >
                      <SelectTrigger
                        className="flex-1 text-xs h-7"
                        style={{
                          background: uiScheme.buttonBg,
                          borderColor: uiScheme.cardBorder,
                          color: uiScheme.fg,
                        }}
                      >
                        <SelectValue placeholder="选择语音" />
                      </SelectTrigger>
                      <SelectContent
                        style={{
                          background: uiScheme.cardBg,
                          borderColor: uiScheme.cardBorder,
                        }}
                      >
                        {currentLocaleVoices.map((voice) => (
                          <SelectItem
                            key={voice.Name}
                            value={voice.Name}
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
                <div className="flex items-center gap-2">
                  <label
                    className="text-xs w-8 shrink-0"
                    style={{ color: uiScheme.mutedText }}
                  >
                    风格
                  </label>
                  <Select
                    value={settings.style}
                    onValueChange={handleStyleChange}
                  >
                    <SelectTrigger
                      className="flex-1 text-xs h-7"
                      style={{
                        background: uiScheme.buttonBg,
                        borderColor: uiScheme.cardBorder,
                        color: uiScheme.fg,
                      }}
                    >
                      <SelectValue placeholder="选择风格" />
                    </SelectTrigger>
                    <SelectContent
                      style={{
                        background: uiScheme.cardBg,
                        borderColor: uiScheme.cardBorder,
                      }}
                    >
                      {availableStyles.map((style) => (
                        <SelectItem
                          key={style}
                          value={style}
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