"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ReaderChromeState {
  loading: boolean;
  tocOpen: boolean;
  themeSettingsOpen: boolean;
  currentChapter: string;
}

export function useReaderChrome() {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const stateRef = useRef<ReaderChromeState>({
    loading: true,
    tocOpen: false,
    themeSettingsOpen: false,
    currentChapter: "",
  });
  const tocListRef = useRef<HTMLDivElement>(null);
  const headerInteractionDocsRef = useRef<Set<Document>>(new Set());
  const locateFrameRef = useRef<number | null>(null);
  const showHeaderFrameRef = useRef<number | null>(null);

  const scrollToCurrentChapter = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const activeItem = tocListRef.current?.querySelector(
        '[data-current-chapter="true"]',
      );

      if (!(activeItem instanceof HTMLElement)) {
        return false;
      }

      activeItem.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior,
      });

      return true;
    },
    [],
  );

  const scheduleCurrentChapterScroll = useCallback(() => {
    if (locateFrameRef.current !== null) {
      window.cancelAnimationFrame(locateFrameRef.current);
    }

    locateFrameRef.current = window.requestAnimationFrame(() => {
      locateFrameRef.current = null;
      scrollToCurrentChapter("smooth");
    });
  }, [scrollToCurrentChapter]);

  const scheduleHeaderShow = useCallback(() => {
    if (showHeaderFrameRef.current !== null) {
      window.cancelAnimationFrame(showHeaderFrameRef.current);
    }

    showHeaderFrameRef.current = window.requestAnimationFrame(() => {
      showHeaderFrameRef.current = null;
      setIsHeaderVisible(true);
    });
  }, []);

  const syncChromeState = useCallback(
    (nextState: ReaderChromeState) => {
      const previous = stateRef.current;
      stateRef.current = nextState;

      if (
        nextState.tocOpen &&
        nextState.currentChapter &&
        (!previous.tocOpen ||
          previous.currentChapter !== nextState.currentChapter)
      ) {
        scheduleCurrentChapterScroll();
      }

      if (
        nextState.loading ||
        nextState.tocOpen ||
        nextState.themeSettingsOpen
      ) {
        scheduleHeaderShow();
      }
    },
    [scheduleCurrentChapterScroll, scheduleHeaderShow],
  );

  const handleReaderClick = useCallback((event: Event) => {
    const state = stateRef.current;
    if (state.loading || state.tocOpen || state.themeSettingsOpen) {
      return;
    }

    if (
      event.target instanceof Element &&
      event.target.closest('[data-reader-interactive="true"]')
    ) {
      return;
    }

    setIsHeaderVisible((visible) => !visible);
  }, []);

  const bindHeaderInteractionDocument = useCallback(
    (doc: Document) => {
      if (headerInteractionDocsRef.current.has(doc)) return;

      doc.addEventListener("click", handleReaderClick);
      headerInteractionDocsRef.current.add(doc);
    },
    [handleReaderClick],
  );

  const cleanupHeaderInteractionDocuments = useCallback(() => {
    headerInteractionDocsRef.current.forEach((doc) => {
      doc.removeEventListener("click", handleReaderClick);
    });
    headerInteractionDocsRef.current.clear();
  }, [handleReaderClick]);

  useEffect(() => {
    return () => {
      if (locateFrameRef.current !== null) {
        window.cancelAnimationFrame(locateFrameRef.current);
      }
      if (showHeaderFrameRef.current !== null) {
        window.cancelAnimationFrame(showHeaderFrameRef.current);
      }
      cleanupHeaderInteractionDocuments();
    };
  }, [cleanupHeaderInteractionDocuments]);

  return {
    isHeaderVisible,
    tocListRef,
    handleReaderClick,
    scrollToCurrentChapter,
    bindHeaderInteractionDocument,
    cleanupHeaderInteractionDocuments,
    syncChromeState,
  };
}
