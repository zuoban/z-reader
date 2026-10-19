'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, createAbortController } from '@/lib/config';
import { getAuthHeaders, handleAuthResponse } from '@/lib/api';
import { mergeVoicesWithFallback, Voice } from '@/lib/tts';

export function useTTSVoices(preferredVoiceName: string, enabled = false) {
  const [voices, setVoices] = useState<Voice[]>(() =>
    mergeVoicesWithFallback([], preferredVoiceName)
  );
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const preferredVoiceRef = useRef(preferredVoiceName);
  const controllerRef = useRef<AbortController | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const loadVoices = useCallback(() => {
    if (loadPromiseRef.current) return loadPromiseRef.current;
    const promise = (async () => {
      setVoicesLoading(true);
      setVoicesError(null);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { controller, timeoutId } = createAbortController(12000);
        controllerRef.current = controller;

        try {
          const response = await fetch(`${API_BASE}/api/voices`, {
            headers: getAuthHeaders(),
            signal: controller.signal,
          });

          handleAuthResponse(response);
          if (!response.ok) {
            if (response.status === 401) {
              if (mountedRef.current) setVoicesLoading(false);
              return;
            }
            throw new Error(`voice_list_${response.status}`);
          }

          const data = await response.json();
          if (mountedRef.current) {
            setVoices(mergeVoicesWithFallback(data || [], preferredVoiceRef.current));
            setVoicesError(null);
            setVoicesLoading(false);
          }
          return;
        } catch (err) {
          if (!mountedRef.current) return;
          const isLastAttempt = attempt === 2;
          if (isLastAttempt) {
            if (process.env.NODE_ENV === 'development') console.error('Failed to load voices:', err);
            if (mountedRef.current) {
              setVoices((prev) => mergeVoicesWithFallback(prev, preferredVoiceRef.current));
              setVoicesError('声音列表加载失败，已切换到内置声线。');
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
            if (!mountedRef.current) return;
          }
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (mountedRef.current) setVoicesLoading(false);
    })().finally(() => {
      loadPromiseRef.current = null;
      controllerRef.current = null;
    });
    loadPromiseRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (enabled) void loadVoices();
  }, [enabled, loadVoices]);

  // When preferred voice changes, re-merge into existing voices.
  useEffect(() => {
    preferredVoiceRef.current = preferredVoiceName;
    queueMicrotask(() => {
      setVoices((prev) => mergeVoicesWithFallback(prev, preferredVoiceName));
    });
  }, [preferredVoiceName]);

  return {
    voices,
    voicesLoading,
    voicesError,
    loadVoices,
  };
}
