'use client';

import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import { Combobox, InputBase, useCombobox } from '@mantine/core';
import '@mantine/core/styles/Input.layer.css';
import '@mantine/core/styles/Popover.layer.css';
import '@mantine/core/styles/Combobox.layer.css';
import { Check, ChevronDown, Loader2, RotateCw, Square, Volume2 } from 'lucide-react';
import { buildAzureSSML } from '@/lib/tts';
import { API_BASE, createAbortController } from '@/lib/config';
import { handleAuthResponse } from '@/lib/api';
import { getAccessGeneration } from '@/lib/library-access';
import { claimTTSAudioFocus } from '@/lib/tts-audio-focus';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import { getReaderPanelThemeVars } from '@/lib/reader-ui';
import { cn } from '@/lib/utils';
import type { TTSSettings, Voice } from '@/lib/tts';

// 性别标签
const GENDER_LABELS: Record<string, string> = {
  Female: '女',
  Male: '男',
};

interface ReaderSelectOption {
  value: string;
  label: string;
  muted?: boolean;
}

interface ReaderSelectProps {
  ariaLabel: string;
  prefixLabel: string;
  placeholder: string;
  value: string;
  options: ReaderSelectOption[];
  onValueChange: (value: string) => void;
  onDropdownOpenChange?: (open: boolean) => void;
  panelThemeVars: CSSProperties;
  overlayContainer?: HTMLElement | null;
  dropdownMaxWidth?: string;
}

function ReaderSelect({
  ariaLabel,
  prefixLabel,
  placeholder,
  value,
  options,
  onValueChange,
  onDropdownOpenChange,
  panelThemeVars,
  overlayContainer,
  dropdownMaxWidth = 'max-w-[min(300px,calc(100vw-2rem))]',
}: ReaderSelectProps) {
  const onDropdownOpenChangeRef = useRef(onDropdownOpenChange);
  useEffect(() => {
    onDropdownOpenChangeRef.current = onDropdownOpenChange;
  }, [onDropdownOpenChange]);

  const combobox = useCombobox({
    onOpenedChange: (opened) => {
      onDropdownOpenChangeRef.current?.(opened);
    },
    onDropdownOpen: () => {
      combobox.updateSelectedOptionIndex('active');
    },
  });
  const { dropdownOpened, closeDropdown } = combobox;
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    return () => {
      onDropdownOpenChangeRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    if (!dropdownOpened) return;

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closeDropdown('keyboard');
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [dropdownOpened, closeDropdown]);

  return (
    <Combobox
      store={combobox}
      withinPortal
      keepMounted={false}
      zIndex={100}
      portalProps={{ target: overlayContainer ?? undefined }}
      onOptionSubmit={(nextValue) => {
        onValueChange(nextValue);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target targetType="button" withExpandedAttribute>
        <InputBase
          component="button"
          type="button"
          pointer
          aria-label={ariaLabel}
          data-reader-interactive="true"
          rightSection={
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-4 w-4 transition-transform duration-150 motion-reduce:transition-none',
                dropdownOpened && 'rotate-180',
              )}
              style={{ color: 'var(--reader-panel-muted)' }}
            />
          }
          rightSectionPointerEvents="none"
          onClick={() => combobox.toggleDropdown()}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && combobox.dropdownOpened) {
              event.preventDefault();
              event.stopPropagation();
              event.nativeEvent.stopPropagation();
              combobox.closeDropdown('keyboard');
            }
          }}
          classNames={{
            input: 'reader-select-trigger',
          }}
          styles={{
            input: {
              height: 'auto',
            },
          }}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span
              className="shrink-0 text-xs font-medium"
              style={{ color: 'var(--reader-panel-muted)' }}
            >
              {prefixLabel}
            </span>
            <span
              className="truncate"
              style={{
                color: selectedOption?.muted
                  ? 'var(--reader-panel-muted)'
                  : 'var(--reader-panel-fg)',
              }}
            >
              {selectedOption?.label ?? placeholder}
            </span>
          </div>
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown
        data-reader-interactive="true"
        data-reader-tts-owned="true"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && combobox.dropdownOpened) {
            event.preventDefault();
            event.stopPropagation();
            event.nativeEvent.stopPropagation();
            combobox.closeDropdown('keyboard');
          }
        }}
        className={cn(dropdownMaxWidth, 'reader-select-dropdown rounded-xl p-1')}
        style={panelThemeVars}
      >
        <Combobox.Options className="custom-scrollbar max-h-60 overflow-y-auto overscroll-contain">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Combobox.Option
                key={option.value}
                value={option.value}
                active={isSelected}
                aria-selected={isSelected}
                data-muted={option.muted && !isSelected ? 'true' : undefined}
                className={cn(
                  'reader-select-option',
                  isSelected && 'font-medium',
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <Check
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: 'var(--reader-panel-accent)' }}
                  />
                )}
              </Combobox.Option>
            );
          })}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

