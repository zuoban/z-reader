'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, createAbortController } from '@/lib/config';
import { getAuthHeaders, handleAuthResponse } from '@/lib/api';
import { mergeVoicesWithFallback, Voice } from '@/lib/tts';

export function useTTSVoices(preferredVoiceName: string) {
  const [voices, setVoices] = useState<Voice[]>(() =>
    mergeVoicesWithFallback([], preferredVoiceName)
  );
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  const loadVoices = useCallback(async () => {
    setVoicesLoading(true);
    setVoicesError(null);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { controller, timeoutId } = createAbortController(12000);

      try {
        const response = await fetch(`${API_BASE}/api/voices`, {
          headers: getAuthHeaders(),
          signal: controller.signal,
        });

        handleAuthResponse(response);
        if (!response.ok) {
          if (response.status === 401) {
            setVoicesLoading(false);
            return;
          }
          throw new Error(`voice_list_${response.status}`);
        }

        const data = await response.json();
        setVoices(mergeVoicesWithFallback(data || [], preferredVoiceName));
        setVoicesError(null);
        setVoicesLoading(false);
        return;
      } catch (err) {
        const isLastAttempt = attempt === 2;
        if (isLastAttempt) {
          console.error('Failed to load voices:', err);
          setVoices((prev) => mergeVoicesWithFallback(prev, preferredVoiceName));
          setVoicesError('声音列表加载失败，已切换到内置声线。');
        } else {
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    setVoicesLoading(false);
  }, [preferredVoiceName]);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  useEffect(() => {
    setVoices((prev) => mergeVoicesWithFallback(prev, preferredVoiceName));
  }, [preferredVoiceName]);

  return {
    voices,
    voicesLoading,
    voicesError,
    loadVoices,
  };
}
