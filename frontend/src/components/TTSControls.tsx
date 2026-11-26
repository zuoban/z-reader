'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ReaderSheet } from '@/components/reader/ReaderSheet';
import { TTSPlaybackButtons, TTSRateButtons } from '@/components/tts/TTSPlaybackControls';
import {
  TTSHighlightModeGroup,
  TTSSection,
  TTSSleepTimerGroup,
} from '@/components/tts/TTSSettingsGroups';
import { TTSResumePrompt, TTSStatusBanner } from '@/components/tts/TTSStatusBanner';
import type { TTSSleepTimer, TTSStatusInfo } from '@/components/tts/types';
import { VoiceSelector } from '@/components/VoiceSelector';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import type { TTSSettings, TTSState, Voice } from '@/lib/tts';

export interface TTSControlsProps {
  state: TTSState;
  preparing?: boolean;
  settings: TTSSettings;
  voices: Voice[];
  voicesLoading?: boolean;
  voicesError?: string | null;
  onReloadVoices?: () => void | Promise<void>;
  onStart: () => void | Promise<void>;
  onStop: () => void;
  onNext: () => void | Promise<void>;
  onPrev: () => void | Promise<void>;
  onUpdateSettings: (settings: Partial<TTSSettings>) => void;
  onPreviewStart?: () => void;
  uiScheme: ThemeColors;
  onExpandedChange?: (expanded: boolean) => void;
  resumePromptVisible?: boolean;
  resumePromptMessage?: string;
  onResume?: () => void | Promise<void>;
  overlayContainer?: HTMLElement | null;
  ttsStatus?: TTSStatusInfo;
  sleepTimer?: TTSSleepTimer;
  onSleepTimerMinutes?: (minutes: number) => void;
  onClearSleepTimer?: () => void;
  expanded?: boolean;
}

export function TTSControls({
  state,
  preparing = false,
  settings,
  voices,
  voicesLoading = false,
  voicesError = null,
  onReloadVoices,
  onStart,
  onStop,
  onNext,
  onPrev,
  onUpdateSettings,
  onPreviewStart,
  uiScheme,
  onExpandedChange,
  resumePromptVisible = false,
  resumePromptMessage = '朗读被系统中断，轻触即可继续。',
  onResume,
  overlayContainer,
  ttsStatus,
  sleepTimer,
  onSleepTimerMinutes,
  onClearSleepTimer,
  expanded = false,
}: TTSControlsProps) {
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const operationRef = useRef(0);
  const pendingRef = useRef(false);
  const resumingRef = useRef(false);
  const mountedRef = useRef(true);
  const onExpandedChangeRef = useRef(onExpandedChange);

  const isBusy = isPending || preparing;
  const isPlaying = state === 'playing';
  const isActive = state !== 'stopped';
  const isVoiceDropdownOpen = expanded && voiceDropdownOpen;
  const sleepTimerActive = Boolean(sleepTimer?.mode && sleepTimer.mode !== 'off');

  useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
  }, [onExpandedChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    onExpandedChangeRef.current?.(true);
    return () => {
      onExpandedChangeRef.current?.(false);
    };
  }, [expanded]);

  const closePanel = useCallback(() => {
    if (expanded) {
      onExpandedChangeRef.current?.(false);
    }
  }, [expanded]);

  const handleStartClick = async () => {
    if (pendingRef.current || preparing) return;
    const operation = ++operationRef.current;
    pendingRef.current = true;
    const shouldCloseAfterStart = !isPlaying;
    setIsPending(true);
    try {
      await onStart();
      if (operation === operationRef.current && shouldCloseAfterStart) {
        closePanel();
      }
    } finally {
      if (operation === operationRef.current) {
        pendingRef.current = false;
        setIsPending(false);
      }
    }
  };

  const handleStopClick = () => {
    operationRef.current += 1;
    pendingRef.current = false;
    setIsPending(false);
    onStop();
  };

  const handleResumeClick = async () => {
    if (resumingRef.current || !onResume) return;
    resumingRef.current = true;
    setIsResuming(true);
    try {
      await onResume();
    } finally {
      resumingRef.current = false;
      if (mountedRef.current) {
        setIsResuming(false);
      }
    }
  };

  return (
    <ReaderSheet
      open={expanded}
      onClose={closePanel}
      closeOnEscape={!isVoiceDropdownOpen}
      title="朗读控制"
      srDescription="播放、调整倍速与设置睡眠定时"
      closeLabel="关闭朗读控制"
      uiScheme={uiScheme}
      overlayContainer={overlayContainer}
      contentDataAttributes={{ 'data-reader-tts-popup': 'true' }}
    >
      <div className="reader-panel-body custom-scrollbar space-y-4 px-4 py-4 sm:px-6">
        {resumePromptVisible && (
          <TTSResumePrompt
            message={resumePromptMessage}
            isResuming={isResuming}
            onResume={handleResumeClick}
            uiScheme={uiScheme}
          />
        )}

        {ttsStatus ? <TTSStatusBanner ttsStatus={ttsStatus} isActive={isActive} /> : null}

        <TTSSection
          title="播放控制"
          description="从当前位置开始、暂停或切换到相邻句子。"
        >
          <div className="space-y-3">
            <TTSPlaybackButtons
              isActive={isActive}
              isPlaying={isPlaying}
              isPaused={state === 'paused'}
              isBusy={isBusy}
              onPrev={onPrev}
              onStartClick={handleStartClick}
              onNext={onNext}
              onStopClick={handleStopClick}
            />
            <TTSRateButtons
              value={settings.rate}
              onChange={(rate) => onUpdateSettings({ rate })}
            />
          </div>
        </TTSSection>

        <TTSSection title="高亮方式" description="选择朗读时跟随词语或整句。">
          <TTSHighlightModeGroup
            value={settings.highlightMode}
            onChange={(highlightMode) => onUpdateSettings({ highlightMode })}
          />
        </TTSSection>

        <TTSSection
          title="睡眠定时"
          description={sleepTimerActive ? sleepTimer?.label : '到点自动停止，适合睡前阅读。'}
        >
          <TTSSleepTimerGroup
            sleepTimer={sleepTimer}
            sleepTimerActive={sleepTimerActive}
            onSleepTimerMinutes={onSleepTimerMinutes}
            onClearSleepTimer={onClearSleepTimer}
          />
        </TTSSection>

        <TTSSection title="语音偏好" description="选择发音人、情绪风格与输出声音。">
          <VoiceSelector
            settings={settings}
            voices={voices}
            voicesLoading={voicesLoading}
            voicesError={voicesError}
            onReloadVoices={onReloadVoices}
            onUpdateSettings={onUpdateSettings}
            onPreviewStart={onPreviewStart}
            onDropdownOpenChange={setVoiceDropdownOpen}
            uiScheme={uiScheme}
            overlayContainer={overlayContainer}
          />
        </TTSSection>
      </div>
    </ReaderSheet>
  );
}
