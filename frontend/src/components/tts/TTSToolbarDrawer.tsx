'use client';

import { ReaderSheet } from '@/components/reader/ReaderSheet';
import { VoiceSelector } from '@/components/VoiceSelector';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import type { TTSHighlightMode, TTSSettings, Voice } from '@/lib/tts';
import { TTSPlaybackButtons, TTSRateButtons } from './TTSPlaybackControls';
import { TTSHighlightModeGroup, TTSSection, TTSSleepTimerGroup } from './TTSSettingsGroups';
import { TTSResumePrompt, TTSStatusBanner } from './TTSStatusBanner';
import type { TTSSleepTimer, TTSStatusInfo } from './types';

export interface TTSToolbarDrawerProps {
  expanded: boolean;
  onClose: () => void;
  isActive: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isBusy: boolean;
  isVoiceDropdownOpen: boolean;
  onVoiceDropdownOpenChange: (open: boolean) => void;
  settings: TTSSettings;
  voices: Voice[];
  voicesLoading: boolean;
  voicesError: string | null;
  onReloadVoices?: () => void | Promise<void>;
  onStartClick: () => void | Promise<void>;
  onStopClick: () => void;
  onNext: () => void | Promise<void>;
  onPrev: () => void | Promise<void>;
  onUpdateSettings: (settings: Partial<TTSSettings>) => void;
  onRateChange: (rate: number) => void;
  onHighlightModeChange: (mode: TTSHighlightMode) => void;
  onPreviewStart?: () => void;
  uiScheme: ThemeColors;
  showSettingsPanel: boolean;
  resumePromptVisible: boolean;
  resumePromptMessage: string;
  isResuming: boolean;
  onResumeClick: () => void | Promise<void>;
  overlayContainer?: HTMLElement | null;
  ttsStatus?: TTSStatusInfo;
  sleepTimer?: TTSSleepTimer;
  sleepTimerActive: boolean;
  onSleepTimerMinutes?: (minutes: number) => void;
  onClearSleepTimer?: () => void;
}

export function TTSToolbarDrawer({
  expanded,
  onClose,
  isActive,
  isPlaying,
  isPaused,
  isBusy,
  isVoiceDropdownOpen,
  onVoiceDropdownOpenChange,
  settings,
  voices,
  voicesLoading,
  voicesError,
  onReloadVoices,
  onStartClick,
  onStopClick,
  onNext,
  onPrev,
  onUpdateSettings,
  onRateChange,
  onHighlightModeChange,
  onPreviewStart,
  uiScheme,
  showSettingsPanel,
  resumePromptVisible,
  resumePromptMessage,
  isResuming,
  onResumeClick,
  overlayContainer,
  ttsStatus,
  sleepTimer,
  sleepTimerActive,
  onSleepTimerMinutes,
  onClearSleepTimer,
}: TTSToolbarDrawerProps) {
  return (
    <ReaderSheet
      open={expanded}
      onClose={onClose}
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
            onResume={onResumeClick}
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
              isPaused={isPaused}
              isBusy={isBusy}
              onPrev={onPrev}
              onStartClick={onStartClick}
              onNext={onNext}
              onStopClick={onStopClick}
            />
            <TTSRateButtons value={settings.rate} onChange={onRateChange} />
          </div>
        </TTSSection>

        <TTSSection title="高亮方式" description="选择朗读时跟随词语或整句。">
          <TTSHighlightModeGroup
            value={settings.highlightMode}
            onChange={onHighlightModeChange}
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

        {showSettingsPanel && (
          <TTSSection title="语音偏好" description="选择发音人、情绪风格与输出声音。">
            <VoiceSelector
              settings={settings}
              voices={voices}
              voicesLoading={voicesLoading}
              voicesError={voicesError}
              onReloadVoices={onReloadVoices}
              onUpdateSettings={onUpdateSettings}
              onPreviewStart={onPreviewStart}
              onDropdownOpenChange={onVoiceDropdownOpenChange}
              uiScheme={uiScheme}
              overlayContainer={overlayContainer}
            />
          </TTSSection>
        )}
      </div>
    </ReaderSheet>
  );
}
