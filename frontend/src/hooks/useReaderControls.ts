'use client';

import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAGING_CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'select',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[role~="button"], [role~="link"], [role~="slider"], [role~="spinbutton"]',
  '[role~="checkbox"], [role~="radio"], [role~="switch"], [role~="textbox"]',
  '[role~="combobox"], [role~="listbox"], [role~="option"], [role~="tab"]',
  '[role~="menuitem"], [role~="menuitemcheckbox"], [role~="menuitemradio"]',
  '[role~="dialog"], [role~="alertdialog"], [role~="toolbar"]',
  '[data-reader-interactive="true"]',
].join(', ');

const ACTIVE_OVERLAY_SELECTOR = [
  '[role="dialog"]:not([aria-hidden="true"]):not([hidden])',
  '[role="alertdialog"]:not([aria-hidden="true"]):not([hidden])',
  '[role="listbox"]:not([aria-hidden="true"]):not([hidden])',
].join(', ');

function hasActiveOverlay(doc: Document | null | undefined): boolean {
  if (!doc) return false;
  const overlays = doc.querySelectorAll<HTMLElement>(ACTIVE_OVERLAY_SELECTOR);
  for (const overlay of overlays) {
    if (overlay.getAttribute('aria-hidden') === 'true' || overlay.hidden) {
      continue;
    }
    if (overlay.closest('[aria-hidden="true"], [hidden], [data-hidden="true"]')) {
      continue;
    }
    return true;
  }
  return false;
}

interface UseReaderControlsOptions {
  pageRef: RefObject<HTMLDivElement | null>;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  onStopTTS?: () => void;
  overlayOpen?: boolean;
  shortcutsOpen?: boolean;
  onToggleShortcuts?: () => void;
  onCloseShortcuts?: () => void;
}

export function useReaderControls({
  pageRef,
  onPrev,
  onNext,
  onBack,
  onStopTTS,
  overlayOpen = false,
  shortcutsOpen = false,
  onToggleShortcuts,
  onCloseShortcuts,
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

  const boundDocsRef = useRef(new WeakSet<Document>());
  const prevRef = useRef(onPrev);
  const nextRef = useRef(onNext);
  const backRef = useRef(onBack);
  const stopTTSRef = useRef(onStopTTS);
  const overlayOpenRef = useRef(overlayOpen);
  const shortcutsOpenRef = useRef(shortcutsOpen);
  const toggleShortcutsRef = useRef(onToggleShortcuts);
  const closeShortcutsRef = useRef(onCloseShortcuts);

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
    overlayOpenRef.current = overlayOpen;
  }, [overlayOpen]);

  useEffect(() => {
    shortcutsOpenRef.current = shortcutsOpen;
  }, [shortcutsOpen]);

  useEffect(() => {
    toggleShortcutsRef.current = onToggleShortcuts;
  }, [onToggleShortcuts]);

  useEffect(() => {
    closeShortcutsRef.current = onCloseShortcuts;
  }, [onCloseShortcuts]);

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
    if (e.defaultPrevented || pageRef.current?.dataset.readerImageZoomOpen === 'true') {
      return;
    }

    const target = e.composedPath()[0];
    const targetWindow = (target as Node | undefined)?.ownerDocument?.defaultView;
    const element = targetWindow && target instanceof targetWindow.Element ? target : null;
    if (
      element?.matches('input, textarea') ||
      (element && 'isContentEditable' in element && element.isContentEditable)
    ) {
      return;
    }

    const isShortcutsToggleKey =
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      (e.key === '?' || (e.key === '/' && e.shiftKey));

    if (isShortcutsToggleKey && toggleShortcutsRef.current) {
      e.preventDefault();
      toggleShortcutsRef.current();
      return;
    }

    if (shortcutsOpenRef.current) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeShortcutsRef.current?.();
      }
      return;
    }

    const parentDoc =
      pageRef.current?.ownerDocument ??
      (typeof document !== 'undefined' ? document : null);
    if (overlayOpenRef.current || hasActiveOverlay(parentDoc)) {
      return;
    }

    const isPagingControl = Boolean(element?.closest(PAGING_CONTROL_SELECTOR));

    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
      case 'k':
      case 'K':
        if (!isPagingControl) prevRef.current();
        break;
      case 'ArrowRight':
      case 'PageDown':
      case 'j':
      case 'J':
      case ' ':
        if (isPagingControl) break;
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
    const boundDocs = boundDocsRef.current;
    boundDocs.add(doc);
    return () => {
      doc.removeEventListener('keydown', keyboardHandler);
      doc.removeEventListener('touchstart', handleTouchStart);
      doc.removeEventListener('touchend', handleTouchEnd);
      boundDocs.delete(doc);
    };
  }, [keyboardHandler, handleTouchStart, handleTouchEnd]);

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandler);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('keydown', keyboardHandler);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      stopTTSRef.current?.();
    };
  }, [keyboardHandler, handleTouchStart, handleTouchEnd]);

  return {
    isTouchReader,
    isFullscreenSupported,
    isFullscreen,
    toggleFullscreen,
    bindReaderDocument,
  };
}
