"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ReaderTTSRuntimeState } from "@/components/reader/ReaderTTSRuntime";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { TTSSettings, Voice } from "@/lib/tts";
import type { FoliateView } from "@/lib/types";

const IDLE_TTS_SETTINGS: TTSSettings = {
  rate: 1.0,
  voiceName: "",
  highlightMode: "sentence",
};
const IDLE_VOICES: Voice[] = [];
const IDLE_TTS_STATUS = {
  headline: "准备朗读",
  detail: "选择开始后从当前位置朗读",
  tone: "idle" as const,
};
const IDLE_SLEEP_TIMER = { mode: "off" as const, label: "关闭" };
const NOOP_TTS = () => {};

export type ReaderTTSSlot = "desktop-toolbar" | "mobile-menu" | "status-bar";

interface UseReaderTTSBridgeOptions {
  viewRef: RefObject<FoliateView | null>;
  uiScheme: ThemeColors;
  overlayContainer: HTMLDivElement | null;
  hideHeader: () => void;
  ttsOpen?: boolean;
  onTtsOpenChange?: (open: boolean) => void;
}

export function useReaderTTSBridge({
  viewRef,
  uiScheme,
  overlayContainer,
  hideHeader,
  ttsOpen: controlledTtsOpen,
  onTtsOpenChange,
}: UseReaderTTSBridgeOptions) {
  const [ttsRequested, setTTSRequested] = useState(false);
  const [uncontrolledTtsOpen, setUncontrolledTtsOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<ReaderTTSSlot | null>(null);
  const [ttsRuntime, setTtsRuntime] = useState<ReaderTTSRuntimeState | null>(null);
  const ttsRuntimeRef = useRef<ReaderTTSRuntimeState | null>(null);
  const activeSlotRef = useRef<ReaderTTSSlot | null>(null);

  const ttsOpen = controlledTtsOpen ?? uncontrolledTtsOpen;
  const setTtsOpen = onTtsOpenChange ?? setUncontrolledTtsOpen;
  const resolvedActiveSlot = ttsOpen ? activeSlot : null;

  useEffect(() => {
    activeSlotRef.current = resolvedActiveSlot;
  }, [resolvedActiveSlot]);

  const handleHighlight = useCallback(
    (range: Range) => {
      if (viewRef.current?.renderer) {
        viewRef.current.renderer.scrollToAnchor?.(range, true);
      }
    },
    [viewRef],
  );

  const handleSyncTTSRuntime = useCallback(
    (runtime: ReaderTTSRuntimeState | null) => {
      ttsRuntimeRef.current = runtime;
      setTtsRuntime(runtime);
    },
    [],
  );

  const ttsState = ttsRuntime?.state ?? "stopped";
  const ttsPreparing = ttsRuntime?.preparing ?? false;
  const ttsSettings = ttsRuntime?.settings ?? IDLE_TTS_SETTINGS;
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

  const requestTTSSlot = useCallback(
    (slot: ReaderTTSSlot) => {
      setTTSRequested(true);
      activeSlotRef.current = slot;
      setActiveSlot(slot);
      setTtsOpen(true);
    },
    [setTtsOpen],
  );

  const handleSlotExpandedChange = useCallback(
    (slot: ReaderTTSSlot, expanded: boolean) => {
      if (expanded) {
        activeSlotRef.current = slot;
        setActiveSlot(slot);
        setTtsOpen(true);
        return;
      }

      if (activeSlotRef.current === slot) {
        activeSlotRef.current = null;
        setActiveSlot(null);
        setTtsOpen(false);
      }
    },
    [setTtsOpen],
  );

  useEffect(() => {
    if (ttsState === "playing") {
      hideHeader();
    }
  }, [hideHeader, ttsState]);

  const sharedTTSControlsProps = {
    activeSlot: resolvedActiveSlot,
    onRequestSlot: requestTTSSlot,
    onSlotExpandedChange: handleSlotExpandedChange,
    runtimeReady: ttsRuntime !== null,
    state: ttsState,
    preparing: ttsPreparing,
    onPreviewStart: () => {
      if (ttsState === "playing" || ttsPreparing) pauseTTS();
    },
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
    ttsOpen,
    ttsState,
    resumePromptVisible,
    resumePromptMessage,
    handleHighlight,
    handleSyncTTSRuntime,
    stopTTS,
    resumeTTS,
    sharedTTSControlsProps,
  };
}

export type SharedTTSControlsProps = ReturnType<
  typeof useReaderTTSBridge
>["sharedTTSControlsProps"];
