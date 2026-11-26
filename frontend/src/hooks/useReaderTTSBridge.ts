"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderTTSRuntimeState } from "@/components/reader/ReaderTTSRuntime";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { Voice } from "@/lib/tts";
import { DEFAULT_SETTINGS } from "@/lib/tts/types";

const IDLE_VOICES: Voice[] = [];
const IDLE_TTS_STATUS = {
  headline: "准备朗读",
  detail: "选择开始后从当前位置朗读",
  tone: "idle" as const,
};
const IDLE_SLEEP_TIMER = { mode: "off" as const, label: "关闭" };
const NOOP_TTS = () => {};

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
  const ttsSettings = ttsRuntime?.settings ?? DEFAULT_SETTINGS;
  const voices = ttsRuntime?.voices ?? IDLE_VOICES;
  const voicesLoading = ttsRuntime?.voicesLoading ?? false;
  const voicesError = ttsRuntime?.voicesError ?? null;
  const resumePromptVisible = ttsRuntime?.resumePromptVisible ?? false;
  const resumePromptMessage = ttsRuntime?.resumePromptMessage ?? "";
  const ttsStatus = ttsRuntime?.ttsStatus ?? IDLE_TTS_STATUS;
  const sleepTimer = ttsRuntime?.sleepTimer ?? IDLE_SLEEP_TIMER;
  const updateTTSSettings = ttsRuntime?.updateSettings ?? NOOP_TTS;
  const startTTS = ttsRuntime?.start ?? NOOP_TTS;
  const nextTTS = ttsRuntime?.next ?? NOOP_TTS;
  const prevTTS = ttsRuntime?.prev ?? NOOP_TTS;
  const reloadVoices = ttsRuntime?.reloadVoices ?? NOOP_TTS;
  const setSleepTimerForMinutes =
    ttsRuntime?.setSleepTimerForMinutes ?? NOOP_TTS;
  const clearSleepTimer = ttsRuntime?.clearSleepTimer ?? NOOP_TTS;
  const pauseTTS = ttsRuntime?.pause ?? NOOP_TTS;

  const stopTTS = useCallback(() => {
    ttsRuntimeRef.current?.stop();
  }, []);

  const resumeTTS = useCallback(() => {
    void ttsRuntimeRef.current?.resume();
  }, []);

  const restoreTTSHighlight = useCallback(() => {
    ttsRuntimeRef.current?.restoreCurrentHighlight();
  }, []);

  const prevTtsOpenRef = useRef(ttsOpen);
  useEffect(() => {
    if (prevTtsOpenRef.current && !ttsOpen) {
      restoreTTSHighlight();
    }
    prevTtsOpenRef.current = ttsOpen;
  }, [restoreTTSHighlight, ttsOpen]);

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
      pauseTTS();
    }
  }, [pauseTTS, ttsPreparing, ttsState]);

  const drawerProps = {
    expanded: ttsOpen,
    onExpandedChange: handleTTSExpandedChange,
    state: ttsState,
    preparing: ttsPreparing,
    onPreviewStart: handlePreviewStart,
    settings: ttsSettings,
    voices,
    voicesLoading,
    voicesError,
    onReloadVoices: reloadVoices,
    onStart: startTTS,
    onStop: stopTTS,
    onNext: nextTTS,
    onPrev: prevTTS,
    onUpdateSettings: updateTTSSettings,
    uiScheme,
    resumePromptVisible,
    resumePromptMessage,
    ttsStatus,
    sleepTimer,
    onSleepTimerMinutes: setSleepTimerForMinutes,
    onClearSleepTimer: clearSleepTimer,
    onResume: resumeTTS,
    overlayContainer,
  } as const;

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
