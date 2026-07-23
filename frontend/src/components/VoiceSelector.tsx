'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { buildAzureSSML, TTSSettings, Voice } from '@/lib/tts';
import { API_BASE, createAbortController } from '@/lib/config';
import { getAuthHeaders, handleAuthResponse } from '@/lib/api';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import { withOpacity } from '@/lib/reader-ui';

// 性别标签
const GENDER_LABELS: Record<string, string> = {
  Female: '女',
  Male: '男',
};

interface VoiceSelectorProps {
  settings: TTSSettings;
  voices: Voice[];
  voicesLoading?: boolean;
  voicesError?: string | null;
  onReloadVoices?: () => void | Promise<void>;
  onUpdateSettings: (settings: Partial<TTSSettings>) => void;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
}

export function VoiceSelector({
  settings,
  voices,
  voicesLoading = false,
  voicesError = null,
  onReloadVoices,
  onUpdateSettings,
  uiScheme,
  overlayContainer,
}: VoiceSelectorProps) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 仅保留中文语音
  const zhVoices = voices.filter(v => v.Locale.startsWith('zh'));

  // 当前选中语音支持的风格
  const selectedVoice = voices.find(v => v.Name === settings.voiceName);
  const availableStyles = selectedVoice?.StyleList || [];
  const compactGlassStyle = {
    background: `
      linear-gradient(145deg, ${withOpacity(uiScheme.fg, 0.04)} 0%, transparent 40%),
      ${withOpacity(uiScheme.buttonBg, 0.3)}
    `,
    border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.16)}`,
    boxShadow: `inset 0 1px 0 ${withOpacity("#ffffff", 0.14)}`,
  };

  const handleVoiceChange = useCallback((value: string) => {
    onUpdateSettings({ voiceName: value });
  }, [onUpdateSettings]);

  const handleStyleChange = useCallback((value: string) => {
    onUpdateSettings({ style: value === '__clear__' ? undefined : value });
  }, [onUpdateSettings]);

  const buildSSML = useCallback((text: string): string => {
    return buildAzureSSML(text, settings);
  }, [settings]);

  // 停止试听
  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPreviewing(false);
  }, []);

  // 试听
  const handlePreview = useCallback(async () => {
    if (isPreviewing) {
      stopPreview();
      return;
    }

    setIsPreviewing(true);

    const text = '你好，这是一个语音试听示例。';

    try {
      const ssml = buildSSML(text);
      const { controller, timeoutId } = createAbortController(30000);
      abortControllerRef.current = controller;

      const response = await fetch(`${API_BASE}/api/ssml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          ssml,
          output_format: 'audio-24khz-48kbitrate-mono-mp3',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      abortControllerRef.current = null;

      handleAuthResponse(response);
      if (!response.ok) {
        throw new Error(`语音试听失败，状态码：${response.status}`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);

      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        previewAudioRef.current = null;
        setIsPreviewing(false);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        previewAudioRef.current = null;
        setIsPreviewing(false);
      };

      await audio.play();
    } catch (err) {
      console.error('Preview error:', err);
      stopPreview();
    }
  }, [isPreviewing, buildSSML, stopPreview]);

  return (
    <div className="flex flex-col gap-3 px-0.5 py-0.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3
          className="text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: uiScheme.mutedText }}
        >
          声音设置
        </h3>
        <div className="flex items-center gap-1.5">
          {onReloadVoices && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onReloadVoices()}
              disabled={voicesLoading}
              aria-label="重新加载语音"
              className="h-9 rounded-xl px-2.5 text-xs font-semibold transition-all active:scale-[0.97]"
              style={{ ...compactGlassStyle, color: uiScheme.mutedText }}
            >
              {voicesLoading ? '加载中' : '重载'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreview}
            aria-label={isPreviewing ? '停止语音试听' : '试听当前语音'}
            className="h-9 rounded-xl px-2.5 text-xs font-semibold transition-all active:scale-[0.97]"
            style={{
              ...compactGlassStyle,
              color: isPreviewing ? uiScheme.link : uiScheme.mutedText,
              borderColor: isPreviewing
                ? withOpacity(uiScheme.link, 0.28)
                : withOpacity(uiScheme.cardBorder, 0.16),
            }}
          >
            {isPreviewing ? '停止' : '试听'}
          </Button>
        </div>
      </div>

      {(voicesLoading || voicesError) && (
        <div
          className="paper-motion-surface paper-field rounded-2xl border px-3 py-1.5 text-xs"
          style={{
            color: voicesError ? uiScheme.link : uiScheme.mutedText,
            borderColor: `${uiScheme.cardBorder}24`,
            background:
              `linear-gradient(135deg, ${withOpacity(uiScheme.fg, 0.04)} 0%, transparent 34%), ${withOpacity(uiScheme.buttonBg, 0.22)}`,
          }}
        >
          {voicesLoading ? '正在加载声音列表...' : voicesError}
        </div>
      )}

      {zhVoices.length > 0 && (
        <div className="space-y-1.5 px-1">
          <Select value={settings.voiceName} onValueChange={handleVoiceChange}>
            <SelectTrigger
              data-reader-interactive="true"
              className="min-h-11 w-full rounded-xl px-3.5 text-[13px] font-medium shadow-none transition-all hover:scale-[1.01] sm:min-h-9"
              style={{ ...compactGlassStyle, color: uiScheme.fg }}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="shrink-0 text-xs font-bold" style={{ color: uiScheme.mutedText }}>语音</span>
                <SelectValue placeholder="选择语音" className="truncate" />
              </div>
            </SelectTrigger>
            <SelectContent
              container={overlayContainer}
              data-reader-interactive="true"
              data-reader-tts-owned="true"
              className="max-w-[300px] rounded-2xl border-border/40 shadow-2xl "
              style={{
                background:
                  `linear-gradient(135deg, ${withOpacity(uiScheme.fg, 0.055)} 0%, transparent 34%), ${withOpacity(uiScheme.cardBg, 0.92)}`,
              }}
            >
              {zhVoices.map((voice) => (
                <SelectItem
                  key={voice.Name}
                  value={voice.Name}
                  className="my-0.5 truncate rounded-xl px-3 py-2.5 text-sm"
                  style={{ color: uiScheme.fg }}
                >
                  {voice.LocalName} ({GENDER_LABELS[voice.Gender] || ''})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {availableStyles.length > 0 && (
        <div className="space-y-1.5 px-1">
          <Select
            value={settings.style ?? '__clear__'}
            onValueChange={handleStyleChange}
          >
            <SelectTrigger
              data-reader-interactive="true"
              className="min-h-11 w-full rounded-xl px-3.5 text-[13px] font-medium shadow-none transition-all hover:scale-[1.01] sm:min-h-9"
              style={{ ...compactGlassStyle, color: uiScheme.fg }}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="shrink-0 text-xs font-bold" style={{ color: uiScheme.mutedText }}>风格</span>
                <SelectValue placeholder="选择风格" className="truncate" />
              </div>
            </SelectTrigger>
            <SelectContent
              container={overlayContainer}
              data-reader-interactive="true"
              data-reader-tts-owned="true"
              className="max-w-[260px] rounded-xl border-border/40 shadow-2xl "
              style={{
                background:
                  `linear-gradient(135deg, ${withOpacity(uiScheme.fg, 0.055)} 0%, transparent 34%), ${withOpacity(uiScheme.cardBg, 0.92)}`,
              }}
            >
              <SelectItem
                value="__clear__"
                className="my-0.5 truncate rounded-xl px-3 py-2.5 text-sm"
                style={{ color: uiScheme.mutedText }}
              >
                不指定
              </SelectItem>
              {availableStyles.map((style) => (
                <SelectItem
                  key={style}
                  value={style}
                  className="my-0.5 truncate rounded-xl px-3 py-2.5 text-sm"
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
  );
}
