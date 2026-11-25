"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FoliateView, type TOCItem } from "@/lib/types";
import { getOfflineLibrary } from "@/lib/library-access";
import { ensureFoliateScript } from "@/lib/foliate-loader";
import {
  loadBookFile,
  openFoliateBook,
  openInitialLocation,
} from "./foliate/bookLoader";
import {
  createAppliedStyleCache,
  resetAppliedStyleCache,
  syncRendererInlineOverrides,
  syncRendererPreferences,
  syncRendererStylesheet,
} from "./foliate/rendererStyles";
import {
  getReaderCompatibilityError,
  shouldUseReaderCompatibilityMode,
  waitForNonZeroRect,
  waitUntil,
} from "./foliate/runtime";
import {
  clearFoliateSearch,
  MAX_BOOK_SEARCH_RESULTS,
  searchFoliateView,
} from "./foliate/search";
import type {
  BookSearchCallbacks,
  BookSearchExcerpt,
  BookSearchOutcome,
  BookSearchResultItem,
  SearchableFoliateView,
  UseFoliateViewOptions,
} from "./foliate/types";
import { bindFoliateViewEvents, mountFoliateView } from "./foliate/viewEvents";

export {
  MAX_BOOK_SEARCH_RESULTS,
  type BookSearchCallbacks,
  type BookSearchExcerpt,
  type BookSearchOutcome,
  type BookSearchResultItem,
};

