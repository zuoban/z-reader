'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  TTS_SESSION_TTL,
  getTTSSessionKey,
  type TTSSessionSnapshot,
} from '@/lib/tts-helpers';
import { accessStorageKey, getAccessGeneration } from '@/lib/library-access';
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
  const [generation] = useState(getAccessGeneration);
  const legacyKey = getTTSSessionKey(bookId);
  const key = legacyKey ? accessStorageKey(legacyKey, generation) : null;
  const pendingRef = useRef<{ key: string; snapshot: TTSSessionSnapshot } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWriteRef = useRef<number | null>(null);
  const writePending = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || generation !== getAccessGeneration()) return;
    try {
      localStorage.setItem(pending.key, JSON.stringify(pending.snapshot));
      lastWriteRef.current = Date.now();
    } catch {
      // Storage availability must never interrupt narration.
    }
  }, [generation]);
  useEffect(() => () => writePending(), [bookId, writePending]);
  const loadTTSSession = useCallback((): TTSSessionSnapshot | null => {
    if (!key || generation !== getAccessGeneration()) return null;

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
  }, [generation, key]);

  const saveTTSSession = useCallback((flush = false) => {
    if (generation !== getAccessGeneration()) return;
    const cfi = currentMarkRef.current?.cfi || viewRef.current?.lastLocation?.cfi;
    if (!key || !cfi) return;

    const mark = currentMarkRef.current;
    const snapshot: TTSSessionSnapshot = {
      cfi,
      markName: mark?.name,
      markText: mark?.text,
      timestamp: Date.now(),
      settings: getSettings(),
    };

    pendingRef.current = { key, snapshot };
    const elapsed = lastWriteRef.current === null ? Infinity : Date.now() - lastWriteRef.current;
    if (flush || elapsed >= 2000) {
      writePending();
    } else if (timerRef.current === null) {
      timerRef.current = setTimeout(writePending, 2000 - elapsed);
    }
  }, [currentMarkRef, generation, getSettings, key, viewRef, writePending]);

  const flushTTSSession = useCallback(() => saveTTSSession(true), [saveTTSSession]);

  const clearTTSSession = useCallback(() => {
    if (generation !== getAccessGeneration()) return;
    if (!key) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    lastWriteRef.current = null;

    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  }, [generation, key]);

  return {
    loadTTSSession,
    saveTTSSession,
    flushTTSSession,
    clearTTSSession,
  };
}
