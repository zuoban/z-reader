'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { backendTTS, TTSState, TTSSettings, TTSMark, loadTTSSettings, Voice } from '@/lib/tts';
import { FoliateView } from '@/lib/types';
import { API_BASE } from '@/lib/config';

interface UseTTSOptions {
  viewRef: React.RefObject<FoliateView | null>;
  onHighlight?: (range: Range) => void;
}

export function useTTS({ viewRef, onHighlight }: UseTTSOptions) {
  const [state, setState] = useState<TTSState>('stopped');
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings);
  const [currentMark, setCurrentMark] = useState<TTSMark | null>(null);
  const [markIndex, setMarkIndex] = useState<number>(0);
  const [voices, setVoices] = useState<Voice[]>([]);
  
  const ttsInstance = useRef(backendTTS);
  const isPlayingRef = useRef(false);
  const getNextAndSpeakRef = useRef<() => Promise<boolean>>(async () => false);

  useEffect(() => {
    const loadVoices = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/api/voices`, {
          headers: token ? { Authorization: token } : {},
        });
        if (response.ok) {
          const data = await response.json();
          setVoices(data || []);
        }
      } catch (err) {
        console.error('Failed to load voices:', err);
      }
    };

    loadVoices();
  }, []);

  const updateSettings = useCallback((newSettings: Partial<TTSSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      ttsInstance.current.setSettings(updated);
      return updated;
    });
  }, []);

  const handleHighlight = useCallback((range: Range) => {
    if (viewRef.current?.renderer) {
      viewRef.current.renderer.scrollToAnchor?.(range, true);
    }
    onHighlight?.(range);
  }, [viewRef, onHighlight]);

  const buildSSML = useCallback((text: string): string => {
    const rateStr = settings.rate >= 0 ? `+${settings.rate}%` : `${settings.rate}%`;
    const pitchStr = settings.pitch >= 0 ? `+${settings.pitch}%` : `${settings.pitch}%`;
    
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${settings.voiceName}">
    <prosody rate="${rateStr}" pitch="${pitchStr}">
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
    
    // 只有在播放状态才预加载
    if (state !== 'playing') return;
    
    try {
      // 获取后续3个段落的 SSML
      const ssmlList = getNextSSMLs(3);
      
      // 转换为增强 SSML 并预加载
      const enhancedList = ssmlList.map(ssml => {
        const text = getTextFromSSML(ssml);
        return text ? buildSSML(text) : '';
      }).filter((ssml: string) => ssml);
      
      // 批量预加载
      await ttsInstance.current.preloadMultiple(enhancedList);
    } catch (err) {
      console.error('Preload error:', err);
    }
  }, [viewRef, state, getNextSSMLs, getTextFromSSML, buildSSML]);

  const speakSSML = useCallback(async (ssml: string | null | undefined): Promise<boolean> => {
    if (!ssml) return false;
    
    const text = getTextFromSSML(ssml);
    if (!text) return false;

    const enhancedSSML = buildSSML(text);
    
    try {
      // 先预加载下一段（在播放前，避免影响高亮）
      // 使用 requestAnimationFrame 确保在当前帧完成后执行
      requestAnimationFrame(() => {
        preloadNext();
      });
      
      await ttsInstance.current.speak(enhancedSSML);
      
      if (viewRef.current?.tts) {
        viewRef.current.tts.setMark?.('0');
      }
      
      return true;
    } catch (err) {
      console.error('TTS speak error:', err);
      return false;
    }
  }, [getTextFromSSML, buildSSML, viewRef, preloadNext]);

  const getNextAndSpeak = useCallback(async (): Promise<boolean> => {
    if (!viewRef.current) {
      return false;
    }

    const view = viewRef.current;
    
    view.tts?.clearHighlight?.();
    
    let inited = await ensureTTS();
    if (!inited) return false;

    let ssml = view.tts?.next?.();
    
    if (!ssml) {
      try {
        await view.next?.();
        await new Promise(r => setTimeout(r, 500));
        
        inited = await ensureTTS();
        if (inited) {
          ssml = view.tts?.first?.();
        }
      } catch (err) {
        console.error('Failed to navigate to next page:', err);
        return false;
      }
    }

    if (!ssml) {
      return false;
    }
    return speakSSML(ssml);
  }, [viewRef, ensureTTS, speakSSML]);

  const getPrevAndSpeak = useCallback(async (): Promise<boolean> => {
    if (!viewRef.current) return false;

    const view = viewRef.current;
    
    view.tts?.clearHighlight?.();
    
    let inited = await ensureTTS();
    if (!inited) return false;

    let ssml = view.tts?.prev?.();
    
    if (!ssml) {
      try {
        await view.prev?.();
        await new Promise(r => setTimeout(r, 500));
        
        inited = await ensureTTS();
        if (inited) {
          ssml = view.tts?.first?.();
        }
      } catch (err) {
        console.error('Failed to navigate to prev page:', err);
        return false;
      }
    }

    if (!ssml) return false;
    return speakSSML(ssml);
  }, [viewRef, ensureTTS, speakSSML]);

  const start = useCallback(async () => {
    if (state === 'playing') {
      ttsInstance.current.pause();
      return;
    }

    if (state === 'paused') {
      ttsInstance.current.resume();
      return;
    }

    if (!viewRef.current) return;

    viewRef.current.tts?.clearHighlight?.();
    
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
    }
  }, [state, viewRef, ensureTTS, speakSSML]);

  const stop = useCallback(() => {
    ttsInstance.current.stop();
    isPlayingRef.current = false;
    setCurrentMark(null);
    setMarkIndex(0);
    
    // 清除预加载的音频
    ttsInstance.current.clearPreload();
    
    if (viewRef.current?.tts) {
      viewRef.current.tts.clearHighlight?.();
      viewRef.current.tts = undefined;
    }
  }, [viewRef]);

  const next = useCallback(async () => {
    ttsInstance.current.stop();
    const success = await getNextAndSpeak();
    if (success) {
      isPlayingRef.current = true;
    } else {
      stop();
    }
  }, [getNextAndSpeak, stop]);

  const prev = useCallback(async () => {
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
    ttsInstance.current.onStateChangeCallback(setState);
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
        setState('stopped');
        isPlayingRef.current = false;
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
  }, [onHighlight, viewRef]);

  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      ttsInstance.current.stop();
    };
  }, []);

  return {
    state,
    settings,
    updateSettings,
    start,
    stop,
    next,
    prev,
    voices,
    currentMark,
    markIndex,
  };
}