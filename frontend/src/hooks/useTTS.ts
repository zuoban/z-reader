'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  backendTTS,
  TTSState,
  TTSSettings,
  TTSMark,
  buildAzureSSML,
  getTextFromSSML,
  isSkippableTTSText,
  loadTTSSettings,
} from '@/lib/tts';
import { FoliateView } from '@/lib/types';
import { useTTSForegroundResume } from '@/hooks/useTTSForegroundResume';
import { useTTSMediaSession } from '@/hooks/useTTSMediaSession';
import { useTTSResumePrompt } from '@/hooks/useTTSResumePrompt';
import { useTTSVoices } from '@/hooks/useTTSVoices';
import { useWakeLock } from '@/hooks/useWakeLock';

interface UseTTSOptions {
  viewRef: React.RefObject<FoliateView | null>;
  onHighlight?: (range: Range) => void;
  bookId?: string;
}

interface TTSSessionSnapshot {
  cfi: string;
  markName?: string;
  markText?: string;
  timestamp: number;
  settings: TTSSettings;
}

type TTSQueueSegmentState =
  | 'idle'
  | 'queued'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'failed'
  | 'skipped';

interface TTSQueueSegment {
  id: string;
  index: number;
  source: 'current' | 'lookahead';
  ssml: string;
  enhancedSSML: string;
  fallbackSSML: string;
  text: string;
  state: TTSQueueSegmentState;
  createdAt: number;
}

const TTS_SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

function getTTSSessionKey(bookId?: string): string | null {
  return bookId ? `z-reader-tts-session:${bookId}` : null;
}

function createTTSQueueSegmentId(ssml: string, index: number): string {
  let hash = 0;
  for (let i = 0; i < ssml.length; i += 1) {
    hash = Math.imul(31, hash) + ssml.charCodeAt(i);
    hash |= 0;
  }
  return `${index}:${Math.abs(hash).toString(36)}`;
}

