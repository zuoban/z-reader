'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import '@/app/styles/mantine-drawer.css';
import { getModernReaderSurface, getReaderPanelThemeVars } from '@/lib/reader-ui';
import type { TTSHighlightMode, TTSState, TTSSettings, Voice } from '@/lib/tts';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import { TTSFloatingPanel } from '@/components/tts/TTSFloatingPanel';
import { TTSToolbarDrawer } from '@/components/tts/TTSToolbarDrawer';
import type { TTSSleepTimer, TTSStatusInfo } from '@/components/tts/types';
import { useFloatingPosition } from '@/components/tts/useFloatingPosition';

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
  variant?: 'floating' | 'toolbar';
  triggerContent?: ReactNode;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  onExpandedChange?: (expanded: boolean) => void;
  showSettingsPanel?: boolean;
  resumePromptVisible?: boolean;
  resumePromptMessage?: string;
  onResume?: () => void | Promise<void>;
  overlayContainer?: HTMLElement | null;
  ttsStatus?: TTSStatusInfo;
  sleepTimer?: TTSSleepTimer;
  onSleepTimerMinutes?: (minutes: number) => void;
  onClearSleepTimer?: () => void;
  initialExpanded?: boolean;
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
  variant = 'floating',
  triggerContent,
  triggerClassName,
  triggerStyle,
  onExpandedChange,
  showSettingsPanel = true,
  resumePromptVisible = false,
  resumePromptMessage = '朗读被系统中断，轻触即可继续。',
  onResume,
  overlayContainer,
  ttsStatus,
  sleepTimer,
  onSleepTimerMinutes,
  onClearSleepTimer,
  initialExpanded = false,
}: TTSControlsProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const operationRef = useRef(0);
  const pendingRef = useRef(false);
  const resumingRef = useRef(false);
  const mountedRef = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const isBusy = isPending || preparing;
  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);
  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const isActive = state !== 'stopped';
  const isToolbar = variant === 'toolbar';
  const isVoiceDropdownOpen = expanded && voiceDropdownOpen;
  const sleepTimerActive = Boolean(sleepTimer?.mode && sleepTimer.mode !== 'off');

  const {
    position,
    isDragging,
    floatingPopupStyle,
    floatingPanelBodyMaxHeight,
    clearAutoDockTimer,
    scheduleAutoDock,
    consumeSuppressedClick,
    handleDragHandlePointerDown,
    handleDragHandlePointerUp,
    handleDragHandlePointerCancel,
  } = useFloatingPosition({ expanded, isToolbar });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    if (!expanded) {
      queueMicrotask(() => {
        setDetailsExpanded(false);
      });
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded || isToolbar) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        isVoiceDropdownOpen
      ) {
        return;
      }
      event.preventDefault();
      setExpanded(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded, isToolbar, isVoiceDropdownOpen]);

  const handleStartClick = async () => {
    if (pendingRef.current || preparing) return;
    const operation = ++operationRef.current;
    pendingRef.current = true;
    const shouldCloseAfterStart = !isPlaying;
    setIsPending(true);
    try {
      await onStart();
      if (operation === operationRef.current && shouldCloseAfterStart) {
        setExpanded(false);
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

  const handleFloatingButtonClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (consumeSuppressedClick()) {
      return;
    }
    if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
      return;
    }
    clearAutoDockTimer();
    setExpanded((value) => !value);
  };

  const stopInteractivePropagation = (e: SyntheticEvent) => {
    e.stopPropagation();
    scheduleAutoDock();
  };

  const handleRateChange = (value: number) => {
    onUpdateSettings({ rate: value });
  };

  const handleHighlightModeChange = (highlightMode: TTSHighlightMode) => {
    onUpdateSettings({ highlightMode });
  };

  const closePanel = useCallback(() => {
    setExpanded(false);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((value) => !value);
  }, []);

  const toggleDetails = useCallback(() => {
    setDetailsExpanded((value) => !value);
  }, []);

  const preserveReaderSelection = (event: PointerEvent) => {
    event.preventDefault();
  };

  if (isToolbar) {
    return (
      <TTSToolbarDrawer
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        onClose={closePanel}
        isActive={isActive}
        isPlaying={isPlaying}
        isPaused={isPaused}
        isBusy={isBusy}
        isVoiceDropdownOpen={isVoiceDropdownOpen}
        onVoiceDropdownOpenChange={setVoiceDropdownOpen}
        settings={settings}
        voices={voices}
        voicesLoading={voicesLoading}
        voicesError={voicesError}
        onReloadVoices={onReloadVoices}
        onStartClick={handleStartClick}
        onStopClick={handleStopClick}
        onNext={onNext}
        onPrev={onPrev}
        onUpdateSettings={onUpdateSettings}
        onRateChange={handleRateChange}
        onHighlightModeChange={handleHighlightModeChange}
        onPreviewStart={onPreviewStart}
        uiScheme={uiScheme}
        surface={surface}
        panelThemeVars={panelThemeVars}
        triggerContent={triggerContent}
        triggerClassName={triggerClassName}
        triggerStyle={triggerStyle}
        showSettingsPanel={showSettingsPanel}
        resumePromptVisible={resumePromptVisible}
        resumePromptMessage={resumePromptMessage}
        isResuming={isResuming}
        onResumeClick={handleResumeClick}
        overlayContainer={overlayContainer}
        ttsStatus={ttsStatus}
        sleepTimer={sleepTimer}
        sleepTimerActive={sleepTimerActive}
        onSleepTimerMinutes={onSleepTimerMinutes}
        onClearSleepTimer={onClearSleepTimer}
      />
    );
  }

  return (
    <TTSFloatingPanel
      rootRef={rootRef}
      expanded={expanded}
      detailsExpanded={detailsExpanded}
      onToggleDetails={toggleDetails}
      onClose={closePanel}
      onFloatingButtonClick={handleFloatingButtonClick}
      onStopInteractivePropagation={stopInteractivePropagation}
      onPreserveReaderSelection={preserveReaderSelection}
      isActive={isActive}
      isPlaying={isPlaying}
      isPaused={isPaused}
      isBusy={isBusy}
      isDragging={isDragging}
      position={position}
      floatingPopupStyle={floatingPopupStyle}
      panelBodyMaxHeight={floatingPanelBodyMaxHeight}
      onDragHandlePointerDown={handleDragHandlePointerDown}
      onDragHandlePointerUp={handleDragHandlePointerUp}
      onDragHandlePointerCancel={handleDragHandlePointerCancel}
      onVoiceDropdownOpenChange={setVoiceDropdownOpen}
      settings={settings}
      voices={voices}
      voicesLoading={voicesLoading}
      voicesError={voicesError}
      onReloadVoices={onReloadVoices}
      onStartClick={handleStartClick}
      onStopClick={handleStopClick}
      onNext={onNext}
      onPrev={onPrev}
      onUpdateSettings={onUpdateSettings}
      onRateChange={handleRateChange}
      onHighlightModeChange={handleHighlightModeChange}
      onPreviewStart={onPreviewStart}
      uiScheme={uiScheme}
      surface={surface}
      panelThemeVars={panelThemeVars}
      showSettingsPanel={showSettingsPanel}
      resumePromptVisible={resumePromptVisible}
      resumePromptMessage={resumePromptMessage}
      isResuming={isResuming}
      onResumeClick={handleResumeClick}
      overlayContainer={overlayContainer}
      ttsStatus={ttsStatus}
      sleepTimer={sleepTimer}
      sleepTimerActive={sleepTimerActive}
      onSleepTimerMinutes={onSleepTimerMinutes}
      onClearSleepTimer={onClearSleepTimer}
    />
  );
}
