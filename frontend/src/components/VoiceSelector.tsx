'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

const LOCALE_LABELS: Record<string, string> = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
};

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

  // 构建语言选项（从可用语音中提取）
  const localeOptions = [...new Map(
    voices.map(v => {
      const l = v.Locale.slice(0, 2);
      return [l, LOCALE_LABELS[l] || l];
    })
  ).entries()].map(([l, label]) => ({ locale: l, label }));

  // 初始化 selectedLocale：根据已选语音的语种或第一个可用语种
  const initialLocale = voices.length > 0
    ? (settings.voiceName
      ? (voices.find(v => v.Name === settings.voiceName)?.Locale.slice(0, 2) || localeOptions[0]?.locale || '')
      : (localeOptions[0]?.locale || ''))
    : '';

  const [selectedLocale, setSelectedLocale] = useState<string>(initialLocale);

  // 当前选中语种下的语音列表（无匹配时显示全部）
  const currentLocaleVoices = selectedLocale
    ? voices.filter(v => v.Locale.startsWith(selectedLocale))
    : voices;

  // 当前选中语音支持的风格
  const selectedVoice = voices.find(v => v.Name === settings.voiceName);
  const availableStyles = selectedVoice?.StyleList || [];

  const handleLocaleChange = useCallback((value: string) => {
    setSelectedLocale(value);
    const localeVoices = voices.filter(v => v.Locale.startsWith(value));
    if (localeVoices.length > 0) {
      // 如果当前选中的语音不在该语种下，切换到该语种的第一个语音
      const currentInLocale = localeVoices.find(v => v.Name === settings.voiceName);
      if (!currentInLocale) {
        onUpdateSettings({ voiceName: localeVoices[0].Name });
      }
    }
  }, [voices, settings.voiceName, onUpdateSettings]);

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

    // 根据语种选择试听文本
    const locale = selectedLocale || settings.voiceName.slice(0, 2);
    const previewTexts: Record<string, string> = {
      zh: '你好，这是一个语音试听示例。',
      en: 'Hello, this is a voice preview example.',
      ja: 'こんにちは、これは音声プレビューの例です。',
      ko: '안녕하세요, 음성 미리보기 예제입니다.',
    };
    const text = previewTexts[locale] || previewTexts.zh;

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
  }, [isPreviewing, selectedLocale, settings, buildSSML, stopPreview]);

  const styles = {
    selectTrigger: {
      borderColor: `${uiScheme.cardBorder}50`,
      backgroundColor: `${uiScheme.buttonBg}78`,
      color: uiScheme.fg,
    },
    selectContent: {
      backgroundColor: `${uiScheme.cardBg}f4`,
      borderColor: `${uiScheme.cardBorder}68`,
    },
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 语种 + 试听按钮行 */}
      <div className="flex items-center gap-2">
        <Select value={selectedLocale} onValueChange={handleLocaleChange}>
          <SelectTrigger
            data-reader-interactive="true"
            className="flex-1 min-w-0 text-[11px] sm:text-xs h-8 rounded-lg
              transition-all duration-200 ease-out hover:border-opacity-60"
            style={styles.selectTrigger}
          >
            <SelectValue placeholder="选择语种" className="truncate" style={{ color: uiScheme.fg }} />
          </SelectTrigger>
          <SelectContent
            data-reader-interactive="true"
            className="rounded-xl max-w-[200px]"
            style={styles.selectContent}
          >
            {localeOptions.map(({ locale, label }) => (
              <SelectItem
                key={locale}
                value={locale}
                className="text-[11px] sm:text-xs rounded-lg my-0.5 truncate"
                style={{ color: uiScheme.fg }}
              >
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          onClick={handlePreview}
          title={isPreviewing ? '停止' : '试听'}
          className="h-8 w-8 shrink-0 rounded-lg transition-all duration-200 ease-out
            hover:scale-105 active:scale-95 motion-reduce:transition-none"
          style={{
            color: isPreviewing ? uiScheme.link : uiScheme.mutedText,
            backgroundColor: isPreviewing ? `${uiScheme.link}15` : `${uiScheme.buttonBg}30`,
            borderColor: isPreviewing ? `${uiScheme.link}40` : 'transparent',
            borderWidth: '1px',
          }}
        >
          {isPreviewing ? (
            <Square className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5 ml-0.5" />
          )}
        </Button>
      </div>

      {/* 语音选择 */}
      {currentLocaleVoices.length > 0 && (
        <Select value={settings.voiceName} onValueChange={handleVoiceChange}>
          <SelectTrigger
            data-reader-interactive="true"
            className="flex-1 min-w-0 text-[11px] sm:text-xs h-8 rounded-lg
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
                {voice.LocalName} ({GENDER_LABELS[voice.Gender] || ''})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 风格选择 */}
      {availableStyles.length > 0 && (
        <Select
          value={settings.style ?? '__clear__'}
          onValueChange={handleStyleChange}
        >
          <SelectTrigger
            data-reader-interactive="true"
            className="flex-1 min-w-0 text-[11px] sm:text-xs h-8 rounded-lg
              transition-all duration-200 ease-out hover:border-opacity-60"
            style={styles.selectTrigger}
          >
            <SelectValue placeholder="选择风格" className="truncate" />
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
      )}
    </div>
  );
}
