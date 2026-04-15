'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  backendTTS,
  TTSState,
  TTSSettings,
  TTSMark,
  loadTTSSettings,
  mergeVoicesWithFallback,
  Voice,
} from '@/lib/tts';
import { FoliateView } from '@/lib/types';
import { API_BASE, createAbortController } from '@/lib/config';

interface UseTTSOptions {
  viewRef: React.RefObject<FoliateView | null>;
  onHighlight?: (range: Range) => void;
}

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

const TTS_RESUME_TOAST_ID = 'tts-resume-hint';

export function useTTS({ viewRef, onHighlight }: UseTTSOptions) {
  const [state, setState] = useState<TTSState>('stopped');
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings);
  const [currentMark, setCurrentMark] = useState<TTSMark | null>(null);
  const [markIndex, setMarkIndex] = useState<number>(0);
  const [voices, setVoices] = useState<Voice[]>(() =>
    mergeVoicesWithFallback([], loadTTSSettings().voiceName)
  );
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [resumePromptVisible, setResumePromptVisible] = useState(false);
  const [resumePromptMessage, setResumePromptMessage] = useState('朗读被系统中断，轻触即可继续。');
  
  const ttsInstance = useRef(backendTTS);
  const isPlayingRef = useRef(false);
  const getNextAndSpeakRef = useRef<() => Promise<boolean>>(async () => false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const stateRef = useRef<TTSState>('stopped');
  const shouldResumeOnForegroundRef = useRef(false);
  const resumeInFlightRef = useRef(false);
  const retryContinuationRef = useRef(false);
  const isLikelyIOSRef = useRef(false);
  const currentMarkRef = useRef<TTSMark | null>(null);
  const hasShownResumeToastRef = useRef(false);
  const startRef = useRef<() => Promise<void>>(async () => {});
  const stopRef = useRef<() => void>(() => {});
  const nextRef = useRef<() => Promise<void>>(async () => {});
  const prevRef = useRef<() => Promise<void>>(async () => {});

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

  const loadVoices = useCallback(async () => {
    setVoicesLoading(true);
    setVoicesError(null);

    const token = localStorage.getItem('token');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { controller, timeoutId } = createAbortController(12000);

      try {
        const response = await fetch(`${API_BASE}/api/voices`, {
          headers: token ? { Authorization: token } : {},
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`voice_list_${response.status}`);
        }

        const data = await response.json();
        setVoices(mergeVoicesWithFallback(data || [], settings.voiceName));
        setVoicesError(null);
        setVoicesLoading(false);
        return;
      } catch (err) {
        const isLastAttempt = attempt === 2;
        if (isLastAttempt) {
          console.error('Failed to load voices:', err);
          setVoices((prev) => mergeVoicesWithFallback(prev, settings.voiceName));
          setVoicesError('声音列表加载失败，已切换到内置声线。');
        } else {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    setVoicesLoading(false);
  }, [settings.voiceName]);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  useEffect(() => {
    setVoices((prev) => mergeVoicesWithFallback(prev, settings.voiceName));
  }, [settings.voiceName]);

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

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (err) {
      console.warn('Wake Lock release failed:', err);
    }
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

  const buildSSML = useCallback((text: string): string => {
    const rateStr = settings.rate >= 0 ? `+${settings.rate}%` : `${settings.rate}%`;
    const styleAttr = settings.style ? ` style="${settings.style}"` : '';

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${settings.voiceName}"${styleAttr}>
    <prosody rate="${rateStr}">
      ${text}
    </prosody>
  </voice>
</speak>`;
  }, [settings]);

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

  const getTextFromSSML = useCallback((ssml: string): string => {
    return ssml
      .replace(/<\/?speak[^>]*>/gi, '')
      .replace(/<\/?mark[^>]*>/gi, '')
      .replace(/<\/?voice[^>]*>/gi, '')
      .replace(/<\/?prosody[^>]*>/gi, '')
      .replace(/<\/?emphasis[^>]*>/gi, '')
      .replace(/<\/?break[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .trim();
  }, []);

  // 获取后续多个段落的 SSML（不改变状态）
  const getNextSSMLs = useCallback((count: number): string[] => {
    if (!viewRef.current) return [];

    const view = viewRef.current;
    
    // 使用 peekNextMultiple 获取多个下一段，不改变当前位置
    const ssmlList = view.tts?.peekNextMultiple?.(count) ?? [];
    
    return ssmlList.filter((ssml: string) => ssml);
  }, [viewRef]);

  // 预加载后续段落
  const preloadNext = useCallback(async () => {
    if (!viewRef.current) return;
    
    if (state !== 'playing') return;
    
    try {
      const ssmlList = getNextSSMLs(3);
      
      const enhancedList = ssmlList.map(ssml => {
        const text = getTextFromSSML(ssml);
        return text ? buildSSML(text) : '';
      }).filter((ssml: string) => ssml);
      
      await ttsInstance.current.preloadMultiple(enhancedList);
    } catch (err) {
      console.error('Preload error:', err);
    }
  }, [viewRef, state, getNextSSMLs, getTextFromSSML, buildSSML]);

  useEffect(() => {
    ttsInstance.current.onPreloadTriggerCallback(() => {
      preloadNext();
    });
  }, [preloadNext]);

  const speakSSML = useCallback(async (ssml: string | null | undefined, isContinuous?: boolean): Promise<boolean> => {
    if (!ssml) return false;
    
    const text = getTextFromSSML(ssml);
    if (!text) return false;

    const enhancedSSML = buildSSML(text);
    
    // 清理不相关的预加载
    const nextSSMLs = getNextSSMLs(3).map(s => {
      const t = getTextFromSSML(s);
      return t ? buildSSML(t) : '';
    }).filter(s => s);
    
    ttsInstance.current.cleanupIrrelevantPreloads([enhancedSSML, ...nextSSMLs]);
    
    try {
      await ttsInstance.current.speak(enhancedSSML, undefined, isContinuous);
      retryContinuationRef.current = false;
      setResumePromptVisible(false);
      
      if (viewRef.current?.tts) {
        viewRef.current.tts.setMark?.('0');
      }

      void preloadNext();
      
      return true;
    } catch (err) {
      console.error('TTS speak error:', err);
      return false;
    }
  }, [getTextFromSSML, buildSSML, viewRef, getNextSSMLs, preloadNext]);

  const getNextAndSpeak = useCallback(async (): Promise<boolean> => {
    if (!viewRef.current) {
      return false;
    }

    const view = viewRef.current;
    
    clearReaderHighlight();
    
    let inited = await ensureTTS();
    if (!inited) return false;

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
    return speakSSML(ssml, true);
  }, [viewRef, ensureTTS, speakSSML, clearReaderHighlight]);

  const getPrevAndSpeak = useCallback(async (): Promise<boolean> => {
    if (!viewRef.current) return false;

    const view = viewRef.current;
    
    clearReaderHighlight();
    
    let inited = await ensureTTS();
    if (!inited) return false;

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
    return speakSSML(ssml, true);
  }, [viewRef, ensureTTS, speakSSML, clearReaderHighlight]);

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
        toast.dismiss(TTS_RESUME_TOAST_ID);
        hasShownResumeToastRef.current = false;
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

    const success = await speakSSML(ssml);
    if (success) {
      isPlayingRef.current = true;
      shouldResumeOnForegroundRef.current = true;
      setResumePromptVisible(false);
      toast.dismiss(TTS_RESUME_TOAST_ID);
      hasShownResumeToastRef.current = false;
      await requestWakeLock();
    }
  }, [
    clearReaderHighlight,
    ensureTTS,
    logTTS,
    requestWakeLock,
    speakSSML,
    state,
    syncHighlightAfterResume,
    viewRef,
  ]);

  const stop = useCallback(() => {
    shouldResumeOnForegroundRef.current = false;
    retryContinuationRef.current = false;
    setResumePromptVisible(false);
    toast.dismiss(TTS_RESUME_TOAST_ID);
    hasShownResumeToastRef.current = false;
    ttsInstance.current.stop();
    isPlayingRef.current = false;
    setCurrentMark(null);
    setMarkIndex(0);

    // 清除预加载的音频
    ttsInstance.current.clearPreload();

    clearReaderHighlight();

    if (viewRef.current?.tts) {
      viewRef.current.tts = undefined;
    }

    releaseWakeLock();
  }, [viewRef, releaseWakeLock, clearReaderHighlight]);

  const next = useCallback(async () => {
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

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;
    const metadata = viewRef.current?.book?.metadata;
    const title =
      normalizeMetadataText(metadata?.title) ||
      currentMark?.text?.slice(0, 32) ||
      'Z Reader 朗读';
    const artist = normalizeMetadataText(metadata?.author) || 'Z Reader';

    if (typeof MediaMetadata !== 'undefined') {
      mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album: 'Z Reader',
      });
    }

    mediaSession.playbackState =
      state === 'playing' ? 'playing' : state === 'paused' ? 'paused' : 'none';

    const assignAction = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // 某些移动浏览器只支持部分 action，忽略不支持的即可
      }
    };

    assignAction('play', () => {
      void startRef.current();
    });
    assignAction('pause', () => {
      ttsInstance.current.pause();
    });
    assignAction('stop', () => {
      stopRef.current();
    });
    assignAction('previoustrack', () => {
      void prevRef.current();
    });
    assignAction('nexttrack', () => {
      void nextRef.current();
    });

    return () => {
      assignAction('play', null);
      assignAction('pause', null);
      assignAction('stop', null);
      assignAction('previoustrack', null);
      assignAction('nexttrack', null);
      mediaSession.playbackState = 'none';
    };
  }, [currentMark?.text, normalizeMetadataText, state, viewRef]);

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
      toast.dismiss(TTS_RESUME_TOAST_ID);
      hasShownResumeToastRef.current = false;
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
  }, [logTTS, requestWakeLock, syncHighlightAfterResume]);

  useEffect(() => {
    ttsInstance.current.onStateChangeCallback((newState) => {
      setState(newState);
      stateRef.current = newState;
      logTTS('state-change', { state: newState });
      if (newState === 'playing') {
        shouldResumeOnForegroundRef.current = true;
        setResumePromptVisible(false);
        toast.dismiss(TTS_RESUME_TOAST_ID);
        hasShownResumeToastRef.current = false;
      }
      if (newState === 'paused') {
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
  }, [clearReaderHighlight, logTTS, onHighlight, releaseWakeLock, viewRef]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      logTTS('visibility-change', {
        state: document.visibilityState,
        ttsState: stateRef.current,
      });
      if (document.visibilityState === 'visible') {
        void attemptResumeAfterInterruption();
        return;
      }

      if (stateRef.current === 'playing') {
        shouldResumeOnForegroundRef.current = true;
      }
      void releaseWakeLock();
    };

    const handleWindowFocus = () => {
      void attemptResumeAfterInterruption();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
    };
  }, [attemptResumeAfterInterruption, logTTS, releaseWakeLock]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleGestureResume = () => {
      if (!resumePromptVisible || !shouldResumeOnForegroundRef.current) return;
      void attemptResumeAfterInterruption();
    };

    document.addEventListener('touchend', handleGestureResume, { passive: true });
    document.addEventListener('pointerup', handleGestureResume, { passive: true });

    return () => {
      document.removeEventListener('touchend', handleGestureResume);
      document.removeEventListener('pointerup', handleGestureResume);
    };
  }, [attemptResumeAfterInterruption, logTTS, resumePromptVisible]);

  useEffect(() => {
    if (!resumePromptVisible) {
      toast.dismiss(TTS_RESUME_TOAST_ID);
      hasShownResumeToastRef.current = false;
      return;
    }

    if (hasShownResumeToastRef.current) return;

    toast.message(isLikelyIOSRef.current ? '轻触页面后可继续朗读' : '朗读已暂停，可一键恢复', {
      id: TTS_RESUME_TOAST_ID,
      description: resumePromptMessage,
      duration: 3200,
    });
    hasShownResumeToastRef.current = true;
  }, [resumePromptMessage, resumePromptVisible]);

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
