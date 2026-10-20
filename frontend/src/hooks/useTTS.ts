'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { backendTTS, buildAzureSSML, getTextFromSSML, loadTTSSettings } from '@/lib/tts';
import {
  TTS_BUFFER_SECONDS, TTS_CHUNK_SECONDS, TTS_FIRST_CHUNK_SECONDS, TTSSpeechBuffer,
} from '@/lib/tts-batch';
import { formatRemainingTime, normalizeMetadataText } from '@/lib/tts-helpers';
import { classifyTTSError, retryTTSRequest } from '@/lib/tts-request';
import { recordTTSDiagnostic } from '@/lib/tts-diagnostics';
import { useTTSForegroundResume } from '@/hooks/useTTSForegroundResume';
import { useTTSMediaSession } from '@/hooks/useTTSMediaSession';
import { useTTSResumePrompt } from '@/hooks/useTTSResumePrompt';
import { useTTSSession } from '@/hooks/useTTSSession';
import { useTTSSleepTimer } from '@/hooks/useTTSSleepTimer';
import { useTTSVoices } from '@/hooks/useTTSVoices';
import { useWakeLock } from '@/hooks/useWakeLock';
import type { TTSMark, TTSSettings, TTSState } from '@/lib/tts';
import type { TTSAudioChunk } from '@/lib/tts-batch';
import type { TTSVisibleStatus } from '@/lib/tts-helpers';
import type { FoliateView } from '@/lib/types';

interface UseTTSOptions {
  viewRef: React.RefObject<FoliateView | null>;
  onHighlight?: (range: Range) => void;
  bookId?: string;
  voicesEnabled?: boolean;
}

