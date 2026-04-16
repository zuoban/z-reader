'use client';

import type { MutableRefObject, RefObject } from 'react';
import { useEffect } from 'react';
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
  viewRef,
  state,
  currentMark,
  normalizeMetadataText,
  onPause,
  startRef,
  stopRef,
  nextRef,
  prevRef,
}: UseTTSMediaSessionOptions) {
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
        // Some browsers only support a subset of media session actions.
      }
    };

    assignAction('play', () => {
      void startRef.current();
    });
    assignAction('pause', onPause);
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
  }, [currentMark?.text, normalizeMetadataText, onPause, prevRef, nextRef, startRef, state, stopRef, viewRef]);
}
