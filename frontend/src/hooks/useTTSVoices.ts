'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, createAbortController } from '@/lib/config';
import { handleAuthResponse } from '@/lib/api';
import { getAccessGeneration } from '@/lib/library-access';
import { mergeVoicesWithFallback } from '@/lib/tts';
import { waitForRetry } from '@/lib/tts-request';
import type { Voice } from '@/lib/tts';

export function useTTSVoices(preferredVoiceName: string, enabled = false) {
  const [voices, setVoices] = useState<Voice[]>(() =>
    mergeVoicesWithFallback([], preferredVoiceName)
  );
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const preferredVoiceRef = useRef(preferredVoiceName);
  const loadRef = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);

  const loadVoices = useCallback(() => {
    if (loadRef.current) return loadRef.current.promise;
    if (!mountedRef.current) return Promise.resolve();

    const lifetime = new AbortController();
    const { signal } = lifetime;
    const generation = getAccessGeneration();
    const isCurrent = () => !signal.aborted && generation === getAccessGeneration();
    const promise = (async () => {
      setVoicesLoading(true);
      setVoicesError(null);

      for (let attempt = 0; attempt < 3 && isCurrent(); attempt += 1) {
        const { controller, timeoutId } = createAbortController(12000);
        const abortAttempt = () => {
          clearTimeout(timeoutId);
          controller.abort();
        };
        signal.addEventListener('abort', abortAttempt, { once: true });

        try {
          const response = await fetch(`${API_BASE}/api/voices`, {
            credentials: 'include',
            signal: controller.signal,
          });

          if (!isCurrent()) return;
          handleAuthResponse(response, generation);
          if (response.status === 401) return;
          if (!response.ok) throw new Error(`voice_list_${response.status}`);

          const data = await response.json();
          if (isCurrent()) {
            setVoices(mergeVoicesWithFallback(data || [], preferredVoiceRef.current));
            setVoicesError(null);
          }
          return;
        } catch (err) {
          if (!isCurrent()) return;
          if (attempt === 2) {
            if (process.env.NODE_ENV === 'development') console.error('Failed to load voices:', err);
            setVoices((prev) => mergeVoicesWithFallback(prev, preferredVoiceRef.current));
            setVoicesError('声音列表加载失败，已切换到内置声线。');
            return;
          }
        } finally {
          clearTimeout(timeoutId);
          signal.removeEventListener('abort', abortAttempt);
        }

        await waitForRetry(600 * (attempt + 1), signal).catch(() => {});
      }
    })().finally(() => {
      if (loadRef.current?.controller === lifetime) {
        loadRef.current = null;
        setVoicesLoading(false);
      }
    });
    loadRef.current = { controller: lifetime, promise };
    return promise;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const load = loadRef.current;
      loadRef.current = null;
      load?.controller.abort();
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
