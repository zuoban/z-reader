'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { TTSHighlightMode, TTSState, TTSSettings, Voice } from '@/lib/tts';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import { TTSToolbarDrawer } from '@/components/tts/TTSToolbarDrawer';
import type { TTSSleepTimer, TTSStatusInfo } from '@/components/tts/types';

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
  showSettingsPanel?: boolean;
  resumePromptVisible?: boolean;
  resumePromptMessage?: string;
  onResume?: () => void | Promise<void>;
  overlayContainer?: HTMLElement | null;
  ttsStatus?: TTSStatusInfo;
  sleepTimer?: TTSSleepTimer;
  onSleepTimerMinutes?: (minutes: number) => void;
  onClearSleepTimer?: () => void;
  expanded?: boolean;
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
  expanded: controlledExpanded,
  initialExpanded = false,
}: TTSControlsProps) {
  const isControlled = controlledExpanded !== undefined;
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(initialExpanded);
  const expanded = isControlled ? controlledExpanded : uncontrolledExpanded;
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const operationRef = useRef(0);
  const pendingRef = useRef(false);
  const resumingRef = useRef(false);
  const mountedRef = useRef(true);
  const expandedRef = useRef(expanded);
  const onExpandedChangeRef = useRef(onExpandedChange);

  const isBusy = isPending || preparing;
  const isPlaying = state === 'playing';
  const isPaused = state === 'paused';
  const isActive = state !== 'stopped';
  const isVoiceDropdownOpen = expanded && voiceDropdownOpen;
  const sleepTimerActive = Boolean(sleepTimer?.mode && sleepTimer.mode !== 'off');

  useEffect(() => {
    expandedRef.current = expanded;
    onExpandedChangeRef.current = onExpandedChange;
  }, [expanded, onExpandedChange]);

  const setExpanded = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      if (isControlled) {
        const nextExpanded =
          typeof next === 'function' ? next(expandedRef.current) : next;
        if (nextExpanded !== expandedRef.current) {
          onExpandedChangeRef.current?.(nextExpanded);
        }
        return;
      }

      setUncontrolledExpanded(next);
    },
    [isControlled],
  );

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

  const handleRateChange = (value: number) => {
    onUpdateSettings({ rate: value });
  };

  const handleHighlightModeChange = (highlightMode: TTSHighlightMode) => {
    onUpdateSettings({ highlightMode });
  };

  const closePanel = useCallback(() => {
    setExpanded(false);
  }, [setExpanded]);

  return (
    <TTSToolbarDrawer
      expanded={expanded}
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
