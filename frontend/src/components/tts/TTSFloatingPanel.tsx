'use client';

import type { CSSProperties, MouseEvent, PointerEvent, RefObject, SyntheticEvent } from 'react';
import { ActionIcon } from '@mantine/core';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { VoiceSelector } from '@/components/VoiceSelector';
import { cn } from '@/lib/utils';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import type { TTSHighlightMode, TTSSettings, Voice } from '@/lib/tts';
import { TTSFloatingButton } from './TTSFloatingButton';
import { TTSPlaybackButtons, TTSRateButtons } from './TTSPlaybackControls';
import { TTSHighlightModeGroup, TTSSleepTimerGroup } from './TTSSettingsGroups';
import { TTSResumePrompt, TTSStatusBanner } from './TTSStatusBanner';
import type { TTSPosition, TTSSleepTimer, TTSStatusInfo } from './types';

export interface TTSFloatingPanelProps {
  rootRef: RefObject<HTMLDivElement | null>;
  expanded: boolean;
  detailsExpanded: boolean;
  onToggleDetails: () => void;
  onClose: () => void;
  onFloatingButtonClick: (e: MouseEvent) => void;
  onStopInteractivePropagation: (e: SyntheticEvent) => void;
  onPreserveReaderSelection: (e: PointerEvent) => void;
  isActive: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isBusy: boolean;
  isDragging: boolean;
  position: TTSPosition;
  floatingPopupStyle: CSSProperties;
  panelBodyMaxHeight: string;
  onDragHandlePointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerUp: (e: PointerEvent<HTMLButtonElement>) => void;
  onDragHandlePointerCancel: (e: PointerEvent<HTMLButtonElement>) => void;
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

export function TTSFloatingPanel({
  rootRef,
  expanded,
  detailsExpanded,
  onToggleDetails,
  onClose,
  onFloatingButtonClick,
  onStopInteractivePropagation,
  onPreserveReaderSelection,
  isActive,
  isPlaying,
  isPaused,
  isBusy,
  isDragging,
  position,
  floatingPopupStyle,
  panelBodyMaxHeight,
  onDragHandlePointerDown,
  onDragHandlePointerUp,
  onDragHandlePointerCancel,
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
}: TTSFloatingPanelProps) {
  return (
    <>
      {expanded && (
        <button
          type="button"
          aria-label="关闭朗读控制弹层"
          className="fixed inset-0 z-[59] cursor-default bg-transparent"
          onPointerDown={onPreserveReaderSelection}
          onClick={onClose}
        />
      )}

      <div ref={rootRef} className="relative" style={{ pointerEvents: 'auto' }}>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {isBusy
            ? '正在准备朗读'
            : isActive
              ? isPlaying
                ? '正在朗读'
                : isPaused
                  ? '已暂停'
                  : '待开始'
              : '朗读已停止'}
        </div>

        {!expanded && (
          <TTSFloatingButton
            isActive={isActive}
            isPlaying={isPlaying}
            isPaused={isPaused}
            isDragging={isDragging}
            position={position}
            expanded={expanded}
            onClick={onFloatingButtonClick}
            onPointerDownCapture={onStopInteractivePropagation}
            panelThemeVars={panelThemeVars}
          />
        )}

        {expanded && (
          <div
            data-reader-interactive="true"
            data-reader-tts-popup="true"
            role="dialog"
            aria-modal="false"
            aria-label={showSettingsPanel ? '朗读控制与偏好' : '朗读控制'}
            className="paper-reveal-soft fixed z-[70] origin-bottom-right"
            style={{
              ...panelThemeVars,
              ...floatingPopupStyle,
            }}
            onClick={onStopInteractivePropagation}
          >
            <div
              className="paper-motion-surface paper-stack relative overflow-hidden rounded-xl border p-0 motion-reduce:transition-none"
              style={{
                background: uiScheme.cardBg,
                borderColor: surface.border,
                color: surface.fg,
                boxShadow: 'var(--paper-shadow-floating)',
              }}
            >
              <div
                className="pointer-events-none absolute bottom-[-8px] right-5 h-4 w-4 rotate-45 border-r border-b"
                style={{
                  background: 'var(--reader-panel-bg)',
                  borderColor: 'var(--reader-panel-border)',
                }}
              />

              <div className="reader-panel-header flex items-center justify-between gap-3 px-4 py-3.5">
                <p
                  className="font-heading text-lg font-medium leading-tight"
                  style={{ color: 'var(--reader-panel-fg)' }}
                >
                  朗读控制
                </p>
                <ActionIcon
                  type="button"
                  variant="subtle"
                  size={44}
                  radius="md"
                  onPointerDown={onPreserveReaderSelection}
                  onClick={onClose}
                  className="reader-panel-icon"
                  aria-label="关闭朗读控制面板"
                  title="关闭"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </ActionIcon>
              </div>

              <div
                className="custom-scrollbar space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-3"
                style={{ maxHeight: panelBodyMaxHeight }}
              >
                {resumePromptVisible && (
                  <TTSResumePrompt
                    message={resumePromptMessage}
                    isResuming={isResuming}
                    onResume={onResumeClick}
                    uiScheme={uiScheme}
                    variant="floating"
                  />
                )}

                <div className="flex flex-col gap-4 px-1 py-1">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h3
                      className="text-xs font-medium"
                      style={{ color: 'var(--reader-panel-muted)' }}
                    >
                      快捷控制
                    </h3>
                    {showSettingsPanel && (
                      <button
                        type="button"
                        aria-expanded={detailsExpanded}
                        onClick={onToggleDetails}
                        className={cn(
                          detailsExpanded ? 'reader-panel-action' : 'reader-panel-secondary',
                          'px-2.5 text-xs'
                        )}
                      >
                        <span>{detailsExpanded ? '收起设置' : '更多设置'}</span>
                        {detailsExpanded ? (
                          <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  <TTSPlaybackButtons
                    isActive={isActive}
                    isPlaying={isPlaying}
                    isPaused={isPaused}
                    isBusy={isBusy}
                    onPrev={onPrev}
                    onStartClick={onStartClick}
                    onNext={onNext}
                    onStopClick={onStopClick}
                    variant="floating"
                  />

                  <div className="pb-1">
                    <TTSRateButtons value={settings.rate} onChange={onRateChange} />
                  </div>

                  {detailsExpanded && (
                    <div className="paper-reveal-soft space-y-3 px-1 pt-2">
                      <div className="flex items-center justify-between gap-3 px-1">
                        <h3
                          className="text-xs font-medium"
                          style={{ color: 'var(--reader-panel-muted)' }}
                        >
                          高亮方式
                        </h3>
                      </div>
                      <TTSHighlightModeGroup
                        value={settings.highlightMode}
                        onChange={onHighlightModeChange}
                        variant="floating"
                      />
                    </div>
                  )}

                  {detailsExpanded && (
                    <div className="paper-reveal-soft space-y-3 px-1">
                      <div className="flex items-center justify-between gap-3 px-1">
                        <h3
                          className="text-xs font-medium"
                          style={{ color: 'var(--reader-panel-muted)' }}
                        >
                          睡眠定时
                        </h3>
                        {sleepTimerActive && (
                          <span
                            className="text-[11px] font-medium tabular-nums"
                            style={{ color: 'var(--reader-panel-accent)' }}
                          >
                            {sleepTimer?.label}
                          </span>
                        )}
                      </div>

                      <TTSSleepTimerGroup
                        sleepTimer={sleepTimer}
                        sleepTimerActive={sleepTimerActive}
                        onSleepTimerMinutes={onSleepTimerMinutes}
                        onClearSleepTimer={onClearSleepTimer}
                        variant="floating"
                      />
                    </div>
                  )}

                  {showSettingsPanel && detailsExpanded && (
                    <div className="paper-reveal-soft px-1">
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
                    </div>
                  )}
                </div>
              </div>

              {ttsStatus && !detailsExpanded && (
                <div
                  data-testid="tts-floating-status-footer"
                  className="border-t p-3"
                  style={{
                    borderColor: 'var(--reader-panel-rule)',
                  }}
                >
                  <TTSStatusBanner
                    ttsStatus={ttsStatus}
                    isActive={isActive}
                    withDragHandle
                    isDragging={isDragging}
                    onDragHandlePointerDown={onDragHandlePointerDown}
                    onDragHandlePointerUp={onDragHandlePointerUp}
                    onDragHandlePointerCancel={onDragHandlePointerCancel}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
