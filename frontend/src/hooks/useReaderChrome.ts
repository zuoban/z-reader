"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ReaderChromeState {
  loading: boolean;
  tocOpen: boolean;
  bookmarksOpen: boolean;
  shortcutsOpen: boolean;
  themeSettingsOpen: boolean;
  currentChapter: string;
  currentChapterHref: string;
}

export function useReaderChrome() {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const stateRef = useRef<ReaderChromeState>({
    loading: true,
    tocOpen: false,
    bookmarksOpen: false,
    shortcutsOpen: false,
    themeSettingsOpen: false,
    currentChapter: "",
    currentChapterHref: "",
  });
  const tocListRef = useRef<HTMLDivElement>(null);
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

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      activeItem.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: prefersReducedMotion ? "auto" : behavior,
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
        (nextState.currentChapter || nextState.currentChapterHref) &&
        (!previous.tocOpen ||
          previous.currentChapter !== nextState.currentChapter ||
          previous.currentChapterHref !== nextState.currentChapterHref)
      ) {
        scheduleCurrentChapterScroll();
      }

      if (
        nextState.loading ||
        nextState.tocOpen ||
        nextState.bookmarksOpen ||
        nextState.shortcutsOpen ||
        nextState.themeSettingsOpen
      ) {
        scheduleHeaderShow();
      }
    },
    [scheduleCurrentChapterScroll, scheduleHeaderShow],
  );

  const showHeader = useCallback(() => {
    setIsHeaderVisible(true);
  }, []);

  const hideHeader = useCallback(() => {
    const state = stateRef.current;
    if (
      state.loading ||
      state.tocOpen ||
      state.bookmarksOpen ||
      state.shortcutsOpen ||
      state.themeSettingsOpen
    ) return;

    setIsHeaderVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (locateFrameRef.current !== null) {
        window.cancelAnimationFrame(locateFrameRef.current);
      }
      if (showHeaderFrameRef.current !== null) {
        window.cancelAnimationFrame(showHeaderFrameRef.current);
      }
    };
  }, []);

  return {
    isHeaderVisible,
    tocListRef,
    showHeader,
    hideHeader,
    scrollToCurrentChapter,
    syncChromeState,
  };
}