export function useTTS({ viewRef, onHighlight, bookId, voicesEnabled = false }: UseTTSOptions) {
  const [state, setState] = useState<TTSState>('stopped');
  const stateRef = useRef<TTSState>('stopped');
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings);
  const settingsRef = useRef(settings);
  const [currentMark, setCurrentMark] = useState<TTSMark | null>(null);
  const currentMarkRef = useRef<TTSMark | null>(null);
  const [markIndex, setMarkIndex] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [resumePromptVisible, setResumePromptVisible] = useState(false);
  const [resumePromptMessage, setResumePromptMessage] = useState('朗读被系统中断，点击继续朗读。');
  const [ttsStatus, setTTSStatus] = useState<TTSVisibleStatus>({
    headline: '准备朗读', detail: '选择开始后从当前位置朗读', tone: 'idle',
  });
  const sourceRef = useRef<TTSSpeechBuffer | null>(null);
  const currentChunkRef = useRef<TTSAudioChunk | null>(null);
  const pendingRef = useRef<TTSAudioChunk[]>([]);
  const generationRef = useRef(0);
  const operationRef = useRef(0);
  const fillingRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const retryControllerRef = useRef<AbortController | null>(null);
  const durationRatioRef = useRef(new Map<string, number>());
  const measuredChunkRef = useRef<TTSAudioChunk | null>(null);
  const lastHighlightCFIRef = useRef<string | null>(null);
  const advancingRef = useRef<number | null>(null);
  const resumingRef = useRef<number | null>(null);
  const shouldResumeOnForegroundRef = useRef(false);
  const startRef = useRef<() => Promise<void>>(async () => {});
  const stopRef = useRef<() => void>(() => {});
  const nextRef = useRef<() => Promise<void>>(async () => {});
  const prevRef = useRef<() => Promise<void>>(async () => {});
  const playChunkRef = useRef<(chunk: TTSAudioChunk, op: number) => Promise<boolean>>(
    async () => false,
  );
  const preloadRef = useRef<() => Promise<void>>(async () => {});
  const advanceRef = useRef<() => Promise<void>>(async () => {});
  const highlightRef = useRef<() => Promise<void>>(async () => {});
  const isLikelyIOS = useMemo(() => typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)), []);
  const { voices, voicesLoading, voicesError, loadVoices } = useTTSVoices(
    settings.voiceName, voicesEnabled,
  );
  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const dismissResumePrompt = useCallback(() => {
    setResumePromptVisible(false);
    toast.dismiss('tts-resume-hint');
  }, []);
  const getSettings = useCallback(() => backendTTS.getSettings(), []);
  const { loadTTSSession, saveTTSSession, flushTTSSession, clearTTSSession } = useTTSSession({
    bookId, viewRef, currentMarkRef, getSettings,
  });
  const {
    sleepTimer, sleepTimerRef, setSleepTimerForMinutes, clearSleepTimer, clearSleepTimerTimeout,
  } = useTTSSleepTimer({ onExpire: () => stopRef.current(), updateVisibleStatus: setTTSStatus });
  const logTTS = useCallback((event: string, detail?: Record<string, unknown>) => {
    recordTTSDiagnostic(event, detail as Record<string, string | number | boolean | null>);
    if (process.env.NODE_ENV === 'development') console.info(`[tts] ${event}`, detail ?? {});
  }, []);
  const synthesisKey = useCallback(() => {
    const { voiceName, rate, style } = settingsRef.current;
    return JSON.stringify([voiceName, rate, style]);
  }, []);
  const calibratedTarget = useCallback((seconds: number) =>
    seconds / (durationRatioRef.current.get(synthesisKey()) ?? 1), [synthesisKey]);
  const sleepExpired = useCallback(() => {
    const timer = sleepTimerRef.current;
    if (timer.mode !== 'minutes' || !timer.endsAt || Date.now() < timer.endsAt) return false;
    stopRef.current();
    clearSleepTimer();
    return true;
  }, [clearSleepTimer, sleepTimerRef]);

  const syncHighlight = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    const mark = currentMarkRef.current;
    const view = viewRef.current;
    const cfi = settingsRef.current.highlightMode === 'sentence'
      ? mark?.sentenceCfi || mark?.cfi : mark?.cfi;
    if (!mark || !cfi || !view?.resolveCFI || lastHighlightCFIRef.current === cfi) return;
    const generation = generationRef.current;
    try {
      const { index, anchor } = view.resolveCFI(cfi);
      let content = view.renderer?.getContents?.().find(item => item.index === index);
      if (!content) {
        await view.goTo?.(cfi);
        content = view.renderer?.getContents?.().find(item => item.index === index);
      }
      if (!content || generation !== generationRef.current ||
          mark !== currentMarkRef.current || document.visibilityState !== 'visible') return;
      const range = anchor(content.doc);
      mark.range = range;
      lastHighlightCFIRef.current = cfi;
      view.renderer?.scrollToAnchor?.(range, true);
      onHighlight?.(range);
      setCurrentMark({ ...mark });
    } catch (error) {
      logTTS('highlight-unavailable', { message: error instanceof Error ? error.message : 'unknown' });
    }
  }, [logTTS, onHighlight, viewRef]);
  useEffect(() => { highlightRef.current = syncHighlight; }, [syncHighlight]);
  const restoreCurrentHighlight = useCallback(() => {
    lastHighlightCFIRef.current = null;
    void highlightRef.current();
  }, []);

  const resetBuffer = useCallback(() => {
    retryControllerRef.current?.abort();
    retryControllerRef.current = null;
    setPreparing(false);
    ++generationRef.current;
    ++operationRef.current;
    advancingRef.current = null;
    resumingRef.current = null;
    sourceRef.current?.dispose();
    sourceRef.current = null;
    currentChunkRef.current = null;
    pendingRef.current = [];
    fillingRef.current = null;
    measuredChunkRef.current = null;
    lastHighlightCFIRef.current = null;
    backendTTS.stop();
    backendTTS.clearPreloadQueueOnly();
  }, []);

  const stop = useCallback(() => {
    shouldResumeOnForegroundRef.current = false;
    resetBuffer();
    clearSleepTimer();
    clearTTSSession();
    dismissResumePrompt();
    currentMarkRef.current = null;
    setCurrentMark(null);
    setMarkIndex(0);
    window.getSelection()?.removeAllRanges();
    viewRef.current?.renderer?.getContents?.().forEach(({ doc }) => {
      doc.getSelection?.()?.removeAllRanges();
    });
    void releaseWakeLock();
  }, [clearSleepTimer, clearTTSSession, dismissResumePrompt, releaseWakeLock,
    resetBuffer, viewRef]);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  const pause = useCallback(() => {
    retryControllerRef.current?.abort();
    retryControllerRef.current = null;
    setPreparing(false);
    shouldResumeOnForegroundRef.current = false;
    ++operationRef.current;
    advancingRef.current = null;
    resumingRef.current = null;
    backendTTS.pause();
    dismissResumePrompt();
    flushTTSSession();
    void releaseWakeLock();
  }, [dismissResumePrompt, releaseWakeLock, flushTTSSession]);

  const preloadBuffer = useCallback(async () => {
    const source = sourceRef.current;
    const chunk = currentChunkRef.current;
    const generation = generationRef.current;
    if (!source || !chunk) return;
    if (fillingRef.current?.generation === generation) return fillingRef.current.promise;
    const fill = async () => {
      const ratio = durationRatioRef.current.get(synthesisKey()) ?? 1;
      let seconds = pendingRef.current.reduce((sum, item) => sum + item.estimatedSeconds * ratio, 0);
      while (seconds < TTS_BUFFER_SECONDS && source === sourceRef.current &&
          generation === generationRef.current) {
        const from = (pendingRef.current.at(-1) ?? currentChunkRef.current)?.endIndex;
        if (from === undefined) return;
        const next = await source.chunk(from + 1, calibratedTarget(TTS_CHUNK_SECONDS), settingsRef.current);
        if (generation !== generationRef.current || !next) break;
        pendingRef.current.push(next);
        seconds += next.estimatedSeconds * ratio;
      }
      if (generation !== generationRef.current) return;
      const pending = [...pendingRef.current];
      // This promise tracks text preparation only. Network prefetch never blocks
      // user navigation or continuation when another chunk is already available.
      void backendTTS.preloadMultiple(pending.map(item => item.ssml)).then(() => {
        if (generation !== generationRef.current) return;
        const readySeconds = pending.filter(item => backendTTS.hasAudio(item.ssml))
          .reduce((sum, item) => sum + item.estimatedSeconds * ratio, 0);
        logTTS('buffer-ready', { seconds: Math.round(readySeconds), chunks: pending.length });
      });
    };
    const entry = { generation, promise: Promise.resolve() };
    fillingRef.current = entry;
    entry.promise = fill().catch(error => {
      logTTS('buffer-error', { message: error instanceof Error ? error.message : 'unknown' });
    }).finally(() => { if (fillingRef.current === entry) fillingRef.current = null; });
    return entry.promise;
  }, [calibratedTarget, logTTS, synthesisKey]);
  useEffect(() => { preloadRef.current = preloadBuffer; }, [preloadBuffer]);

  const playChunk = useCallback(async (chunk: TTSAudioChunk, operation: number) => {
    const active = () => operation === operationRef.current && shouldResumeOnForegroundRef.current;
    currentChunkRef.current = chunk;
    retryControllerRef.current?.abort();
    const controller = new AbortController();
    retryControllerRef.current = controller;
    setPreparing(true);
    try {
      let ssml = chunk.ssml;
      let fallback = false;
      let retried = false;
      for (;;) {
        if (!active() || sleepExpired()) return false;
        setTTSStatus({ headline: '正在准备朗读', detail: '音频准备好后会自动播放', tone: 'active' });
        try {
          await retryTTSRequest(() => backendTTS.speak(ssml, chunk.marks, true), {
            signal: controller.signal,
            onRetry: (attempt, delayMs, kind) => {
              retried = true;
              logTTS('request-retry', { attempt, delayMs, kind });
              setTTSStatus({ headline: '正在重试朗读',
                detail: `${Math.ceil(delayMs / 1000)} 秒后重试，可随时停止`, tone: 'warning' });
            },
          });
        } catch (error) {
          if (!active() || classifyTTSError(error) === 'cancelled') return false;
          if (!fallback && classifyTTSError(error) === 'invalid-ssml') {
            fallback = true;
            ssml = buildAzureSSML(getTextFromSSML(chunk.ssml), settingsRef.current);
            continue;
          }
          throw error;
        }
        if (!active()) return false;
        if (resumePromptVisible || retried) logTTS('recovery-success');
        dismissResumePrompt();
        void preloadRef.current();
        return true;
      }
    } catch (error) {
      if (!active() || classifyTTSError(error) === 'cancelled') return false;
      logTTS('play-failed', { kind: classifyTTSError(error) });
      backendTTS.pause();
      flushTTSSession();
      setResumePromptMessage(classifyTTSError(error) === 'timeout'
        ? '语音请求超时，点击继续可从当前片段恢复。'
        : '朗读暂时中断，点击继续可从当前片段恢复。');
      setResumePromptVisible(true);
      return false;
    } finally {
      if (retryControllerRef.current === controller) retryControllerRef.current = null;
      if (operation === operationRef.current) setPreparing(false);
    }
  }, [dismissResumePrompt, flushTTSSession, logTTS, resumePromptVisible, sleepExpired]);
  useEffect(() => { playChunkRef.current = playChunk; }, [playChunk]);

  const advance = useCallback(async () => {
    if (advancingRef.current !== null || !shouldResumeOnForegroundRef.current || sleepExpired()) return;
    const operation = operationRef.current;
    advancingRef.current = operation;
    try {
      // Wait only for an already running buffer fill, never for reader layout.
      if (!pendingRef.current.length) await fillingRef.current?.promise;
      if (operation !== operationRef.current || !shouldResumeOnForegroundRef.current) return;
      const chunk = pendingRef.current.shift() ?? await sourceRef.current?.chunk(
        (currentChunkRef.current?.endIndex ?? -1) + 1, calibratedTarget(TTS_CHUNK_SECONDS),
        settingsRef.current,
      );
      if (operation !== operationRef.current || !shouldResumeOnForegroundRef.current) return;
      if (!chunk) { stopRef.current(); return; }
      await playChunkRef.current(chunk, operation);
    } catch (error) {
      if (operation !== operationRef.current) return;
      logTTS('continuation-error', { message: error instanceof Error ? error.message : 'unknown' });
      backendTTS.pause();
      setResumePromptVisible(true);
    } finally {
      if (advancingRef.current === operation) advancingRef.current = null;
    }
  }, [calibratedTarget, logTTS, sleepExpired]);
  useEffect(() => { advanceRef.current = advance; }, [advance]);

  const begin = useCallback(async (fromCFI?: string) => {
    const view = viewRef.current;
    if (!view?.getTTSSentences) {
      setTTSStatus({ headline: '当前文档暂不支持朗读', tone: 'warning' });
      return;
    }
    resetBuffer();
    backendTTS.beginSession();
    shouldResumeOnForegroundRef.current = true;
    const operation = operationRef.current;
    const source = new TTSSpeechBuffer(view.getTTSSentences(
      fromCFI || loadTTSSession()?.cfi || view.lastLocation?.cfi,
    ));
    sourceRef.current = source;
    setPreparing(true);
    try {
      const chunk = await source.chunk(0, calibratedTarget(TTS_FIRST_CHUNK_SECONDS), settingsRef.current);
      if (operation !== operationRef.current || !shouldResumeOnForegroundRef.current) return;
      if (!chunk) { stopRef.current(); return; }
      if (await playChunkRef.current(chunk, operation)) await requestWakeLock();
    } catch (error) {
      if (operation !== operationRef.current) return;
      logTTS('start-error', { message: error instanceof Error ? error.message : 'unknown' });
      backendTTS.pause();
      setResumePromptVisible(true);
    } finally {
      if (operation === operationRef.current) setPreparing(false);
    }
  }, [calibratedTarget, loadTTSSession, logTTS, requestWakeLock, resetBuffer, viewRef]);

  const resume = useCallback(async () => {
    if (resumingRef.current !== null) return;
    if (sleepExpired()) return;
    shouldResumeOnForegroundRef.current = true;
    if (stateRef.current === 'playing' && !backendTTS.needsResume() && !backendTTS.hasEnded()) return;
    const operation = ++operationRef.current;
    resumingRef.current = operation;
    try {
      if (backendTTS.hasCurrentAudio()) {
        await backendTTS.resume();
      } else if (backendTTS.hasEnded()) {
        await advanceRef.current();
      } else if (currentChunkRef.current) {
        if (!await playChunkRef.current(currentChunkRef.current, operation)) return;
      } else {
        await begin();
        return;
      }
      if (operation !== operationRef.current || backendTTS.getState() !== 'playing') return;
      dismissResumePrompt();
      await requestWakeLock();
      void highlightRef.current();
    } catch (error) {
      if (operation !== operationRef.current) return;
      logTTS('resume-error', { message: error instanceof Error ? error.message : 'unknown' });
      backendTTS.pause();
      setResumePromptVisible(true);
    } finally {
      if (resumingRef.current === operation) resumingRef.current = null;
    }
  }, [begin, dismissResumePrompt, logTTS, requestWakeLock, sleepExpired]);
  useEffect(() => { startRef.current = resume; }, [resume]);
  const start = useCallback(async () => {
    if (preparing || (stateRef.current === 'playing' && !backendTTS.needsResume())) pause();
    else if (stateRef.current === 'paused' || currentChunkRef.current) await resume();
    else await begin();
  }, [begin, pause, preparing, resume]);

  const jump = useCallback(async (direction: number) => {
    if (!sourceRef.current || !currentChunkRef.current) return;
    const operation = ++operationRef.current;
    ++generationRef.current;
    retryControllerRef.current?.abort();
    retryControllerRef.current = null;
    fillingRef.current = null;
    advancingRef.current = null;
    resumingRef.current = null;
    const source = sourceRef.current;
    shouldResumeOnForegroundRef.current = true;
    backendTTS.pause();
    pendingRef.current = [];
    backendTTS.clearPreloadQueueOnly();
    flushTTSSession();
    try {
      let checkedPrevious = false;
      if (direction < 0 && (currentMarkRef.current?.sentenceIndex ?? 0) <= source.firstSentenceIndex) {
        checkedPrevious = true;
        const cfi = currentMarkRef.current?.sentenceCfi || currentMarkRef.current?.cfi;
        const previous = cfi ? await viewRef.current?.getTTSPreviousCFI?.(cfi) : null;
        if (operation !== operationRef.current) return;
        if (previous) { await begin(previous); return; }
      }
      const currentIndex = currentMarkRef.current?.sentenceIndex ?? currentChunkRef.current.startIndex;
      const adjacent = await source.adjacentSentenceIndex(currentIndex,
        direction < 0 ? -1 : 1, settingsRef.current);
      if (operation !== operationRef.current) return;
      if (adjacent === null && direction > 0) { stopRef.current(); return; }
      if (adjacent === null && direction < 0 && !checkedPrevious) {
        const cfi = currentMarkRef.current?.sentenceCfi || currentMarkRef.current?.cfi;
        const previous = cfi ? await viewRef.current?.getTTSPreviousCFI?.(cfi) : null;
        if (operation !== operationRef.current) return;
        if (previous) { await begin(previous); return; }
      }
      const index = adjacent ?? currentIndex;
      const chunk = await source.chunk(index, calibratedTarget(TTS_FIRST_CHUNK_SECONDS),
        settingsRef.current);
      if (operation !== operationRef.current) return;
      if (chunk) await playChunkRef.current(chunk, operation);
      else stopRef.current();
    } catch {
      if (operation === operationRef.current) setResumePromptVisible(true);
    }
  }, [begin, calibratedTarget, flushTTSSession, viewRef]);
  const next = useCallback(() => jump(1), [jump]);
  const prev = useCallback(() => jump(-1), [jump]);
  useEffect(() => { nextRef.current = next; prevRef.current = prev; }, [next, prev]);

  const updateSettings = useCallback((changes: Partial<TTSSettings>) => {
    const previous = settingsRef.current;
    const updated = { ...previous, ...changes };
    if (Object.keys(changes).every(key =>
      updated[key as keyof TTSSettings] === previous[key as keyof TTSSettings])) return;
    settingsRef.current = updated;
    backendTTS.setSettings(updated);
    setSettings(updated);
    flushTTSSession();
    const audioChanged = previous.voiceName !== updated.voiceName ||
      previous.rate !== updated.rate || previous.style !== updated.style;
    if (!audioChanged) {
      lastHighlightCFIRef.current = null;
      void highlightRef.current();
      return;
    }
    if (shouldResumeOnForegroundRef.current) {
      void begin();
    } else if (stateRef.current === 'paused') {
      resetBuffer();
      backendTTS.pause();
    }
  }, [begin, resetBuffer, flushTTSSession]);

  useEffect(() => {
    backendTTS.onStateChangeCallback(nextState => {
      stateRef.current = nextState;
      setState(nextState);
      setTTSStatus({
        headline: nextState === 'playing' ? '正在朗读' : nextState === 'paused'
          ? '朗读已暂停' : '朗读已停止',
        detail: nextState === 'playing' ? '后续音频正在提前准备' : undefined,
        tone: nextState === 'playing' ? 'active' : 'idle',
      });
      if (nextState !== 'stopped') saveTTSSession();
      if (nextState === 'paused') void releaseWakeLock();
    });
    backendTTS.onMarkChangeCallback((mark, index) => {
      currentMarkRef.current = { ...mark };
      saveTTSSession(index === 0);
      if (document.visibilityState === 'visible') {
        setCurrentMark({ ...mark });
        setMarkIndex(index);
        void highlightRef.current();
      }
    });
    backendTTS.onEndCallback(() => { void advanceRef.current(); });
    backendTTS.onPreloadTriggerCallback(() => { void preloadRef.current(); });
    backendTTS.onTimeUpdateCallback((time, duration) => {
      const chunk = currentChunkRef.current;
      if (chunk && measuredChunkRef.current !== chunk && duration > 0 && chunk.estimatedSeconds > 0) {
        measuredChunkRef.current = chunk;
        const key = synthesisKey();
        const observed = Math.max(0.5, Math.min(2, duration / chunk.estimatedSeconds));
        const prior = durationRatioRef.current.get(key);
        durationRatioRef.current.set(key, prior === undefined ? observed :
          0.7 * prior + 0.3 * observed);
        logTTS('duration-calibration', { estimatedSeconds: chunk.estimatedSeconds,
          duration, ratio: durationRatioRef.current.get(key) });
      }
      if (sleepExpired() || document.visibilityState !== 'visible') return;
      const detail = formatRemainingTime(duration - time);
      setTTSStatus(previous => previous.headline === '正在朗读' && previous.detail === detail
        ? previous : { headline: '正在朗读', detail, tone: 'active' });
    });
    return () => {
      shouldResumeOnForegroundRef.current = false;
      flushTTSSession();
      resetBuffer();
      backendTTS.clearPreload();
      clearSleepTimerTimeout();
      void releaseWakeLock();
    };
  }, [clearSleepTimerTimeout, flushTTSSession, logTTS, releaseWakeLock, resetBuffer,
    saveTTSSession, sleepExpired, synthesisKey]);

  const foregroundResume = useCallback(() => {
    if (document.visibilityState !== 'visible' || !shouldResumeOnForegroundRef.current) return;
    if (retryControllerRef.current) return;
    if (sleepExpired()) return;
    saveTTSSession();
    void highlightRef.current();
    if (backendTTS.needsResume() || stateRef.current === 'paused' || backendTTS.hasEnded()) {
      void resume();
    } else if (stateRef.current === 'playing') void requestWakeLock();
  }, [requestWakeLock, resume, saveTTSSession, sleepExpired]);
  useTTSForegroundResume({
    stateRef, shouldResumeOnForegroundRef, logTTS,
    attemptResumeAfterInterruption: foregroundResume, releaseWakeLock, saveSession: flushTTSSession,
  });
  useTTSResumePrompt({
    resumePromptVisible, resumePromptMessage, isLikelyIOS,
    shouldResumeOnForegroundRef, onResumeAttempt: foregroundResume,
  });
  useTTSMediaSession({
    viewRef, state, currentMark, normalizeMetadataText, onPause: pause,
    startRef, stopRef, nextRef, prevRef,
  });

  return {
    state, preparing, settings, updateSettings, start, stop, next, prev, resume, pause,
    voices, voicesLoading, voicesError, reloadVoices: loadVoices,
    currentMark, markIndex, ttsStatus, sleepTimer, setSleepTimerForMinutes, clearSleepTimer,
    resumePromptVisible, resumePromptMessage, restoreCurrentHighlight,
  };
}
