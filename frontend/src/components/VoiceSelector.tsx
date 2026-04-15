'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TTSSettings, Voice } from '@/lib/tts';
import { API_BASE, createAbortController } from '@/lib/config';
import type { ThemeColors } from '@/hooks/useReaderTheme';

// 性别标签
const GENDER_LABELS: Record<string, string> = {
  Female: '女',
  Male: '男',
};

interface VoiceSelectorProps {
  settings: TTSSettings;
  voices: Voice[];
  onUpdateSettings: (settings: Partial<TTSSettings>) => void;
  uiScheme: ThemeColors;
}

export function VoiceSelector({
  settings,
  voices,
  onUpdateSettings,
  uiScheme,
}: VoiceSelectorProps) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 仅保留中文语音
  const zhVoices = voices.filter(v => v.Locale.startsWith('zh'));

  // 当前选中语音支持的风格
  const selectedVoice = voices.find(v => v.Name === settings.voiceName);
  const availableStyles = selectedVoice?.StyleList || [];

  const handleVoiceChange = useCallback((value: string) => {
    onUpdateSettings({ voiceName: value });
  }, [onUpdateSettings]);

  const handleStyleChange = useCallback((value: string) => {
    onUpdateSettings({ style: value === '__clear__' ? undefined : value });
  }, [onUpdateSettings]);

  // 构建 SSML
  const buildSSML = useCallback((text: string): string => {
    const rateStr = settings.rate >= 0 ? `+${settings.rate}%` : `${settings.rate}%`;
    const styleAttr = settings.style ? ` style="${settings.style}"` : '';
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${settings.voiceName}"${styleAttr}>
    <prosody rate="${rateStr}">
      ${text}
    </prosody>
  </voice>
</speak>`;
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

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/ssml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({
          ssml,
          output_format: 'audio-24khz-48kbitrate-mono-mp3',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      abortControllerRef.current = null;

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
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

  const styles = {
    selectTrigger: {
      borderColor: `${uiScheme.cardBorder}36`,
      backgroundColor: `${uiScheme.buttonBg}54`,
      color: uiScheme.fg,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28)`,
    },
    selectContent: {
      backgroundColor: `${uiScheme.cardBg}f4`,
      borderColor: `${uiScheme.cardBorder}68`,
    },
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: uiScheme.mutedText }}>
            声线设置
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePreview}
          title={isPreviewing ? '停止' : '试听'}
          className="h-9 shrink-0 rounded-lg border px-3 text-sm font-semibold transition-all duration-200 ease-out hover:scale-[1.02] active:scale-95 motion-reduce:transition-none"
          style={{
            color: isPreviewing ? uiScheme.link : uiScheme.mutedText,
            backgroundColor: isPreviewing ? `${uiScheme.link}14` : `${uiScheme.buttonBg}34`,
            borderColor: isPreviewing ? `${uiScheme.link}3d` : `${uiScheme.cardBorder}28`,
          }}
        >
          {isPreviewing ? (
            <>
              <Square className="h-3.5 w-3.5" />
              停止试听
            </>
          ) : (
            <>
              <Play className="ml-0.5 h-3.5 w-3.5" />
              试听语音
            </>
          )}
        </Button>
      </div>

      {/* 语音选择 */}
      {zhVoices.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: uiScheme.mutedText }}>
            语音
          </label>
          <Select value={settings.voiceName} onValueChange={handleVoiceChange}>
            <SelectTrigger
              data-reader-interactive="true"
              className="h-12 min-w-0 flex-1 rounded-xl px-4 text-sm transition-all duration-200 ease-out hover:border-opacity-60"
              style={styles.selectTrigger}
            >
              <SelectValue placeholder="选择语音" className="truncate" />
            </SelectTrigger>
            <SelectContent
              data-reader-interactive="true"
              data-reader-tts-owned="true"
              className="max-w-[300px] rounded-xl"
              style={styles.selectContent}
            >
              {zhVoices.map((voice) => (
                <SelectItem
                  key={voice.Name}
                  value={voice.Name}
                  className="my-0.5 truncate rounded-lg px-3 py-2.5 text-sm"
                  style={{ color: uiScheme.fg }}
                >
                  {voice.LocalName} ({GENDER_LABELS[voice.Gender] || ''})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 风格选择 */}
      {availableStyles.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: uiScheme.mutedText }}>
            风格
          </label>
          <Select
            value={settings.style ?? '__clear__'}
            onValueChange={handleStyleChange}
          >
            <SelectTrigger
              data-reader-interactive="true"
              className="h-12 min-w-0 flex-1 rounded-xl px-4 text-sm transition-all duration-200 ease-out hover:border-opacity-60"
              style={styles.selectTrigger}
            >
              <SelectValue placeholder="选择风格" className="truncate" />
            </SelectTrigger>
            <SelectContent
              data-reader-interactive="true"
              data-reader-tts-owned="true"
              className="max-w-[260px] rounded-xl"
              style={styles.selectContent}
            >
              <SelectItem
                value="__clear__"
                className="my-0.5 truncate rounded-lg px-3 py-2.5 text-sm"
                style={{ color: uiScheme.mutedText }}
              >
                不指定
              </SelectItem>
              {availableStyles.map((style) => (
                <SelectItem
                  key={style}
                  value={style}
                  className="my-0.5 truncate rounded-lg px-3 py-2.5 text-sm"
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
