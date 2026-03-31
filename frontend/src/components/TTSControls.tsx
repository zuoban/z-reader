'use client';

import { useState, useEffect, useRef } from 'react';
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

interface TTSControlsProps {
  state: TTSState;
  settings: TTSSettings;
  voices: Voice[];
  onStart: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrev: () => void;
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
  const [localRate, setLocalRate] = useState(settings.rate);
  const [localPitch, setLocalPitch] = useState(settings.pitch);
  const [localVolume, setLocalVolume] = useState(settings.volume);
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

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;
    
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      hasDraggedRef.current = true;
    }
    
    const newX = Math.max(0, Math.min(window.innerWidth - 48, dragRef.current.startPosX - deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, dragRef.current.startPosY - deltaY));
    
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    hasDraggedRef.current = false;
  };

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
  }, [isDragging]);

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
    if (rate === 0) return 'Normal';
    return rate > 0 ? `+${rate}%` : `${rate}%`;
  };

  const formatPitch = (pitch: number) => {
    if (pitch === 0) return 'Normal';
    return pitch > 0 ? `+${pitch}%` : `${pitch}%`;
  };

  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const isActive = state !== 'stopped';

  const selectedVoice = voices.find(v => v.Name === settings.voiceName);
  const availableStyles = selectedVoice?.StyleList || ['general'];

  const filteredVoices = voices.filter(v => 
    v.Locale.startsWith('zh') || 
    v.Locale.startsWith('en') ||
    v.Locale.startsWith('ja') ||
    v.Locale.startsWith('ko')
  );

  const panelWidth = 256;
  const panelHeight = 320;

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
        title="Controls (drag to move)"
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
                Controls
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

            <div
              className="border-t pt-2"
              style={{ borderColor: uiScheme.cardBorder }}
            >
              <div className="flex items-center gap-2 mb-2">
                <label
                  className="text-xs"
                  style={{ color: uiScheme.mutedText }}
                >
                  Text-to-Speech
                </label>
              </div>

              <div className="flex items-center justify-center gap-2 py-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onPrev}
                  disabled={!isActive}
                  title="Previous sentence"
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
                  title={isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Start'}
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
                  title="Next sentence"
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
                  title="Stop"
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
                  Speed
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
                  Pitch
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
                  Volume
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
                <div className="flex items-center gap-2">
                  <label
                    className="text-xs w-8 shrink-0"
                    style={{ color: uiScheme.mutedText }}
                  >
                    Voice
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
                      <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                    <SelectContent
                      style={{
                        background: uiScheme.cardBg,
                        borderColor: uiScheme.cardBorder,
                      }}
                    >
                      {filteredVoices.map((voice) => (
                        <SelectItem
                          key={voice.Name}
                          value={voice.Name}
                          style={{ color: uiScheme.fg }}
                        >
                          {voice.DisplayName} ({voice.Locale})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {availableStyles.length > 1 && (
                <div className="flex items-center gap-2">
                  <label
                    className="text-xs w-8 shrink-0"
                    style={{ color: uiScheme.mutedText }}
                  >
                    Style
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
                      <SelectValue placeholder="Select style" />
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