'use client';

import { useState, useEffect } from 'react';
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
  ChevronUp,
  ChevronDown,
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

  useEffect(() => {
    setLocalRate(settings.rate);
    setLocalPitch(settings.pitch);
    setLocalVolume(settings.volume);
  }, [settings]);

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

  return (
    <div
      className="flex flex-col gap-1 backdrop-blur-md rounded-lg border px-3 py-2 transition-all duration-200"
      style={{
        background: `${uiScheme.cardBg}ee`,
        borderColor: uiScheme.cardBorder,
      }}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onPrev}
          disabled={!isActive}
          title="Previous"
          className="transition-transform hover:scale-110 active:scale-95"
          style={{
            color: isActive ? uiScheme.fg : uiScheme.mutedText,
          }}
        >
          <SkipBack className="w-3.5 h-3.5" />
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
          size="icon-xs"
          onClick={onNext}
          disabled={!isActive}
          title="Next"
          className="transition-transform hover:scale-110 active:scale-95"
          style={{
            color: isActive ? uiScheme.fg : uiScheme.mutedText,
          }}
        >
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onStop}
          disabled={!isActive}
          title="Stop"
          className="transition-transform hover:scale-110 active:scale-95"
          style={{
            color: isActive ? '#ef4444' : uiScheme.mutedText,
          }}
        >
          <Square className="w-3.5 h-3.5" />
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setExpanded(!expanded)}
          title="Settings"
          className="transition-transform hover:scale-110 active:scale-95"
          style={{
            color: uiScheme.fg,
          }}
        >
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {expanded && (
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
      )}
    </div>
  );
}