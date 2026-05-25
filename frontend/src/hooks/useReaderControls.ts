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
    if (pageRef.current?.dataset.readerImageZoomOpen === 'true') {
      return;
    }

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

  // Swipe gesture tracking
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const swipeThreshold = 50; // pixels

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (e.changedTouches.length !== 1) return;
    
    // Check if the target is interactive (inputs, sliders, buttons, links, or marked elements)
    const target = e.target as HTMLElement | null;
    if (target) {
      const interactive = target.closest(
        'a, button, input, select, textarea, [role="button"], [data-reader-interactive="true"]'
      );
      if (interactive) return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartXRef.current;
    const deltaY = touchEndY - touchStartYRef.current;

    // Check if horizontal and exceeds threshold
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
      if (deltaX > 0) {
        prevRef.current(); // Swipe right -> Prev Page
      } else {
        nextRef.current(); // Swipe left -> Next Page
      }
    }
  }, []);

  const bindReaderDocument = useCallback((doc: Document) => {
    if (boundDocsRef.current.has(doc)) return;

    doc.addEventListener('keydown', keyboardHandler);
    doc.addEventListener('touchstart', handleTouchStart, { passive: true });
    doc.addEventListener('touchend', handleTouchEnd, { passive: true });
    boundDocsRef.current.add(doc);
  }, [keyboardHandler, handleTouchStart, handleTouchEnd]);

  const cleanupBoundDocuments = useCallback(() => {
    boundDocsRef.current.forEach((doc) => {
      doc.removeEventListener('keydown', keyboardHandler);
      doc.removeEventListener('touchstart', handleTouchStart);
      doc.removeEventListener('touchend', handleTouchEnd);
    });
    boundDocsRef.current.clear();
  }, [keyboardHandler, handleTouchStart, handleTouchEnd]);

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandler);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('keydown', keyboardHandler);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      cleanupBoundDocuments();
      stopTTSRef.current?.();
    };
  }, [cleanupBoundDocuments, keyboardHandler, handleTouchStart, handleTouchEnd]);

  return {
    isTouchReader,
    isFullscreenSupported,
    isFullscreen,
    toggleFullscreen,
    bindReaderDocument,
    cleanupBoundDocuments,
  };
}
