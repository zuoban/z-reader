"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderTTSRuntimeState } from "@/components/reader/ReaderTTSRuntime";
import type { TTSControlsProps } from "@/components/TTSControls";
import type { ThemeColors } from "@/hooks/useReaderTheme";

interface UseReaderTTSBridgeOptions {
  uiScheme: ThemeColors;
  overlayContainer: HTMLDivElement | null;
  hideHeader: () => void;
  ttsOpen: boolean;
  onTtsOpenChange: (open: boolean) => void;
}

export function useReaderTTSBridge({
  uiScheme,
  overlayContainer,
  hideHeader,
  ttsOpen,
  onTtsOpenChange,
}: UseReaderTTSBridgeOptions) {
  const [ttsRequested, setTTSRequested] = useState(false);
  const [ttsRuntime, setTtsRuntime] = useState<ReaderTTSRuntimeState | null>(null);
  const ttsRuntimeRef = useRef<ReaderTTSRuntimeState | null>(null);

  const handleSyncTTSRuntime = useCallback(
    (runtime: ReaderTTSRuntimeState | null) => {
      ttsRuntimeRef.current = runtime;
      setTtsRuntime(runtime);
    },
    [],
  );

  const ttsState = ttsRuntime?.state ?? "stopped";
  const ttsPreparing = ttsRuntime?.preparing ?? false;
  const resumePromptVisible = ttsRuntime?.resumePromptVisible ?? false;
  const resumePromptMessage = ttsRuntime?.resumePromptMessage ?? "";

  const stopTTS = useCallback(() => {
    ttsRuntimeRef.current?.stop();
  }, []);

  const resumeTTS = useCallback(() => {
    void ttsRuntimeRef.current?.resume();
  }, []);

  const prevTtsOpenRef = useRef(ttsOpen);
  useEffect(() => {
    if (prevTtsOpenRef.current && !ttsOpen) {
      ttsRuntimeRef.current?.restoreCurrentHighlight();
    }
    prevTtsOpenRef.current = ttsOpen;
  }, [ttsOpen]);

  const requestTTS = useCallback(() => {
    setTTSRequested(true);
    onTtsOpenChange(true);
  }, [onTtsOpenChange]);

  const handleTTSExpandedChange = useCallback(
    (expanded: boolean) => {
      if (expanded) {
        setTTSRequested(true);
      }
      onTtsOpenChange(expanded);
    },
    [onTtsOpenChange],
  );

  useEffect(() => {
    if (ttsState === "playing") {
      hideHeader();
    }
  }, [hideHeader, ttsState]);

  const handlePreviewStart = useCallback(() => {
    if (ttsState === "playing" || ttsPreparing) {
      ttsRuntimeRef.current?.pause();
    }
  }, [ttsPreparing, ttsState]);

  const drawerProps: TTSControlsProps | null = ttsRuntime
    ? {
        expanded: ttsOpen,
        onExpandedChange: handleTTSExpandedChange,
        state: ttsRuntime.state,
        preparing: ttsRuntime.preparing,
        onPreviewStart: handlePreviewStart,
        settings: ttsRuntime.settings,
        voices: ttsRuntime.voices,
        voicesLoading: ttsRuntime.voicesLoading,
        voicesError: ttsRuntime.voicesError,
        onReloadVoices: ttsRuntime.reloadVoices,
        onStart: ttsRuntime.start,
        onStop: stopTTS,
        onNext: ttsRuntime.next,
        onPrev: ttsRuntime.prev,
        onUpdateSettings: ttsRuntime.updateSettings,
        uiScheme,
        resumePromptVisible: ttsRuntime.resumePromptVisible,
        resumePromptMessage: ttsRuntime.resumePromptMessage,
        ttsStatus: ttsRuntime.ttsStatus,
        sleepTimer: ttsRuntime.sleepTimer,
        onSleepTimerMinutes: ttsRuntime.setSleepTimerForMinutes,
        onClearSleepTimer: ttsRuntime.clearSleepTimer,
        onResume: resumeTTS,
        overlayContainer,
      }
    : null;

  return {
    ttsRequested,
    runtimeReady: ttsRuntime !== null,
    ttsOpen,
    ttsState,
    resumePromptVisible,
    resumePromptMessage,
    requestTTS,
    handleSyncTTSRuntime,
    stopTTS,
    resumeTTS,
    drawerProps,
  };
}
