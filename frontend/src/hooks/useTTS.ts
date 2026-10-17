'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { backendTTS, buildAzureSSML, getTextFromSSML, loadTTSSettings } from '@/lib/tts';
import {
  TTS_BUFFER_SECONDS, TTS_CHUNK_SECONDS, TTS_FIRST_CHUNK_SECONDS, TTSSpeechBuffer,
} from '@/lib/tts-batch';
import { formatRemainingTime, normalizeMetadataText } from '@/lib/tts-helpers';
import { isAbortLikeError } from '@/lib/config';
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
}

export function useTTS({ viewRef, onHighlight, bookId }: UseTTSOptions) {
  const [state, setState] = useState<TTSState>('stopped');
  const stateRef = useRef<TTSState>('stopped');
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings);
  const settingsRef = useRef(settings);
  const [currentMark, setCurrentMark] = useState<TTSMark | null>(null);
  const currentMarkRef = useRef<TTSMark | null>(null);
  const [markIndex, setMarkIndex] = useState(0);
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
  const { voices, voicesLoading, voicesError, loadVoices } = useTTSVoices(settings.voiceName);
  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const dismissResumePrompt = useCallback(() => {
    setResumePromptVisible(false);
    toast.dismiss('tts-resume-hint');
  }, []);
  const getSettings = useCallback(() => backendTTS.getSettings(), []);
  const { loadTTSSession, saveTTSSession, clearTTSSession } = useTTSSession({
    bookId, viewRef, currentMarkRef, getSettings,
  });
  const {
    sleepTimer, sleepTimerRef, setSleepTimerForMinutes, clearSleepTimer, clearSleepTimerTimeout,
  } = useTTSSleepTimer({ onExpire: () => stopRef.current(), updateVisibleStatus: setTTSStatus });
  const logTTS = useCallback((event: string, detail?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') console.info(`[tts] ${event}`, detail ?? {});
  }, []);
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
    if (!mark?.cfi || !view?.resolveCFI) return;
    const generation = generationRef.current;
    try {
      const { index, anchor } = view.resolveCFI(mark.cfi);
      let content = view.renderer?.getContents?.().find(item => item.index === index);
      if (!content) {
        await view.goTo?.(mark.cfi);
        content = view.renderer?.getContents?.().find(item => item.index === index);
      }
      if (!content || generation !== generationRef.current ||
          mark !== currentMarkRef.current || document.visibilityState !== 'visible') return;
      const range = anchor(content.doc);
      mark.range = range;
      view.renderer?.scrollToAnchor?.(range, true);
      onHighlight?.(range);
      setCurrentMark({ ...mark });
    } catch (error) {
      logTTS('highlight-unavailable', { message: error instanceof Error ? error.message : 'unknown' });
    }
  }, [logTTS, onHighlight, viewRef]);
  useEffect(() => { highlightRef.current = syncHighlight; }, [syncHighlight]);
  const restoreCurrentHighlight = useCallback(() => { void highlightRef.current(); }, []);

  const resetBuffer = useCallback(() => {
    ++generationRef.current;
    ++operationRef.current;
    advancingRef.current = null;
    resumingRef.current = null;
    sourceRef.current?.dispose();
    sourceRef.current = null;
    currentChunkRef.current = null;
    pendingRef.current = [];
    fillingRef.current = null;
    backendTTS.stop();
    backendTTS.clearPreload();
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
    shouldResumeOnForegroundRef.current = false;
    ++operationRef.current;
    advancingRef.current = null;
    resumingRef.current = null;
    backendTTS.pause();
    dismissResumePrompt();
    saveTTSSession();
    void releaseWakeLock();
  }, [dismissResumePrompt, releaseWakeLock, saveTTSSession]);

  const preloadBuffer = useCallback(async () => {
    const source = sourceRef.current;
    const chunk = currentChunkRef.current;
    const generation = generationRef.current;
    if (!source || !chunk) return;
    if (fillingRef.current?.generation === generation) return fillingRef.current.promise;
    const fill = async () => {
      let seconds = pendingRef.current.reduce((sum, item) => sum + item.estimatedSeconds, 0);
      while (seconds < TTS_BUFFER_SECONDS && source === sourceRef.current &&
          generation === generationRef.current) {
        const from = (pendingRef.current.at(-1) ?? currentChunkRef.current)?.endIndex;
        if (from === undefined) return;
        const next = await source.chunk(from + 1, TTS_CHUNK_SECONDS, settingsRef.current);
        if (generation !== generationRef.current || !next) break;
        pendingRef.current.push(next);
        seconds += next.estimatedSeconds;
      }
      if (generation !== generationRef.current) return;
      const pending = [...pendingRef.current];
      await backendTTS.preloadMultiple(pending.map(item => item.ssml));
      if (generation !== generationRef.current) return;
      const readySeconds = pending.filter(item => backendTTS.hasAudio(item.ssml))
        .reduce((sum, item) => sum + item.estimatedSeconds, 0);
      logTTS('buffer-ready', { seconds: Math.round(readySeconds), chunks: pending.length });
    };
    const entry = { generation, promise: Promise.resolve() };
    fillingRef.current = entry;
    entry.promise = fill().catch(error => {
      logTTS('buffer-error', { message: error instanceof Error ? error.message : 'unknown' });
    }).finally(() => { if (fillingRef.current === entry) fillingRef.current = null; });
    return entry.promise;
  }, [logTTS]);
  useEffect(() => { preloadRef.current = preloadBuffer; }, [preloadBuffer]);

  const playChunk = useCallback(async (chunk: TTSAudioChunk, operation: number) => {
    const active = () => operation === operationRef.current && shouldResumeOnForegroundRef.current;
    currentChunkRef.current = chunk;
    const attempts = [chunk.ssml, chunk.ssml,
      buildAzureSSML(getTextFromSSML(chunk.ssml), settingsRef.current)];
    for (const ssml of attempts) {
      if (!active() || sleepExpired()) return false;
      try {
        setTTSStatus({ headline: '正在准备朗读', detail: '音频准备好后会自动播放', tone: 'active' });
        await backendTTS.speak(ssml, chunk.marks, true);
        if (!active()) return false;
        dismissResumePrompt();
        void preloadRef.current();
        return true;
      } catch (error) {
        if (!active() || isAbortLikeError(error)) return false;
        logTTS('play-failed', { name: error instanceof Error ? error.name : 'unknown' });
        // Permission/focus interruptions are not synthesis failures. Retrying
        // them as SSML errors can skip content and repeatedly steal audio focus.
        if (error instanceof Error && error.name === 'NotAllowedError') break;
      }
    }
    if (active()) {
      backendTTS.pause();
      setResumePromptMessage('朗读暂时中断，点击继续可从当前片段恢复。');
      setResumePromptVisible(true);
    }
    return false;
  }, [dismissResumePrompt, logTTS, sleepExpired]);
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
        (currentChunkRef.current?.endIndex ?? -1) + 1, TTS_CHUNK_SECONDS, settingsRef.current,
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
  }, [logTTS, sleepExpired]);
  useEffect(() => { advanceRef.current = advance; }, [advance]);

  const begin = useCallback(async (fromCFI?: string) => {
    const view = viewRef.current;
    if (!view?.getTTSSentences) {
      setTTSStatus({ headline: '当前文档暂不支持朗读', tone: 'warning' });
      return;
    }
    resetBuffer();
    shouldResumeOnForegroundRef.current = true;
    const operation = operationRef.current;
    const source = new TTSSpeechBuffer(view.getTTSSentences(
      fromCFI || loadTTSSession()?.cfi || view.lastLocation?.cfi,
    ));
    sourceRef.current = source;
    try {
      const chunk = await source.chunk(0, TTS_FIRST_CHUNK_SECONDS, settingsRef.current);
      if (operation !== operationRef.current || !shouldResumeOnForegroundRef.current) return;
      if (!chunk) { stopRef.current(); return; }
      if (await playChunkRef.current(chunk, operation)) await requestWakeLock();
    } catch (error) {
      if (operation !== operationRef.current) return;
      logTTS('start-error', { message: error instanceof Error ? error.message : 'unknown' });
      backendTTS.pause();
      setResumePromptVisible(true);
    }
  }, [loadTTSSession, logTTS, requestWakeLock, resetBuffer, viewRef]);

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
    if (stateRef.current === 'playing' && !backendTTS.needsResume()) pause();
    else if (stateRef.current === 'paused' || currentChunkRef.current) await resume();
    else await begin();
  }, [begin, pause, resume]);

  const jump = useCallback(async (direction: number) => {
    if (!sourceRef.current || !currentChunkRef.current) return;
    const operation = ++operationRef.current;
    advancingRef.current = null;
    resumingRef.current = null;
    const source = sourceRef.current;
    shouldResumeOnForegroundRef.current = true;
    backendTTS.pause();
    try {
      await fillingRef.current?.promise;
      if (operation !== operationRef.current) return;
      if (direction < 0 && (currentMarkRef.current?.sentenceIndex ?? 0) <= source.firstSentenceIndex) {
        const cfi = currentMarkRef.current?.cfi;
        const previous = cfi ? await viewRef.current?.getTTSPreviousCFI?.(cfi) : null;
        if (operation !== operationRef.current) return;
        if (previous) { await begin(previous); return; }
      }
      const index = Math.max(0,
        (currentMarkRef.current?.sentenceIndex ?? currentChunkRef.current.startIndex) + direction);
      pendingRef.current = [];
      backendTTS.clearPreloadQueueOnly();
      const chunk = await source.chunk(index, TTS_FIRST_CHUNK_SECONDS, settingsRef.current);
      if (operation !== operationRef.current) return;
      if (chunk) await playChunkRef.current(chunk, operation);
      else stopRef.current();
    } catch {
      if (operation === operationRef.current) setResumePromptVisible(true);
    }
  }, [begin, viewRef]);
  const next = useCallback(() => jump(1), [jump]);
  const prev = useCallback(() => jump(-1), [jump]);
  useEffect(() => { nextRef.current = next; prevRef.current = prev; }, [next, prev]);

  const updateSettings = useCallback((changes: Partial<TTSSettings>) => {
    const updated = { ...settingsRef.current, ...changes };
    settingsRef.current = updated;
    backendTTS.setSettings(updated);
    setSettings(updated);
    saveTTSSession();
    if (shouldResumeOnForegroundRef.current) {
      void begin();
    } else if (stateRef.current === 'paused') {
      resetBuffer();
      backendTTS.pause();
    }
  }, [begin, resetBuffer, saveTTSSession]);

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
      saveTTSSession();
      if (document.visibilityState === 'visible') {
        setCurrentMark({ ...mark });
        setMarkIndex(index);
        void highlightRef.current();
      }
    });
    backendTTS.onEndCallback(() => { void advanceRef.current(); });
    backendTTS.onPreloadTriggerCallback(() => { void preloadRef.current(); });
    backendTTS.onTimeUpdateCallback((time, duration) => {
      if (sleepExpired() || document.visibilityState !== 'visible') return;
      setTTSStatus({ headline: '正在朗读', detail: formatRemainingTime(duration - time), tone: 'active' });
    });
    return () => {
      shouldResumeOnForegroundRef.current = false;
      resetBuffer();
      clearSleepTimerTimeout();
      void releaseWakeLock();
    };
  }, [clearSleepTimerTimeout, releaseWakeLock, resetBuffer, saveTTSSession, sleepExpired]);

  const foregroundResume = useCallback(() => {
    if (document.visibilityState !== 'visible' || !shouldResumeOnForegroundRef.current) return;
    if (sleepExpired()) return;
    saveTTSSession();
    void highlightRef.current();
    if (backendTTS.needsResume() || stateRef.current === 'paused' || backendTTS.hasEnded()) {
      void resume();
    } else if (stateRef.current === 'playing') void requestWakeLock();
  }, [requestWakeLock, resume, saveTTSSession, sleepExpired]);
  useTTSForegroundResume({
    stateRef, shouldResumeOnForegroundRef, logTTS,
    attemptResumeAfterInterruption: foregroundResume, releaseWakeLock, saveSession: saveTTSSession,
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
    state, settings, updateSettings, start, stop, next, prev, resume,
    voices, voicesLoading, voicesError, reloadVoices: loadVoices,
    currentMark, markIndex, ttsStatus, sleepTimer, setSleepTimerForMinutes, clearSleepTimer,
    resumePromptVisible, resumePromptMessage, restoreCurrentHighlight,
  };
}
