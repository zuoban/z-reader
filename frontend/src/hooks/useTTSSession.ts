'use client';

import { useCallback, type RefObject } from 'react';
import {
  TTS_SESSION_TTL,
  getTTSSessionKey,
  type TTSSessionSnapshot,
} from '@/lib/tts-helpers';
import type { TTSMark, TTSSettings } from '@/lib/tts';
import type { FoliateView } from '@/lib/types';

interface UseTTSSessionOptions {
  bookId?: string;
  viewRef: RefObject<FoliateView | null>;
  currentMarkRef: RefObject<TTSMark | null>;
  getSettings: () => TTSSettings;
}

export function useTTSSession({
  bookId,
  viewRef,
  currentMarkRef,
  getSettings,
}: UseTTSSessionOptions) {
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
      settings: getSettings(),
    };

    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
    } catch {
      // localStorage may be unavailable in private browsing or under quota pressure.
    }
  }, [bookId, currentMarkRef, getSettings, viewRef]);

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

  return {
    loadTTSSession,
    saveTTSSession,
    clearTTSSession,
  };
}
