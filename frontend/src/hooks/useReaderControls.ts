'use client';

import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FoliateView } from '@/lib/types';

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

type SwipeView = Pick<FoliateView, 'renderer'>;

function paginatorHandlesSwipe(event: TouchEvent, chapterView?: SwipeView): boolean {
  const target = event.target as (Element & SwipeView) | null;
  const view = chapterView ?? (target?.localName === 'foliate-view' ? target : undefined);
  const renderer = view?.renderer;
  return renderer?.localName === 'foliate-paginator' && renderer.getAttribute('flow') !== 'scrolled';
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
  onOpenSearch?: () => void;
  onOpenTOC?: () => void;
  onOpenBookmarks?: () => void;
  onOpenThemeSettings?: () => void;
  onCyclePreset?: () => void;
  onStepFontSize?: (delta: -1 | 1) => void;
  onToggleChrome?: () => void;
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
  onOpenSearch,
  onOpenTOC,
  onOpenBookmarks,
  onOpenThemeSettings,
  onCyclePreset,
  onStepFontSize,
  onToggleChrome,
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
    return Boolean(document.fullscreenEnabled);
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const boundDocsRef = useRef(new WeakSet<Document>());
  const optionsRef = useRef({
    onPrev,
    onNext,
    onBack,
    onStopTTS,
    overlayOpen,
    shortcutsOpen,
    onToggleShortcuts,
    onCloseShortcuts,
    onOpenSearch,
    onOpenTOC,
    onOpenBookmarks,
    onOpenThemeSettings,
    onCyclePreset,
    onStepFontSize,
    onToggleChrome,
  });

  useEffect(() => {
    optionsRef.current = {
      onPrev,
      onNext,
      onBack,
      onStopTTS,
      overlayOpen,
      shortcutsOpen,
      onToggleShortcuts,
      onCloseShortcuts,
      onOpenSearch,
      onOpenTOC,
      onOpenBookmarks,
      onOpenThemeSettings,
      onCyclePreset,
      onStepFontSize,
      onToggleChrome,
    };
  }, [
    onBack,
    onCloseShortcuts,
    onCyclePreset,
    onNext,
    onOpenBookmarks,
    onOpenSearch,
    onOpenTOC,
    onOpenThemeSettings,
    onPrev,
    onStepFontSize,
    onStopTTS,
    onToggleChrome,
    onToggleShortcuts,
    overlayOpen,
    shortcutsOpen,
  ]);

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
    if (
      e.defaultPrevented ||
      e.isComposing ||
      pageRef.current?.dataset.readerImageZoomOpen === 'true'
    ) {
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

    const {
      onPrev,
      onNext,
      onBack,
      overlayOpen,
      shortcutsOpen,
      onToggleShortcuts,
      onCloseShortcuts,
      onOpenSearch,
      onOpenTOC,
      onOpenBookmarks,
      onOpenThemeSettings,
      onCyclePreset,
      onStepFontSize,
      onToggleChrome,
    } = optionsRef.current;

    const isSearchKey =
      (e.metaKey || e.ctrlKey) &&
      !e.altKey &&
      !e.shiftKey &&
      (e.key === 'f' || e.key === 'F');

    if (isSearchKey && onOpenSearch) {
      e.preventDefault();
      onOpenSearch();
      return;
    }

    const isShortcutsToggleKey =
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      (e.key === '?' || (e.key === '/' && e.shiftKey));

    if (shortcutsOpen) {
      if (isShortcutsToggleKey) {
        e.preventDefault();
        onToggleShortcuts?.();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCloseShortcuts?.();
      }
      return;
    }

    const parentDoc =
      pageRef.current?.ownerDocument ??
      (typeof document !== 'undefined' ? document : null);
    if (overlayOpen || hasActiveOverlay(parentDoc)) {
      return;
    }

    if (isShortcutsToggleKey && onToggleShortcuts) {
      e.preventDefault();
      onToggleShortcuts();
      return;
    }

    // Leave browser shortcuts (Cmd/Ctrl+F, Cmd/Ctrl+J/K, Alt+ArrowLeft, etc.) untouched.
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }

    const isPagingControl = Boolean(element?.closest(PAGING_CONTROL_SELECTOR));

    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
      case 'k':
      case 'K':
        if (!isPagingControl) onPrev();
        break;
      case 'ArrowRight':
      case 'PageDown':
      case 'j':
      case 'J':
      case ' ':
        if (isPagingControl) break;
        if (e.key === ' ' && e.shiftKey) {
          onPrev();
        } else {
          onNext();
        }
        break;
      case 'Escape':
        if (typeof document !== 'undefined' && document.fullscreenElement === pageRef.current) {
          void document.exitFullscreen()?.catch(() => {});
          break;
        }
        onBack();
        break;
      case 'f':
      case 'F':
        void toggleFullscreen();
        break;
      case 't':
      case 'T':
        if (!e.shiftKey && !isPagingControl && onOpenTOC) {
          e.preventDefault();
          onOpenTOC();
        }
        break;
      case 'b':
      case 'B':
        if (!e.shiftKey && !isPagingControl && onOpenBookmarks) {
          e.preventDefault();
          onOpenBookmarks();
        }
        break;
      case 's':
      case 'S':
        if (!e.shiftKey && !isPagingControl && onOpenThemeSettings) {
          e.preventDefault();
          onOpenThemeSettings();
        }
        break;
      case 'p':
      case 'P':
        if (!e.shiftKey && !isPagingControl && onCyclePreset) {
          e.preventDefault();
          onCyclePreset();
        }
        break;
      case 'h':
      case 'H':
        if (!e.shiftKey && !isPagingControl && onToggleChrome) {
          e.preventDefault();
          onToggleChrome();
        }
        break;
      case '[':
        if (!isPagingControl && onStepFontSize) {
          e.preventDefault();
          onStepFontSize(-1);
        }
        break;
      case ']':
        if (!isPagingControl && onStepFontSize) {
          e.preventDefault();
          onStepFontSize(1);
        }
        break;
    }
  }, [pageRef, toggleFullscreen]);

  const swipeStartRef = useRef<{
    source: EventTarget | null;
    identifier: number;
    x: number;
    y: number;
  } | null>(null);
  const swipeThreshold = 50; // pixels

  const handleTouchStart = useCallback((e: TouchEvent, chapterView?: SwipeView) => {
    if (e.touches.length !== 1 || paginatorHandlesSwipe(e, chapterView)) {
      swipeStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    swipeStartRef.current = {
      source: e.currentTarget, identifier: touch.identifier, x: touch.clientX, y: touch.clientY,
    };
  }, []);

  const clearSwipe = useCallback((source: EventTarget | null) => {
    if (swipeStartRef.current?.source === source) swipeStartRef.current = null;
  }, []);

  const handleTouchCancel = useCallback((e: TouchEvent) => clearSwipe(e.currentTarget), [clearSwipe]);

  const handleTouchEnd = useCallback((e: TouchEvent, chapterView?: SwipeView) => {
    const start = swipeStartRef.current;
    if (!start || start.source !== e.currentTarget) return;
    swipeStartRef.current = null;
    if (e.defaultPrevented || e.touches.length !== 0 || e.changedTouches.length !== 1 ||
        paginatorHandlesSwipe(e, chapterView)) return;
    const touch = e.changedTouches[0];
    if (touch.identifier !== start.identifier) return;

    // Check if the target is interactive (inputs, sliders, buttons, links, or marked elements)
    const target = e.target as HTMLElement | null;
    if (target) {
      const interactive = target.closest(
        'a, button, input, select, textarea, [role="button"], [data-reader-interactive="true"]'
      );
      if (interactive) return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    // Check if horizontal and exceeds threshold
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
      if (deltaX > 0) {
        optionsRef.current.onPrev(); // Swipe right -> Prev Page
      } else {
        optionsRef.current.onNext(); // Swipe left -> Next Page
      }
    }
  }, []);

  const bindReaderDocument = useCallback((doc: Document, chapterView?: SwipeView) => {
    if (boundDocsRef.current.has(doc)) return;

    const onTouchStart = (event: TouchEvent) => handleTouchStart(event, chapterView);
    const onTouchEnd = (event: TouchEvent) => handleTouchEnd(event, chapterView);
    doc.addEventListener('keydown', keyboardHandler);
    doc.addEventListener('touchstart', onTouchStart, { passive: true });
    doc.addEventListener('touchend', onTouchEnd, { passive: true });
    doc.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    const boundDocs = boundDocsRef.current;
    boundDocs.add(doc);
    return () => {
      doc.removeEventListener('keydown', keyboardHandler);
      doc.removeEventListener('touchstart', onTouchStart);
      doc.removeEventListener('touchend', onTouchEnd);
      doc.removeEventListener('touchcancel', handleTouchCancel);
      clearSwipe(doc);
      boundDocs.delete(doc);
    };
  }, [keyboardHandler, handleTouchStart, handleTouchEnd, handleTouchCancel, clearSwipe]);

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandler);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('keydown', keyboardHandler);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
      clearSwipe(window);
      optionsRef.current.onStopTTS?.();
    };
  }, [keyboardHandler, handleTouchStart, handleTouchEnd, handleTouchCancel, clearSwipe]);

  return {
    isTouchReader,
    isFullscreenSupported,
    isFullscreen,
    toggleFullscreen,
    bindReaderDocument,
  };
}