export function useTTS({ viewRef, onHighlight, bookId }: UseTTSOptions) {
  const [state, setState] = useState<TTSState>('stopped');
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings);
  const [currentMark, setCurrentMark] = useState<TTSMark | null>(null);
  const [markIndex, setMarkIndex] = useState<number>(0);
  const [resumePromptVisible, setResumePromptVisible] = useState(false);
  const [resumePromptMessage, setResumePromptMessage] = useState('朗读被系统中断，轻触即可继续。');
  const { voices, voicesLoading, voicesError, loadVoices } = useTTSVoices(settings.voiceName);
  
  const ttsInstance = useRef(backendTTS);
  const isPlayingRef = useRef(false);
  const getNextAndSpeakRef = useRef<() => Promise<boolean>>(async () => false);
  const stateRef = useRef<TTSState>('stopped');
  const queueRef = useRef<TTSQueueSegment[]>([]);
  const activeSegmentIdRef = useRef<string | null>(null);
  const shouldResumeOnForegroundRef = useRef(false);
  const resumeInFlightRef = useRef(false);
  const retryContinuationRef = useRef(false);
  const isLikelyIOSRef = useRef(false);
  const currentMarkRef = useRef<TTSMark | null>(null);
  const startRef = useRef<() => Promise<void>>(async () => {});
  const stopRef = useRef<() => void>(() => {});
  const nextRef = useRef<() => Promise<void>>(async () => {});
  const prevRef = useRef<() => Promise<void>>(async () => {});
  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const dismissResumePrompt = useCallback(() => {
    toast.dismiss('tts-resume-hint');
  }, []);

  const loadTTSSession = useCallback((): TTSSessionSnapshot | null => {
    if (typeof window === 'undefined') return null;

    const key = getTTSSessionKey(bookId);
    if (!key) return null;

    try {
      const saved = localStorage.getItem(key);
      if (!saved) return null;

      const parsed = JSON.parse(saved) as TTSSessionSnapshot;
      if (!parsed.cfi || Date.now() - parsed.timestamp > TTS_SESSION_TTL) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [bookId]);

  const saveTTSSession = useCallback(() => {
    if (typeof window === 'undefined') return;

    const key = getTTSSessionKey(bookId);
    const cfi = viewRef.current?.lastLocation?.cfi;
    if (!key || !cfi) return;

    const mark = currentMarkRef.current;
    const snapshot: TTSSessionSnapshot = {
      cfi,
      markName: mark?.name,
      markText: mark?.text,
      timestamp: Date.now(),
      settings: ttsInstance.current.getSettings(),
    };

    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
    } catch {
      // localStorage may be unavailable in private browsing or under quota pressure.
    }
  }, [bookId, viewRef]);

  const clearTTSSession = useCallback(() => {
    if (typeof window === 'undefined') return;

    const key = getTTSSessionKey(bookId);
    if (!key) return;

    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  }, [bookId]);

  const logTTS = useCallback((event: string, detail?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'production') return;

    const payload = detail ? ` ${JSON.stringify(detail)}` : '';
    console.info(`[tts] ${event}${payload}`);
  }, []);

  const normalizeMetadataText = useCallback((value: unknown): string => {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => normalizeMetadataText(item))
        .filter(Boolean)
        .join(' / ');
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return (
        normalizeMetadataText(record.name) ||
        normalizeMetadataText(record.value) ||
        normalizeMetadataText(record.label) ||
        normalizeMetadataText(record.text)
      );
    }

    return '';
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    const userAgent = navigator.userAgent || '';
    isLikelyIOSRef.current =
      /iPad|iPhone|iPod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  const updateSettings = useCallback((newSettings: Partial<TTSSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      ttsInstance.current.setSettings(updated);
      return updated;
    });
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    currentMarkRef.current = currentMark;
  }, [currentMark]);

  const handleHighlight = useCallback((range: Range) => {
    if (viewRef.current?.renderer) {
      viewRef.current.renderer.scrollToAnchor?.(range, true);
    }
    onHighlight?.(range);
  }, [viewRef, onHighlight]);

  const syncHighlightAfterResume = useCallback(() => {
    const range = currentMarkRef.current?.range;
    if (!range) return;

    window.requestAnimationFrame(() => {
      handleHighlight(range);
      window.setTimeout(() => {
        handleHighlight(range);
      }, 140);
    });
  }, [handleHighlight]);

  const clearReaderHighlight = useCallback(() => {
    const view = viewRef.current;

    view?.tts?.clearHighlight?.();

    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }

    const docs = new Set<Document>();
    const ttsDoc = view?.tts?.doc;
    if (ttsDoc) {
      docs.add(ttsDoc);
    }

    const contents = view?.renderer?.getContents?.() ?? [];
    contents.forEach(({ doc }) => {
      if (doc) {
        docs.add(doc);
      }
    });

    docs.forEach((doc) => {
      try {
        doc.getSelection?.()?.removeAllRanges();
        doc.defaultView?.getSelection?.()?.removeAllRanges();
      } catch {
        // 某些 iframe 文档在销毁或切页瞬间可能暂时不可访问，忽略即可
      }
    });
  }, [viewRef]);

  const buildSSML = useCallback((content: string): string => {
    return buildAzureSSML(content, settings);
  }, [settings]);

  const isSpeakableSSML = useCallback((ssml: string | null | undefined): ssml is string => {
    if (!ssml) return false;

    const text = getTextFromSSML(ssml);
    return Boolean(text && !isSkippableTTSText(text));
  }, []);

  const updateQueueSegmentState = useCallback((
    segmentId: string,
    nextState: TTSQueueSegmentState,
  ) => {
    queueRef.current = queueRef.current.map((segment) => {
      if (segment.id !== segmentId) return segment;
      return { ...segment, state: nextState };
    });
  }, []);

  const createQueueSegment = useCallback((
    ssml: string,
    index: number,
    source: TTSQueueSegment['source'],
  ): TTSQueueSegment | null => {
    const text = getTextFromSSML(ssml);
    if (!text || isSkippableTTSText(text)) return null;

    const enhancedSSML = buildSSML(ssml);
    const fallbackSSML = buildSSML(text);
    return {
      id: createTTSQueueSegmentId(enhancedSSML, index),
      index,
      source,
      ssml,
      enhancedSSML,
      fallbackSSML,
      text,
      state: source === 'current' ? 'idle' : 'queued',
      createdAt: Date.now(),
    };
  }, [buildSSML]);

  const ensureTTS = useCallback(async () => {
    if (!viewRef.current) return false;

    const view = viewRef.current;
    const contents = view.renderer?.getContents?.();
    const doc = contents?.[0]?.doc;

    if (!doc) return false;

    if (view.tts && view.tts.doc === doc) return true;

    try {
      await view.initTTS?.('word', handleHighlight);
      return true;
    } catch (err) {
      console.error('Failed to init TTS:', err);
      return false;
    }
  }, [viewRef, handleHighlight]);

  // 获取后续多个段落的 SSML（不改变状态）
  const getNextSSMLs = useCallback((count: number): string[] => {
    if (!viewRef.current) return [];

    const view = viewRef.current;
    
    // 使用 peekNextMultiple 获取多个下一段，不改变当前位置
    const ssmlList = view.tts?.peekNextMultiple?.(count) ?? [];
    
    return ssmlList.filter((ssml: string) => ssml);
  }, [viewRef]);

  const rebuildSpeechQueue = useCallback((currentSSML?: string): TTSQueueSegment[] => {
    const rawSegments = [
      ...(currentSSML ? [{ ssml: currentSSML, source: 'current' as const }] : []),
      ...getNextSSMLs(3).map((ssml) => ({ ssml, source: 'lookahead' as const })),
    ];

    const seen = new Set<string>();
    const queue: TTSQueueSegment[] = [];

    rawSegments.forEach((rawSegment) => {
      const segment = createQueueSegment(rawSegment.ssml, queue.length, rawSegment.source);
      if (!segment || seen.has(segment.enhancedSSML)) return;

      seen.add(segment.enhancedSSML);
      queue.push(segment);
    });

    queueRef.current = queue;
    logTTS('queue-rebuilt', {
      size: queue.length,
      current: queue[0]?.id ?? null,
      lookahead: Math.max(queue.length - 1, 0),
    });

    return queue;
  }, [createQueueSegment, getNextSSMLs, logTTS]);

  const getRelevantQueueSSMLs = useCallback((): string[] => {
    return queueRef.current
      .filter((segment) => segment.state !== 'failed' && segment.state !== 'skipped')
      .map((segment) => segment.enhancedSSML);
  }, []);

  // 预加载后续段落
  const preloadNext = useCallback(async () => {
    if (!viewRef.current) return;
    
    if (!ttsInstance.current.isSpeaking()) return;
    
    try {
      if (queueRef.current.length <= 1) {
        rebuildSpeechQueue();
      }
      
      const preloadSegments = queueRef.current
        .filter((segment) => segment.source === 'lookahead' && segment.state === 'queued')
        .slice(0, 3);

      preloadSegments.forEach((segment) => {
        updateQueueSegmentState(segment.id, 'loading');
      });
      
      await ttsInstance.current.preloadMultiple(
        preloadSegments.map((segment) => segment.enhancedSSML),
      );

      preloadSegments.forEach((segment) => {
        updateQueueSegmentState(segment.id, 'ready');
      });

      if (preloadSegments.length > 0) {
        logTTS('queue-preloaded', {
          count: preloadSegments.length,
          ready: queueRef.current.filter((segment) => segment.state === 'ready').length,
        });
      }
    } catch (err) {
      queueRef.current
        .filter((segment) => segment.source === 'lookahead' && segment.state === 'loading')
        .forEach((segment) => updateQueueSegmentState(segment.id, 'failed'));
      console.error('Preload error:', err);
    }
  }, [viewRef, rebuildSpeechQueue, updateQueueSegmentState, logTTS]);

  useEffect(() => {
    ttsInstance.current.onPreloadTriggerCallback(() => {
      preloadNext();
    });
  }, [preloadNext]);

  const attemptSpeakSegment = useCallback(async (
    segment: TTSQueueSegment,
    isContinuous?: boolean,
  ): Promise<boolean> => {
    const attempts = [
      { ssml: segment.enhancedSSML, kind: 'primary', delayMs: 0 },
      { ssml: segment.enhancedSSML, kind: 'retry', delayMs: 350 },
      { ssml: segment.fallbackSSML, kind: 'fallback-text', delayMs: 0 },
    ] as const;

    for (const attempt of attempts) {
      if (attempt.delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt.delayMs));
      }

      try {
        logTTS('segment-speak-attempt', {
          segment: segment.id,
          kind: attempt.kind,
          continuous: Boolean(isContinuous),
        });
        await ttsInstance.current.speak(attempt.ssml, undefined, isContinuous);
        if (attempt.kind === 'fallback-text') {
          logTTS('segment-fallback-success', { segment: segment.id });
        }
        return true;
      } catch (err) {
        logTTS('segment-speak-failed', {
          segment: segment.id,
          kind: attempt.kind,
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    return false;
  }, [logTTS]);

  const speakSSML = useCallback(async (ssml: string | null | undefined, isContinuous?: boolean): Promise<boolean> => {
    if (!isSpeakableSSML(ssml)) return false;

    const queue = rebuildSpeechQueue(ssml);
    const currentSegment = queue[0];
    if (!currentSegment) return false;
    
    activeSegmentIdRef.current = currentSegment.id;
    updateQueueSegmentState(currentSegment.id, 'loading');
    ttsInstance.current.cleanupIrrelevantPreloads(getRelevantQueueSSMLs());
    
    const didSpeak = await attemptSpeakSegment(currentSegment, isContinuous);
    if (didSpeak) {
      updateQueueSegmentState(currentSegment.id, 'playing');
      retryContinuationRef.current = false;
      setResumePromptVisible(false);
      
      if (viewRef.current?.tts) {
        viewRef.current.tts.setMark?.('0');
      }

      void preloadNext();
      
      return true;
    }

    updateQueueSegmentState(currentSegment.id, 'failed');
    logTTS('segment-failed', {
      segment: currentSegment.id,
      continuous: Boolean(isContinuous),
    });
    if (!isContinuous) {
      toast.error('当前片段朗读失败，已尝试重试和纯文本降级。');
    }
    return false;
  }, [
    attemptSpeakSegment,
    getRelevantQueueSSMLs,
    isSpeakableSSML,
    logTTS,
    preloadNext,
    rebuildSpeechQueue,
    updateQueueSegmentState,
    viewRef,
  ]);

  const getNextAndSpeak = useCallback(async (): Promise<boolean> => {
    if (!viewRef.current) {
      return false;
    }

    const view = viewRef.current;
    
    clearReaderHighlight();
    
    let inited = await ensureTTS();
    if (!inited) return false;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      let ssml = view.tts?.next?.();
      
      if (!ssml) {
        try {
          await view.next?.();
          await new Promise(r => setTimeout(r, 500));

          inited = await ensureTTS();
          if (inited) {
            ssml = view.tts?.start?.();
          }
        } catch (err) {
          console.error('Failed to navigate to next page:', err);
          return false;
        }
      }

      if (!ssml) {
        return false;
      }

      if (!isSpeakableSSML(ssml)) {
        logTTS('skip-noise-segment', { direction: 'next' });
        continue;
      }

      const success = await speakSSML(ssml, true);
      if (success) {
        return true;
      }

      logTTS('skip-failed-segment', { direction: 'next', attempt });
    }

    return false;
  }, [viewRef, ensureTTS, speakSSML, clearReaderHighlight, isSpeakableSSML, logTTS]);

  const getPrevAndSpeak = useCallback(async (): Promise<boolean> => {
    if (!viewRef.current) return false;

    const view = viewRef.current;
    
    clearReaderHighlight();
    
    let inited = await ensureTTS();
    if (!inited) return false;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      let ssml = view.tts?.prev?.();
      
      if (!ssml) {
        try {
          await view.prev?.();
          await new Promise(r => setTimeout(r, 500));

          inited = await ensureTTS();
          if (inited) {
            ssml = view.tts?.start?.();
          }
        } catch (err) {
          console.error('Failed to navigate to prev page:', err);
          return false;
        }
      }

      if (!ssml) return false;

      if (!isSpeakableSSML(ssml)) {
        logTTS('skip-noise-segment', { direction: 'prev' });
        continue;
      }

      const success = await speakSSML(ssml, true);
      if (success) {
        return true;
      }

      logTTS('skip-failed-segment', { direction: 'prev', attempt });
    }

    return false;
  }, [viewRef, ensureTTS, speakSSML, clearReaderHighlight, isSpeakableSSML, logTTS]);

  const start = useCallback(async () => {
    if (state === 'playing') {
      ttsInstance.current.pause();
      shouldResumeOnForegroundRef.current = true;
      setResumePromptVisible(false);
      return;
    }

    if (state === 'paused') {
      try {
        await ttsInstance.current.resume();
        shouldResumeOnForegroundRef.current = true;
        setResumePromptVisible(false);
        dismissResumePrompt();
        logTTS('manual-resume-success');
        syncHighlightAfterResume();
        await requestWakeLock();
      } catch (err) {
        console.error('Failed to resume TTS:', err);
        logTTS('manual-resume-failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
        setResumePromptMessage(
          isLikelyIOSRef.current
            ? 'iPhone 或 iPad 需要轻触一次继续朗读。'
            : '朗读恢复失败，请再点一次继续。'
        );
        setResumePromptVisible(true);
      }
      return;
    }

    if (!viewRef.current) return;

    const savedSession = loadTTSSession();
    if (savedSession?.cfi && viewRef.current.goTo) {
      try {
        await viewRef.current.goTo(savedSession.cfi);
        await new Promise((resolve) => window.setTimeout(resolve, 160));
      } catch (err) {
        logTTS('restore-session-failed', {
          message: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    clearReaderHighlight();

    const inited = await ensureTTS();
    if (!inited) return;

    const currentRange = viewRef.current.lastLocation?.range;
    let ssml: string | null | undefined;

    if (currentRange) {
      try {
        ssml = viewRef.current.tts?.from?.(currentRange);
      } catch {
        ssml = viewRef.current.tts?.start?.();
      }
    }

    if (!ssml) {
      ssml = viewRef.current.tts?.start?.();
    }

    if (!ssml) return;

    const success = isSpeakableSSML(ssml)
      ? await speakSSML(ssml)
      : await getNextAndSpeak();
    if (success) {
      isPlayingRef.current = true;
      shouldResumeOnForegroundRef.current = true;
      setResumePromptVisible(false);
      dismissResumePrompt();
      await requestWakeLock();
    }
  }, [
    clearReaderHighlight,
    dismissResumePrompt,
    ensureTTS,
    loadTTSSession,
    logTTS,
    getNextAndSpeak,
    isSpeakableSSML,
    requestWakeLock,
    speakSSML,
    state,
    syncHighlightAfterResume,
    viewRef,
  ]);

  const stop = useCallback(() => {
    shouldResumeOnForegroundRef.current = false;
    retryContinuationRef.current = false;
    clearTTSSession();
    setResumePromptVisible(false);
    dismissResumePrompt();
    ttsInstance.current.stop();
    isPlayingRef.current = false;
    setCurrentMark(null);
    setMarkIndex(0);
    queueRef.current = [];
    activeSegmentIdRef.current = null;

    // 清除预加载的音频
    ttsInstance.current.clearPreload();

    clearReaderHighlight();

    if (viewRef.current?.tts) {
      viewRef.current.tts = undefined;
    }

    releaseWakeLock();
  }, [viewRef, releaseWakeLock, clearReaderHighlight, dismissResumePrompt, clearTTSSession]);

  const next = useCallback(async () => {
    queueRef.current = [];
    activeSegmentIdRef.current = null;
    ttsInstance.current.clearPreloadQueueOnly();
    ttsInstance.current.stop();
    const success = await getNextAndSpeak();
    if (success) {
      isPlayingRef.current = true;
    } else {
      stop();
    }
  }, [getNextAndSpeak, stop]);

  const prev = useCallback(async () => {
    queueRef.current = [];
    activeSegmentIdRef.current = null;
    ttsInstance.current.clearPreloadQueueOnly();
    ttsInstance.current.stop();
    const success = await getPrevAndSpeak();
    if (success) {
      isPlayingRef.current = true;
    }
  }, [getPrevAndSpeak]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  useEffect(() => {
    prevRef.current = prev;
  }, [prev]);

  useEffect(() => {
    getNextAndSpeakRef.current = getNextAndSpeak;
  }, [getNextAndSpeak]);

  useTTSMediaSession({
    viewRef,
    state,
    currentMark,
    normalizeMetadataText,
    onPause: () => {
      ttsInstance.current.pause();
    },
    startRef,
    stopRef,
    nextRef,
    prevRef,
  });

  const attemptResumeAfterInterruption = useCallback(async () => {
    if (resumeInFlightRef.current) return;
    if (!shouldResumeOnForegroundRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }

    const currentState = stateRef.current;
    if (currentState !== 'paused' && currentState !== 'playing') return;

    resumeInFlightRef.current = true;
    logTTS('resume-attempt', {
      state: currentState,
      source: 'foreground',
      visible: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    });
    try {
      if (currentState === 'paused') {
        await ttsInstance.current.resume();
      }
      if (stateRef.current !== 'stopped') {
        await requestWakeLock();
      }
      setResumePromptVisible(false);
      dismissResumePrompt();
      logTTS('resume-success', {
        state: stateRef.current,
      });
      syncHighlightAfterResume();
    } catch (err) {
      console.warn('Unable to resume TTS after interruption:', err);
      logTTS('resume-failed', {
        state: currentState,
        message: err instanceof Error ? err.message : 'unknown',
        ios: isLikelyIOSRef.current,
      });
      setResumePromptMessage(
        isLikelyIOSRef.current
          ? '朗读已暂停。轻触页面任意位置后，点击“继续朗读”即可恢复。'
          : '朗读被系统中断，请点击继续朗读。'
      );
      setResumePromptVisible(true);
    } finally {
      window.setTimeout(() => {
        resumeInFlightRef.current = false;
      }, 400);
    }
  }, [dismissResumePrompt, logTTS, requestWakeLock, syncHighlightAfterResume]);

  useTTSResumePrompt({
    resumePromptVisible,
    resumePromptMessage,
    isLikelyIOS: isLikelyIOSRef.current,
    shouldResumeOnForegroundRef,
    onResumeAttempt: () => {
      void attemptResumeAfterInterruption();
    },
  });

  useEffect(() => {
    ttsInstance.current.onStateChangeCallback((newState) => {
      setState(newState);
      stateRef.current = newState;
      logTTS('state-change', { state: newState });
      if (newState === 'playing') {
        shouldResumeOnForegroundRef.current = true;
        setResumePromptVisible(false);
        dismissResumePrompt();
        saveTTSSession();
      }
      if (newState === 'paused') {
        saveTTSSession();
        releaseWakeLock();
      }
      if (newState === 'stopped') {
        shouldResumeOnForegroundRef.current = false;
        setResumePromptVisible(false);
      }
    });
    ttsInstance.current.onMarkChangeCallback((mark, index) => {
      setCurrentMark(mark);
      setMarkIndex(index);
      currentMarkRef.current = mark;
      saveTTSSession();
      if (mark.range && onHighlight) {
        onHighlight(mark.range);
      }
    });
    ttsInstance.current.onEndCallback(async () => {
      if (!isPlayingRef.current) return;

      const success = await getNextAndSpeakRef.current();
      if (!success && !retryContinuationRef.current) {
        logTTS('continuation-retry');
        retryContinuationRef.current = true;
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        const retrySuccess = await getNextAndSpeakRef.current();
        if (retrySuccess) {
          retryContinuationRef.current = false;
          return;
        }
      }
      if (!success) {
        clearReaderHighlight();
        setState('stopped');
        stateRef.current = 'stopped';
        isPlayingRef.current = false;
        shouldResumeOnForegroundRef.current = false;
        clearTTSSession();
        releaseWakeLock();
      }
      retryContinuationRef.current = false;
    });
    ttsInstance.current.onTimeUpdateCallback((currentTime, duration) => {
      if (viewRef.current?.tts && duration > 0) {
        const wordCount = viewRef.current.tts.getWordCount?.() || 0;
        if (wordCount > 0) {
          const progress = currentTime / duration;
          const currentIndex = Math.min(
            Math.floor(progress * wordCount),
            wordCount - 1
          );
          const markName = currentIndex.toString();
          viewRef.current.tts.setMark?.(markName);
        }
      }
    });
  }, [
    clearReaderHighlight,
    clearTTSSession,
    dismissResumePrompt,
    logTTS,
    onHighlight,
    releaseWakeLock,
    saveTTSSession,
    viewRef,
  ]);

  useTTSForegroundResume({
    stateRef,
    shouldResumeOnForegroundRef,
    logTTS,
    attemptResumeAfterInterruption: () => {
      void attemptResumeAfterInterruption();
    },
    releaseWakeLock,
  });

  useEffect(() => {
    const instance = ttsInstance.current;
    return () => {
      shouldResumeOnForegroundRef.current = false;
      isPlayingRef.current = false;
      instance.stop();
      clearReaderHighlight();
      void releaseWakeLock();
    };
  }, [releaseWakeLock, clearReaderHighlight]);

  return {
    state,
    settings,
    updateSettings,
    start,
    stop,
    next,
    prev,
    voices,
    voicesLoading,
    voicesError,
    reloadVoices: loadVoices,
    currentMark,
    markIndex,
    resumePromptVisible,
    resumePromptMessage,
    resume: start,
  };
}