interface VoiceSelectorProps {
  settings: TTSSettings;
  voices: Voice[];
  voicesLoading?: boolean;
  voicesError?: string | null;
  onReloadVoices?: () => void | Promise<void>;
  onUpdateSettings: (settings: Partial<TTSSettings>) => void;
  onPreviewStart?: () => void;
  onPreviewEnd?: () => void;
  onDropdownOpenChange?: (open: boolean) => void;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
}

interface PreviewSession {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
  audio: HTMLAudioElement | null;
  url: string | null;
  disposed: boolean;
  releaseFocus?: () => void;
  onEnd?: () => void;
}

export function VoiceSelector({
  settings,
  voices,
  voicesLoading = false,
  voicesError = null,
  onReloadVoices,
  onUpdateSettings,
  onPreviewStart,
  onPreviewEnd,
  onDropdownOpenChange,
  uiScheme,
  overlayContainer,
}: VoiceSelectorProps) {
  const [previewPhase, setPreviewPhase] = useState<'idle' | 'loading' | 'playing'>('idle');
  const isPreviewing = previewPhase !== 'idle';
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRef = useRef<PreviewSession | null>(null);
  const mountedRef = useRef(true);
  const openDropdownsRef = useRef({ voice: false, style: false });
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);

  const handleSelectDropdownOpenChange = useCallback(
    (field: 'voice' | 'style', open: boolean) => {
      if (openDropdownsRef.current[field] === open) return;
      openDropdownsRef.current[field] = open;
      onDropdownOpenChange?.(
        openDropdownsRef.current.voice || openDropdownsRef.current.style
      );
    },
    [onDropdownOpenChange]
  );

  const handleVoiceDropdownOpenChange = useCallback(
    (open: boolean) => handleSelectDropdownOpenChange('voice', open),
    [handleSelectDropdownOpenChange]
  );

  const handleStyleDropdownOpenChange = useCallback(
    (open: boolean) => handleSelectDropdownOpenChange('style', open),
    [handleSelectDropdownOpenChange]
  );

  // 仅保留中文语音
  const zhVoices = voices.filter(v => v.Locale.startsWith('zh'));

  // 当前选中语音支持的风格
  const selectedVoice = voices.find(v =>
    (v.ShortName || v.Name) === settings.voiceName || v.Name === settings.voiceName);
  const availableStyles = selectedVoice?.StyleList || [];

  const handleVoiceChange = useCallback((value: string) => {
    const nextVoice = voices.find(voice => (voice.ShortName || voice.Name) === value);
    setPreviewError(null);
    onUpdateSettings({
      voiceName: value,
      ...(settings.style && !nextVoice?.StyleList?.includes(settings.style)
        ? { style: undefined } : {}),
    });
  }, [onUpdateSettings, settings.style, voices]);

  const handleStyleChange = useCallback((value: string) => {
    setPreviewError(null);
    onUpdateSettings({ style: value === '__clear__' ? undefined : value });
  }, [onUpdateSettings]);

  const buildSSML = useCallback((text: string): string => {
    return buildAzureSSML(text, settings);
  }, [settings]);

  const finishPreview = useCallback((session: PreviewSession) => {
    if (session.disposed) return;
    session.disposed = true;
    session.releaseFocus?.();
    clearTimeout(session.timeoutId);
    session.controller.abort();
    if (session.audio) {
      session.audio.onended = null;
      session.audio.onerror = null;
      session.audio.pause();
      session.audio.removeAttribute('src');
      session.audio.load();
      session.audio = null;
    }
    if (session.url) {
      URL.revokeObjectURL(session.url);
      session.url = null;
    }
    if (previewRef.current === session) {
      previewRef.current = null;
      if (mountedRef.current) setPreviewPhase('idle');
    }
    session.onEnd?.();
  }, []);

  const stopPreview = useCallback(() => {
    if (previewRef.current) finishPreview(previewRef.current);
  }, [finishPreview]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPreview();
    };
  }, [stopPreview]);

  useEffect(() => () => stopPreview(), [
    settings.voiceName, settings.style, settings.rate, stopPreview,
  ]);

  const handlePreview = useCallback(async () => {
    if (previewRef.current) {
      stopPreview();
      return;
    }

    const { controller, timeoutId } = createAbortController(30000);
    const session: PreviewSession = {
      controller, timeoutId, audio: null, url: null, disposed: false, onEnd: onPreviewEnd,
    };
    previewRef.current = session;
    setPreviewPhase('loading');
    setPreviewError(null);
    const isActive = () => previewRef.current === session && !session.disposed;
    controller.signal.addEventListener('abort', () => {
      if (!isActive()) return;
      setPreviewError('语音试听超时，请重试。');
      finishPreview(session);
    }, { once: true });

    try {
      const releaseFocus = claimTTSAudioFocus(session, stopPreview);
      session.releaseFocus = releaseFocus;
      if (!isActive()) {
        releaseFocus();
        return;
      }
      onPreviewStart?.();
      if (!isActive()) return;
      const ssml = buildSSML('你好，这是一个语音试听示例。');
      const generation = getAccessGeneration();
      const response = await fetch(`${API_BASE}/api/ssml`, {
        credentials: 'include',
        cache: 'no-store',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ssml,
          output_format: 'audio-24khz-48kbitrate-mono-mp3',
        }),
        signal: controller.signal,
      });

      if (!isActive() || generation !== getAccessGeneration()) return;
      handleAuthResponse(response, generation);
      if (!response.ok) {
        throw new Error(`语音试听失败，状态码：${response.status}`);
      }

      const blob = await response.blob();
      if (!isActive() || generation !== getAccessGeneration()) return;
      clearTimeout(timeoutId);
      session.url = URL.createObjectURL(blob);
      const audio = new Audio(session.url);
      session.audio = audio;
      audio.onended = () => finishPreview(session);
      audio.onerror = () => {
        if (isActive()) setPreviewError('语音试听失败，请重试。');
        finishPreview(session);
      };

      await audio.play();
      // A browser may settle play() after this session has already been cancelled.
      if (!isActive()) {
        audio.pause();
        return;
      }
      if (mountedRef.current) {
        setPreviewPhase('playing');
      }
    } catch {
      if (isActive()) {
        setPreviewError('语音试听失败，请重试。');
        finishPreview(session);
      }
    }
  }, [buildSSML, finishPreview, onPreviewStart, onPreviewEnd, stopPreview]);

  const voiceOptions: ReaderSelectOption[] = zhVoices.map((voice) => {
    const genderLabel = GENDER_LABELS[voice.Gender];
    return {
      value: voice.ShortName || voice.Name,
      label: genderLabel ? `${voice.LocalName} (${genderLabel})` : voice.LocalName,
    };
  });

  const styleOptions: ReaderSelectOption[] = [
    { value: '__clear__', label: '不指定', muted: true },
    ...availableStyles.map((style) => ({ value: style, label: style })),
  ];

  return (
    <div className="flex flex-col gap-2.5" style={panelThemeVars}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          className="text-xs font-medium"
          style={{ color: 'var(--reader-panel-muted)' }}
        >
          声音设置
        </h3>
        <div className="flex items-center gap-1.5">
          {onReloadVoices && (
            <button
              type="button"
              onClick={() => void onReloadVoices()}
              disabled={voicesLoading}
              aria-busy={voicesLoading || undefined}
              aria-label="重新加载语音"
              title={voicesLoading ? '正在加载语音列表…' : '重新加载语音列表'}
              className="reader-panel-secondary px-2.5 text-xs"
            >
              <RotateCw
                aria-hidden="true"
                className={cn(
                  'h-3.5 w-3.5',
                  voicesLoading && 'animate-spin motion-reduce:animate-none',
                )}
              />
              <span>{voicesLoading ? '加载中' : '重载'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePreview}
            aria-label={isPreviewing ? '停止语音试听' : '试听当前语音'}
            aria-pressed={isPreviewing}
            aria-busy={previewPhase === 'loading' || undefined}
            title={
              previewPhase === 'loading'
                ? '取消语音试听'
                : isPreviewing
                  ? '停止语音试听'
                  : '试听当前语音'
            }
            className={cn(
              isPreviewing ? 'reader-panel-action' : 'reader-panel-secondary',
              'px-2.5 text-xs',
            )}
          >
            {previewPhase === 'loading' ? (
              <Loader2
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : isPreviewing ? (
              <Square aria-hidden="true" className="h-3 w-3 fill-current" />
            ) : (
              <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            <span>{isPreviewing ? '停止' : '试听'}</span>
          </button>
        </div>
      </div>

      {previewError && (
        <p role="alert" className="reader-tts-alert px-3 py-2 text-xs leading-5">
          {previewError}
        </p>
      )}

      {voicesLoading && (
        <div
          role="status"
          aria-live="polite"
          className="reader-tts-status px-3 py-2 text-xs leading-5"
          style={{ color: 'var(--reader-panel-muted)' }}
        >
          正在加载声音列表…
        </div>
      )}

      {!voicesLoading && voicesError && (
        <div role="alert" className="reader-tts-alert px-3 py-2 text-xs leading-5">
          {voicesError}
        </div>
      )}

      {zhVoices.length > 0 && (
        <div className="space-y-1.5">
          <ReaderSelect
            ariaLabel="语音"
            prefixLabel="语音"
            placeholder="选择语音"
            value={selectedVoice?.ShortName || selectedVoice?.Name || settings.voiceName}
            options={voiceOptions}
            onValueChange={handleVoiceChange}
            onDropdownOpenChange={handleVoiceDropdownOpenChange}
            panelThemeVars={panelThemeVars}
            overlayContainer={overlayContainer}
            dropdownMaxWidth="max-w-[min(300px,calc(100vw-2rem))]"
          />
        </div>
      )}

      {availableStyles.length > 0 && (
        <div className="space-y-1.5">
          <ReaderSelect
            ariaLabel="风格"
            prefixLabel="风格"
            placeholder="选择风格"
            value={settings.style ?? '__clear__'}
            options={styleOptions}
            onValueChange={handleStyleChange}
            onDropdownOpenChange={handleStyleDropdownOpenChange}
            panelThemeVars={panelThemeVars}
            overlayContainer={overlayContainer}
            dropdownMaxWidth="max-w-[min(260px,calc(100vw-2rem))]"
          />
        </div>
      )}

      {!voicesLoading && !voicesError && zhVoices.length === 0 && (
        <p
          className="reader-tts-status px-3 py-2 text-xs leading-5"
          style={{ color: 'var(--reader-panel-muted)' }}
        >
          {onReloadVoices ? '暂无可用中文语音，可点击「重载」获取列表。' : '暂无可用中文语音。'}
        </p>
      )}
    </div>
  );
}
