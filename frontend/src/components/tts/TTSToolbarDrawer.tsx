'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ActionIcon, Drawer, UnstyledButton } from '@mantine/core';
import { Volume2, X } from 'lucide-react';
import { VoiceSelector } from '@/components/VoiceSelector';
import { cn } from '@/lib/utils';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import type { TTSHighlightMode, TTSSettings, Voice } from '@/lib/tts';
import { TTSPlaybackButtons, TTSRateButtons } from './TTSPlaybackControls';
import { TTSHighlightModeGroup, TTSSection, TTSSleepTimerGroup } from './TTSSettingsGroups';
import { TTSResumePrompt, TTSStatusBanner } from './TTSStatusBanner';
import { getTriggerSurface, type TTSSleepTimer, type TTSStatusInfo } from './types';

export interface TTSToolbarDrawerProps {
  expanded: boolean;
  onToggleExpanded: () => void;
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
  surface: { border: string; fg: string };
  panelThemeVars: CSSProperties;
  triggerContent?: ReactNode;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
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
  onToggleExpanded,
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
  surface,
  panelThemeVars,
  triggerContent,
  triggerClassName,
  triggerStyle,
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
  const triggerLabel = isActive ? '朗读控制（正在播放）' : '朗读控制';
  const resolvedTriggerStyle = {
    ...(triggerStyle ?? {
      color: isActive ? uiScheme.link : uiScheme.buttonText,
      ...getTriggerSurface(uiScheme, isActive),
    }),
    opacity: isBusy ? 0.72 : 1,
  };

  return (
    <>
      {triggerContent ? (
        <UnstyledButton
          type="button"
          data-reader-interactive="true"
          data-reader-tts-trigger="true"
          data-reader-tts-active={isActive ? 'true' : undefined}
          title={triggerLabel}
          aria-label={triggerLabel}
          aria-expanded={expanded}
          aria-haspopup="dialog"
          onClick={onToggleExpanded}
          className={
            triggerClassName ??
            'relative z-40 inline-flex shrink-0 items-center justify-center rounded-lg border px-2.5 align-middle transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2'
          }
          style={resolvedTriggerStyle}
        >
          {triggerContent}
        </UnstyledButton>
      ) : (
        <ActionIcon
          type="button"
          variant="subtle"
          size={44}
          radius="md"
          data-reader-interactive="true"
          data-reader-tts-trigger="true"
          data-reader-tts-active={isActive ? 'true' : undefined}
          title={triggerLabel}
          aria-label={triggerLabel}
          aria-expanded={expanded}
          aria-haspopup="dialog"
          onClick={onToggleExpanded}
          className={cn(
            'min-h-0 min-w-0',
            triggerClassName ??
              'relative z-40 inline-flex size-11 shrink-0 items-center justify-center rounded-lg border p-0 align-middle transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2'
          )}
          style={resolvedTriggerStyle}
        >
          <Volume2 className="relative z-10 h-4 w-4" aria-hidden="true" />
        </ActionIcon>
      )}

      <Drawer.Root
        opened={expanded}
        onClose={onClose}
        closeOnEscape={!isVoiceDropdownOpen}
        position="bottom"
        size="auto"
        padding={0}
        zIndex={90}
        returnFocus={false}
        portalProps={{ target: overlayContainer ?? undefined }}
        classNames={{
          inner:
            'items-end justify-center pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]',
          content:
            'reader-panel flex max-h-[min(42rem,calc(100svh-1.5rem))] w-full flex-col overflow-hidden rounded-2xl border p-0 sm:max-h-[min(78svh,42rem)] sm:w-[480px] sm:max-w-[calc(100vw-2rem)]',
        }}
        styles={{
          content: {
            ...panelThemeVars,
            flex: '0 1 auto',
            height: 'auto',
            background: uiScheme.cardBg,
            borderColor: surface.border,
            color: surface.fg,
            boxShadow: 'var(--paper-shadow-floating)',
          },
        }}
      >
        <Drawer.Overlay backgroundOpacity={0.42} blur={3} />
        <Drawer.Content data-reader-interactive="true" data-reader-tts-popup="true">
          <div className="reader-panel-header shrink-0 bg-transparent px-4 py-3.5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Drawer.Title
                  className="font-heading text-lg font-medium leading-tight"
                  style={{ color: 'var(--reader-panel-fg)' }}
                >
                  朗读控制
                </Drawer.Title>
                <p className="sr-only">播放、调整倍速与设置睡眠定时</p>
              </div>
              <ActionIcon
                type="button"
                variant="subtle"
                size={44}
                radius="md"
                onClick={onClose}
                className="reader-panel-icon"
                aria-label="关闭朗读控制"
                title="关闭"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </ActionIcon>
            </div>
          </div>

          <div className="reader-panel-body custom-scrollbar space-y-4 px-4 py-4 sm:px-6">
            {resumePromptVisible && (
              <TTSResumePrompt
                message={resumePromptMessage}
                isResuming={isResuming}
                onResume={onResumeClick}
                uiScheme={uiScheme}
                variant="drawer"
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
                  variant="drawer"
                />
                <TTSRateButtons value={settings.rate} onChange={onRateChange} />
              </div>
            </TTSSection>

            <TTSSection title="高亮方式" description="选择朗读时跟随词语或整句。">
              <TTSHighlightModeGroup
                value={settings.highlightMode}
                onChange={onHighlightModeChange}
                variant="drawer"
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
                variant="drawer"
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
        </Drawer.Content>
      </Drawer.Root>
    </>
  );
}
