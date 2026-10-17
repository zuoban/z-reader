'use client';

import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { TTSMark, TTSState } from '@/lib/tts';
import type { FoliateView } from '@/lib/types';

interface UseTTSMediaSessionOptions {
  viewRef: RefObject<FoliateView | null>;
  state: TTSState;
  currentMark: TTSMark | null;
  normalizeMetadataText: (value: unknown) => string;
  onPause: () => void;
  startRef: MutableRefObject<() => Promise<void>>;
  stopRef: MutableRefObject<() => void>;
  nextRef: MutableRefObject<() => Promise<void>>;
  prevRef: MutableRefObject<() => Promise<void>>;
}

export function useTTSMediaSession({
  viewRef, state, currentMark, normalizeMetadataText, onPause,
  startRef, stopRef, nextRef, prevRef,
}: UseTTSMediaSessionOptions) {
  const previousMetadata = useRef('');

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const title = normalizeMetadataText(viewRef.current?.book?.metadata?.title) ||
      currentMark?.text?.slice(0, 32) || 'Z Reader 朗读';
    const artist = normalizeMetadataText(viewRef.current?.book?.metadata?.author) || 'Z Reader';
    const key = JSON.stringify([title, artist]);
    if (previousMetadata.current === key) return;
    previousMetadata.current = key;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: 'Z Reader' });
  }, [currentMark?.text, normalizeMetadataText, state, viewRef]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState =
      state === 'playing' ? 'playing' : state === 'paused' ? 'paused' : 'none';
  }, [state]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const assign = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { session.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
    };
    assign('play', () => { void startRef.current(); });
    assign('pause', onPause);
    assign('stop', () => { stopRef.current(); });
    assign('previoustrack', () => { void prevRef.current(); });
    assign('nexttrack', () => { void nextRef.current(); });
    return () => {
      for (const action of ['play', 'pause', 'stop', 'previoustrack', 'nexttrack'] as const) {
        assign(action, null);
      }
      session.playbackState = 'none';
    };
  }, [onPause, prevRef, nextRef, startRef, stopRef]);
}