export function useFoliateView({
  bookId,
  containerRef,
  viewRef,
  isAuthenticated,
  canLoadOffline = false,
  progressLoading,
  progress,
  theme,
  getStylesheet,
  updateProgress,
  bindReaderDocument,
  onImageOpen,
}: UseFoliateViewOptions) {
  const canLoad = isAuthenticated || canLoadOffline;
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [percentage, setPercentage] = useState(progress?.percentage || 0);
  const [currentCFI, setCurrentCFI] = useState(progress?.cfi || "");
  const [currentChapter, setCurrentChapter] = useState("");
  const [currentChapterHref, setCurrentChapterHref] = useState("");
  const [currentPageLabel, setCurrentPageLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readerReady, setReaderReady] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("准备阅读环境…");
  const [loadingDetail, setLoadingDetail] = useState("正在并行加载引擎与书籍");

  const [library] = useState(getOfflineLibrary);
  const readerControllerRef = useRef<AbortController | null>(null);
  const openingViewsRef = useRef(new WeakSet<FoliateView>());
  const loadedBookFileRef = useRef<{ bookId: string; file: File | Blob } | null>(null);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const fallbackTitleRef = useRef("");
  const fallbackAuthorRef = useRef("");
  const progressRef = useRef(progress);
  const progressLoadingRef = useRef(progressLoading);
  const themeRef = useRef(theme);
  const getStylesheetRef = useRef(getStylesheet);
  const updateProgressRef = useRef(updateProgress);
  const onImageOpenRef = useRef(onImageOpen);
  const appliedRemoteProgressRef = useRef<string | null>(null);
  const chapterCleanupsRef = useRef<Map<Document, () => void>>(new Map());
  const compatibilityModeRef = useRef(false);
  const styleCacheRef = useRef(createAppliedStyleCache());

  useEffect(() => {
    if (currentCFI || !progress?.cfi) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCurrentCFI(progress.cfi);
      setPercentage(progress.percentage);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId, progress, currentCFI]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    progressRef.current = progress;
    progressLoadingRef.current = progressLoading;
    themeRef.current = theme;
    getStylesheetRef.current = getStylesheet;
    updateProgressRef.current = updateProgress;
    onImageOpenRef.current = onImageOpen;
  }, [
    getStylesheet,
    isAuthenticated,
    onImageOpen,
    progress,
    progressLoading,
    theme,
    updateProgress,
  ]);

  const cleanupReader = useCallback(() => {
    const controller = readerControllerRef.current;
    readerControllerRef.current = null;
    controller?.abort();
    chapterCleanupsRef.current.forEach((cleanup) => cleanup());
    chapterCleanupsRef.current.clear();

    const view = viewRef.current;
    viewRef.current = null;
    loadedBookFileRef.current = null;
    resetAppliedStyleCache(styleCacheRef.current);

    if (view) {
      try {
        if (!openingViewsRef.current.has(view)) view.close?.();
      } catch (err) {
        console.error("Failed to cleanup reader view:", err);
      } finally {
        view.parentNode?.removeChild(view as unknown as Node);
      }
    }
  }, [viewRef]);

  const initReader = useCallback(
    async (signal: AbortSignal) => {
      const cancelled = () => signal.aborted || library !== getOfflineLibrary();
      if (!containerRef.current || cancelled()) return;

      try {
        const compatibilityError = getReaderCompatibilityError();
        if (compatibilityError) {
          throw new Error(compatibilityError);
        }

        compatibilityModeRef.current = shouldUseReaderCompatibilityMode();
        setLoadingMsg(
          compatibilityModeRef.current ? "加载兼容阅读模式…" : "加载阅读器引擎…",
        );
        setLoadingDetail("引擎、书籍与阅读进度并行准备");

        // Download the file alongside the engine, before waiting for progress.
        const filePromise = loadBookFile({
          bookId,
          library,
          isAuthenticated: isAuthenticatedRef.current,
          signal,
          onOfflineMetadata: ({ title, author }) => {
            fallbackTitleRef.current = title;
            fallbackAuthorRef.current = author;
            if (title) setBookTitle((prev) => prev || title);
            if (author) setBookAuthor((prev) => prev || author);
          },
          onDownloadProgress: (message, detail) => {
            setLoadingMsg(message);
            setLoadingDetail(detail);
          },
        });
        void filePromise.catch(() => {
          // Initialization reports any download error when it awaits the file.
        });
        await ensureFoliateScript();

        if (cancelled() || !containerRef.current) return;
        setLoadingMsg("创建视图…");
        setLoadingDetail("正在挂载阅读画布");

        const view = mountFoliateView(containerRef.current);
        viewRef.current = view;
        await waitForNonZeroRect(view as unknown as HTMLElement, signal);
        if (cancelled()) return;

        let loadedSections: Set<number> | null = new Set();
        bindFoliateViewEvents({
          view,
          signal,
          isCancelled: cancelled,
          isCurrentView: () => viewRef.current === view,
          getLoadedSections: () => loadedSections,
          chapterCleanups: chapterCleanupsRef.current,
          bindReaderDocument,
          getOnImageOpen: () => onImageOpenRef.current,
          getThemePreset: () => themeRef.current.preset,
          getFallbackMetadata: () => ({
            title: fallbackTitleRef.current,
            author: fallbackAuthorRef.current,
          }),
          onMetadata: ({ toc: nextToc, title, author }) => {
            setToc(nextToc);
            setBookTitle(title);
            setBookAuthor(author);
          },
          onInlinePresetApplied: (preset) => {
            styleCacheRef.current.inlinePreset = { view, preset };
          },
          onRelocate: ({ percentage: pct, cfi, chapter, chapterHref, pageLabel }) => {
            setPercentage(pct);
            if (cfi) {
              setCurrentCFI(cfi);
              updateProgressRef.current(cfi, pct);
            }
            if (chapter) {
              setCurrentChapter(chapter);
              setCurrentChapterHref(chapterHref ?? "");
            }
            setCurrentPageLabel(pageLabel);
          },
        });

        if (cancelled()) return;
        setLoadingMsg("获取书籍…");
        setLoadingDetail("等待预取完成（通常已在后台进行）");

        const file = await filePromise;
        if (cancelled()) return;
        loadedBookFileRef.current = { bookId, file };

        // Soft-wait for progress so we open near the last location without blocking
        // cold starts when the progress API is slow.
        if (progressLoadingRef.current) {
          setLoadingDetail("同步阅读进度（最多约 0.4 秒）");
          await waitUntil(() => cancelled() || !progressLoadingRef.current, 400);
        }

        if (cancelled()) return;
        setLoadingMsg("打开书籍…");
        setLoadingDetail("解析章节并定位阅读位置");

        await openFoliateBook({
          view,
          file,
          signal,
          isCancelled: cancelled,
          openingViews: openingViewsRef.current,
        });

        if (cancelled()) return;

        syncRendererStylesheet(view, getStylesheetRef.current(), styleCacheRef.current);
        syncRendererPreferences(
          view,
          themeRef.current,
          compatibilityModeRef.current,
          styleCacheRef.current,
        );

        const savedProgress = progressRef.current;
        appliedRemoteProgressRef.current = savedProgress?.updated_at ?? null;

        await openInitialLocation({
          view,
          savedCFI: savedProgress?.cfi,
          loadedSections,
          signal,
          isCancelled: cancelled,
        });

        if (cancelled()) return;
        loadedSections = null;
        setReaderReady(true);
        setLoading(false);
      } catch (err) {
        if (!cancelled()) {
          cleanupReader();
          setReaderReady(false);
          setError(err instanceof Error ? err.message : "加载书籍失败");
          setLoading(false);
        }
      }
    },
    [bindReaderDocument, bookId, cleanupReader, containerRef, library, viewRef],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !readerReady) return;
    syncRendererStylesheet(view, getStylesheet(), styleCacheRef.current);
    syncRendererPreferences(
      view,
      theme,
      compatibilityModeRef.current,
      styleCacheRef.current,
    );
  }, [getStylesheet, readerReady, theme, viewRef]);

  useEffect(() => {
    if (!readerReady || !progress?.remote || !progress.updated_at || !progress.cfi) {
      return;
    }
    if (appliedRemoteProgressRef.current === progress.updated_at) return;

    appliedRemoteProgressRef.current = progress.updated_at;
    void viewRef.current?.goTo?.(progress.cfi);
  }, [progress, readerReady, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!readerReady || !view) return;
    syncRendererInlineOverrides(view, theme.preset, styleCacheRef.current);
  }, [readerReady, theme.preset, viewRef]);

  useEffect(() => {
    if (!bookId) return;
    void ensureFoliateScript().catch(() => {
      // initReader will retry and surface any script-loading error once auth/offline completes.
    });
  }, [bookId]);

  useEffect(() => {
    // Start as soon as auth or offline copy is ready — do not wait for progress API.
    if (!canLoad || !bookId) return;

    const controller = new AbortController();
    readerControllerRef.current = controller;
    fallbackTitleRef.current = "";
    fallbackAuthorRef.current = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset UI for the external book load.
    setLoading(true);
    setReaderReady(false);
    setError(null);
    setLoadingMsg("准备阅读环境…");
    setLoadingDetail("引擎、书籍与进度并行加载");
    queueMicrotask(() => {
      if (!controller.signal.aborted) void initReader(controller.signal);
    });

    return () => {
      if (readerControllerRef.current === controller) cleanupReader();
    };
  }, [cleanupReader, initReader, canLoad, bookId]);

  const getLoadedBookFile = useCallback(
    () =>
      loadedBookFileRef.current?.bookId === bookId
        ? loadedBookFileRef.current.file
        : null,
    [bookId],
  );

  const searchBook = useCallback(
    (
      query: string,
      callbacks?: BookSearchCallbacks,
      signal?: AbortSignal,
    ): Promise<BookSearchOutcome> =>
      searchFoliateView(
        viewRef.current as SearchableFoliateView | null,
        query,
        callbacks,
        signal,
      ),
    [viewRef],
  );

  const clearSearch = useCallback(() => {
    clearFoliateSearch(viewRef.current as SearchableFoliateView | null);
  }, [viewRef]);

  return {
    toc,
    bookTitle,
    bookAuthor,
    percentage,
    currentCFI,
    currentChapter,
    currentChapterHref,
    currentPageLabel,
    error,
    loading,
    loadingMsg,
    loadingDetail,
    cleanupReader,
    getLoadedBookFile,
    searchBook,
    clearSearch,
  };
}
