'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  
  const ttsInstance = useRef(backendTTS);
  const isPlayingRef = useRef(false);
  const getNextAndSpeakRef = useRef<() => Promise<boolean>>(async () => false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

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

  const handleHighlight = useCallback((range: Range) => {
    if (viewRef.current?.renderer) {
      viewRef.current.renderer.scrollToAnchor?.(range, true);
    }
    onHighlight?.(range);
  }, [viewRef, onHighlight]);

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
      
      if (viewRef.current?.tts) {
        viewRef.current.tts.setMark?.('0');
      }
      
      return true;
    } catch (err) {
      console.error('TTS speak error:', err);
      return false;
    }
  }, [getTextFromSSML, buildSSML, viewRef, getNextSSMLs]);

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
      return;
    }

    if (state === 'paused') {
      ttsInstance.current.resume();
      await requestWakeLock();
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
      await requestWakeLock();
    }
  }, [state, viewRef, ensureTTS, speakSSML, requestWakeLock, clearReaderHighlight]);

  const stop = useCallback(() => {
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
    getNextAndSpeakRef.current = getNextAndSpeak;
  }, [getNextAndSpeak]);

  useEffect(() => {
    ttsInstance.current.onStateChangeCallback((newState) => {
      setState(newState);
      if (newState === 'paused') {
        releaseWakeLock();
      }
    });
    ttsInstance.current.onMarkChangeCallback((mark, index) => {
      setCurrentMark(mark);
      setMarkIndex(index);
      if (mark.range && onHighlight) {
        onHighlight(mark.range);
      }
    });
    ttsInstance.current.onEndCallback(async () => {
      if (!isPlayingRef.current) return;

      const success = await getNextAndSpeakRef.current();
      if (!success) {
        clearReaderHighlight();
        setState('stopped');
        isPlayingRef.current = false;
        releaseWakeLock();
      }
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
  }, [onHighlight, viewRef, releaseWakeLock, clearReaderHighlight]);

  useEffect(() => {
    const instance = ttsInstance.current;
    return () => {
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
  };
}
