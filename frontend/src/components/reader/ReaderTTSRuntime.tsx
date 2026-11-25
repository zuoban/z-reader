'use client';

import { useEffect } from 'react';
import { useTTS } from '@/hooks/useTTS';
import type { FoliateView } from '@/lib/types';

export type ReaderTTSRuntimeState = ReturnType<typeof useTTS>;

export interface ReaderTTSRuntimeProps {
  viewRef: React.RefObject<FoliateView | null>;
  onHighlight: (range: Range) => void;
  bookId: string;
  onSync: (runtime: ReaderTTSRuntimeState | null) => void;
}

export function ReaderTTSRuntime({
  viewRef,
  onHighlight,
  bookId,
  onSync,
}: ReaderTTSRuntimeProps) {
  const {
    state,
    preparing,
    settings,
    updateSettings,
    start,
    stop,
    next,
    prev,
    resume,
    pause,
    voices,
    voicesLoading,
    voicesError,
    reloadVoices,
    currentMark,
    markIndex,
    ttsStatus,
    sleepTimer,
    setSleepTimerForMinutes,
    clearSleepTimer,
    resumePromptVisible,
    resumePromptMessage,
    restoreCurrentHighlight,
  } = useTTS({
    viewRef,
    onHighlight,
    bookId,
    voicesEnabled: true,
  });

  useEffect(() => {
    onSync({
      state,
      preparing,
      settings,
      updateSettings,
      start,
      stop,
      next,
      prev,
      resume,
      pause,
      voices,
      voicesLoading,
      voicesError,
      reloadVoices,
      currentMark,
      markIndex,
      ttsStatus,
      sleepTimer,
      setSleepTimerForMinutes,
      clearSleepTimer,
      resumePromptVisible,
      resumePromptMessage,
      restoreCurrentHighlight,
    });
  }, [
    onSync,
    state,
    preparing,
    settings,
    updateSettings,
    start,
    stop,
    next,
    prev,
    resume,
    pause,
    voices,
    voicesLoading,
    voicesError,
    reloadVoices,
    currentMark,
    markIndex,
    ttsStatus,
    sleepTimer,
    setSleepTimerForMinutes,
    clearSleepTimer,
    resumePromptVisible,
    resumePromptMessage,
    restoreCurrentHighlight,
  ]);

  useEffect(() => () => onSync(null), [onSync]);

  return null;
}
