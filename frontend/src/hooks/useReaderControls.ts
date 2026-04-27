'use client';

import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseReaderControlsOptions {
  pageRef: RefObject<HTMLDivElement | null>;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  onStopTTS?: () => void;
}

export function useReaderControls({
  pageRef,
  onPrev,
  onNext,
  onBack,
  onStopTTS,
}: UseReaderControlsOptions) {
  const [isTouchReader] = useState(() => {
    if (typeof window === 'undefined') return false;

    return (
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      'ontouchstart' in window
    );
  });
  const [isFullscreenSupported] = useState(() => {
    if (typeof document === 'undefined') return false;
    return typeof document.fullscreenEnabled === 'boolean';
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const boundDocsRef = useRef<Set<Document>>(new Set());
  const prevRef = useRef(onPrev);
  const nextRef = useRef(onNext);
  const backRef = useRef(onBack);
  const stopTTSRef = useRef(onStopTTS);

  useEffect(() => {
    prevRef.current = onPrev;
  }, [onPrev]);

  useEffect(() => {
    nextRef.current = onNext;
  }, [onNext]);

  useEffect(() => {
    backRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    stopTTSRef.current = onStopTTS;
  }, [onStopTTS]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(pageRef.current && document.fullscreenElement === pageRef.current));
    };

    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [pageRef]);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined' || !pageRef.current || !document.fullscreenEnabled) {
      return;
    }

    try {
      if (document.fullscreenElement === pageRef.current) {
        await document.exitFullscreen();
        return;
      }

      await pageRef.current.requestFullscreen();
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err);
    }
  }, [pageRef]);

  const keyboardHandler = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
      case 'k':
      case 'K':
        prevRef.current();
        break;
      case 'ArrowRight':
      case 'PageDown':
      case 'j':
      case 'J':
      case ' ':
        if (e.key === ' ' && e.shiftKey) {
          prevRef.current();
        } else {
          nextRef.current();
        }
        break;
      case 'Escape':
        if (typeof document !== 'undefined' && document.fullscreenElement === pageRef.current) {
          void document.exitFullscreen();
          break;
        }
        backRef.current();
        break;
      case 'f':
      case 'F':
        void toggleFullscreen();
        break;
    }
  }, [pageRef, toggleFullscreen]);

  const bindReaderDocument = useCallback((doc: Document) => {
    if (boundDocsRef.current.has(doc)) return;

    doc.addEventListener('keydown', keyboardHandler);
    boundDocsRef.current.add(doc);
  }, [keyboardHandler]);

  const cleanupBoundDocuments = useCallback(() => {
    boundDocsRef.current.forEach((doc) => {
      doc.removeEventListener('keydown', keyboardHandler);
    });
    boundDocsRef.current.clear();
  }, [keyboardHandler]);

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandler);

    return () => {
      window.removeEventListener('keydown', keyboardHandler);
      cleanupBoundDocuments();
      stopTTSRef.current?.();
    };
  }, [cleanupBoundDocuments, keyboardHandler]);

  return {
    isTouchReader,
    isFullscreenSupported,
    isFullscreen,
    toggleFullscreen,
    bindReaderDocument,
    cleanupBoundDocuments,
  };
}
