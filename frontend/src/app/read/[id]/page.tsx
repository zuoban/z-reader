"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProgress } from "@/hooks/useProgress";
import { useReaderTheme } from "@/hooks/useReaderTheme";
import { useReaderControls } from "@/hooks/useReaderControls";
import { useReaderChrome } from "@/hooks/useReaderChrome";
import { useReaderBookmarks } from "@/hooks/useReaderBookmarks";
import { useReaderImageZoom } from "@/hooks/useReaderImageZoom";
import { useTTS } from "@/hooks/useTTS";
import { useFoliateView } from "@/hooks/useFoliateView";
import { ReaderResumePrompt } from "@/components/reader/ReaderResumePrompt";
import { ReaderStatusBar } from "@/components/reader/ReaderStatusBar";
import {
  ReaderAuthLoading,
  ReaderErrorState,
  ReaderLoadingOverlay,
} from "@/components/reader/ReaderStateViews";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { ReaderImageZoomOverlay } from "@/components/reader/ReaderImageZoomOverlay";
import { DeferredTTSControls } from "@/components/DeferredTTSControls";
import { api, type BookDownloadProgress } from "@/lib/api";
import { getOfflineLibrary } from "@/lib/library-access";
import { hasOfflineBook, saveOfflineBook } from "@/lib/offline-books";
import { formatOfflineDownloadLabel } from "@/lib/reader-page";
import {
  applyThemeColor,
  themeColorForAppMode,
  themeColorForPreset,
} from "@/lib/theme-color";
import type { FoliateView } from "@/lib/types";

const ReaderShortcutsDialog = dynamic(
  () =>
    import("@/components/reader/ReaderShortcutsDialog").then(
      (module) => module.ReaderShortcutsDialog
    ),
  { ssr: false }
);

export default function ReadPage() {
  const { id } = useParams<{ id: string }>();
  return <Reader key={id} bookId={id} />;
}

function Reader({ bookId }: { bookId: string }) {
  const router = useRouter();
  const [library] = useState(getOfflineLibrary);
  const {
    isLoading: authLoading,
    isAuthenticated,
    isOffline,
    checkAuth,
  } = useAuth();
  const {
    progress,
    isLoading: progressLoading,
    updateProgress,
    saveNow,
  } = useProgress({ bookId, remoteSyncEnabled: isAuthenticated });
  const { theme, setTheme, getStylesheet, getUIScheme } = useReaderTheme();
  const uiScheme = getUIScheme();

  // Sync browser/PWA chrome color with the active reader preset.
  useEffect(() => {
    const root = document.documentElement;
    const color = themeColorForPreset(theme.preset);
    root.dataset.readerActivePreset = theme.preset;
    root.style.colorScheme = theme.preset === "dark" ? "dark" : "light";
    applyThemeColor(color);

    return () => {
      delete root.dataset.readerActivePreset;
      const shelfPreset = root.dataset.readerPreset;
      if (
        shelfPreset === "light" ||
        shelfPreset === "sepia" ||
        shelfPreset === "green" ||
        shelfPreset === "dark"
      ) {
        root.style.colorScheme = shelfPreset === "dark" ? "dark" : "light";
        applyThemeColor(themeColorForAppMode(shelfPreset === "dark"));
        return;
      }
      const shelfIsDark = root.classList.contains("dark");
      root.style.colorScheme = shelfIsDark ? "dark" : "light";
      applyThemeColor(themeColorForAppMode(shelfIsDark));
    };
  }, [theme.preset]);

  const [tocOpen, setTocOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isRetryingAuth, setIsRetryingAuth] = useState(false);
  const [offlineAvailability, setOfflineAvailability] = useState<{
    bookId: string;
    available: boolean;
  } | null>(null);
  const [isSavingOffline, setIsSavingOffline] = useState(false);
  const [offlineDownloadProgress, setOfflineDownloadProgress] =
    useState<BookDownloadProgress | null>(null);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [ttsRequested, setTTSRequested] = useState(false);
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(
    null
  );

  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const cleanupReaderRef = useRef<() => void>(() => {});

  const handlePageRef = useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node;
    setOverlayContainer(node);
  }, []);

  const handleHighlight = useCallback((range: Range) => {
    if (viewRef.current?.renderer) {
      viewRef.current.renderer.scrollToAnchor?.(range, true);
    }
  }, []);

  const {
    isHeaderVisible,
    tocListRef,
    showHeader,
    hideHeader,
    scrollToCurrentChapter,
    syncChromeState,
  } = useReaderChrome();

  const {
    state: ttsState,
    preparing: ttsPreparing,
    settings: ttsSettings,
    updateSettings: updateTTSSettings,
    start: startTTS,
    stop: stopTTS,
    next: nextTTS,
    prev: prevTTS,
    voices,
    voicesLoading,
    voicesError,
    reloadVoices,
    resumePromptVisible,
    resumePromptMessage,
    ttsStatus,
    sleepTimer,
    setSleepTimerForMinutes,
    clearSleepTimer,
    resume: resumeTTS,
    pause: pauseTTS,
    restoreCurrentHighlight: restoreTTSHighlight,
  } = useTTS({ viewRef, onHighlight: handleHighlight, bookId, voicesEnabled: ttsRequested });

  const handleTTSExpandedChange = useCallback(
    (expanded: boolean) => {
      if (!expanded) {
        restoreTTSHighlight();
      }
    },
    [restoreTTSHighlight]
  );

  useEffect(() => {
    if (ttsState === "playing") {
      hideHeader();
    }
  }, [hideHeader, ttsState]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isOffline) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, isOffline, router]);

  useEffect(() => {
    if (!isOffline || isRetryingAuth) return;
    const handleOnline = () => {
      void checkAuth();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [checkAuth, isOffline, isRetryingAuth]);

  useEffect(() => {
    if (authLoading || !isOffline || !bookId) return;
    let cancelled = false;
    void hasOfflineBook(library, bookId).then((available) => {
      if (!cancelled && library === getOfflineLibrary()) {
        setOfflineAvailability({ bookId, available });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, bookId, isOffline, library]);

  const offlineCheckedForBook = offlineAvailability?.bookId === bookId;
  const hasLocalOfflineCopy =
    isOffline && offlineCheckedForBook && offlineAvailability.available;
  const offlineMissingCopy =
    isOffline && offlineCheckedForBook && !offlineAvailability.available;

  const handleToggleShortcuts = useCallback(() => {
    if (!shortcutsOpen) {
      setTocOpen(false);
      setBookmarksOpen(false);
      setThemeSettingsOpen(false);
      setShortcutsOpen(true);
    } else {
      setShortcutsOpen(false);
    }
  }, [
    shortcutsOpen,
    setTocOpen,
    setBookmarksOpen,
    setThemeSettingsOpen,
    setShortcutsOpen,
  ]);

  const handleOpenShortcuts = useCallback(() => {
    setTocOpen(false);
    setBookmarksOpen(false);
    setThemeSettingsOpen(false);
    setShortcutsOpen(true);
  }, [setTocOpen, setBookmarksOpen, setThemeSettingsOpen, setShortcutsOpen]);

  const handleRetryConnection = useCallback(async () => {
    if (isRetryingAuth) return;
    setIsRetryingAuth(true);
    try {
      const status = await checkAuth();
      if (status === "offline") {
        toast.error("仍无法连接服务器，请检查网络后再试");
      }
    } finally {
      setIsRetryingAuth(false);
    }
  }, [checkAuth, isRetryingAuth, setIsRetryingAuth]);

  const handleCloseShortcuts = useCallback(() => {
    setShortcutsOpen(false);
  }, [setShortcutsOpen]);

  const goTo = useCallback((href: string) => {
    viewRef.current?.goTo?.(href);
  }, []);

  const handlePrev = useCallback(() => {
    viewRef.current?.prev?.();
  }, []);

  const handleNext = useCallback(() => {
    viewRef.current?.next?.();
  }, []);

  const {
    zoomedImage,
    imageZoom,
    imageInteracting,
    imageZoomSurfaceRef,
    handleImageOpen,
    handleImageClose,
    handleImageZoomIn,
    handleImageZoomOut,
    handleImageZoomReset,
    handleImageSurfaceClick,
    handleImageDoubleClick,
    handleImagePointerDown,
    handleImagePointerMove,
    handleImagePointerEnd,
  } = useReaderImageZoom(pageRef);

  const handleBack = useCallback(() => {
    saveNow();
    cleanupReaderRef.current();

    if (document.fullscreenElement === pageRef.current) {
      void document.exitFullscreen();
    }

    router.push("/shelf");
  }, [saveNow, router]);

  const {
    isTouchReader,
    isFullscreenSupported,
    isFullscreen,
    toggleFullscreen,
    bindReaderDocument,
  } = useReaderControls({
    pageRef,
    onPrev: handlePrev,
    onNext: handleNext,
    onBack: handleBack,
    onStopTTS: stopTTS,
    overlayOpen: tocOpen || bookmarksOpen || themeSettingsOpen || shortcutsOpen,
    shortcutsOpen,
    onToggleShortcuts: handleToggleShortcuts,
    onCloseShortcuts: handleCloseShortcuts,
  });

  const {
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
  } = useFoliateView({
    bookId,
    containerRef,
    viewRef,
    isAuthenticated,
    canLoadOffline: hasLocalOfflineCopy,
    progressLoading,
    progress,
    theme,
    getStylesheet,
    updateProgress,
    bindReaderDocument,
    onImageOpen: handleImageOpen,
  });

  const {
    bookmarks,
    isSavingBookmark,
    handleCreateBookmark,
    handleGoToBookmark,
    handleDeleteBookmark,
  } = useReaderBookmarks({
    bookId,
    isAuthenticated,
    currentCFI,
    percentage,
    currentChapter,
    viewRef,
    onBookmarksOpenChange: setBookmarksOpen,
  });

  const handleSaveOffline = useCallback(async () => {
    if (!isAuthenticated || isSavingOffline || library !== getOfflineLibrary()) return;

    setIsSavingOffline(true);
    setOfflineDownloadProgress(null);
    try {
      const [book, file] = await Promise.all([
        api.getBook(bookId),
        api.fetchBook(bookId, { onProgress: setOfflineDownloadProgress }),
      ]);
      if (library !== getOfflineLibrary()) return;
      await saveOfflineBook(library, book, file, () => library === getOfflineLibrary());
      if (library !== getOfflineLibrary()) return;
      toast.success("图书已保存到此设备，可在断网时继续阅读");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存离线图书失败");
    } finally {
      setOfflineDownloadProgress(null);
      setIsSavingOffline(false);
    }
  }, [bookId, isSavingOffline, isAuthenticated, library]);

  useEffect(() => {
    cleanupReaderRef.current = cleanupReader;
  }, [cleanupReader]);

  useEffect(() => {
    syncChromeState({
      loading,
      tocOpen,
      bookmarksOpen,
      shortcutsOpen,
      themeSettingsOpen,
      currentChapter,
      currentChapterHref,
    });
  }, [
    currentChapter,
    currentChapterHref,
    loading,
    bookmarksOpen,
    syncChromeState,
    shortcutsOpen,
    themeSettingsOpen,
    tocOpen,
  ]);

  if (
    authLoading ||
    (!isAuthenticated && !isOffline) ||
    (isOffline && !offlineCheckedForBook)
  ) {
    return <ReaderAuthLoading uiScheme={uiScheme} />;
  }

  if (offlineMissingCopy) {
    return (
      <ReaderErrorState
        error="当前处于离线状态，本书尚未保存到离线缓存"
        uiScheme={uiScheme}
        onBack={handleBack}
        onRetry={() => void handleRetryConnection()}
        isRetrying={isRetryingAuth}
      />
    );
  }

  if (error) {
    return (
      <ReaderErrorState
        error={error}
        uiScheme={uiScheme}
        onBack={handleBack}
      />
    );
  }

  const headerSafeAreaPaddingTop = "env(safe-area-inset-top, 0px)";
  const readerContentInsetTop =
    "calc(env(safe-area-inset-top, 0px) + var(--reader-toolbar-height))";
  const statusBarReservedSpace = "var(--status-bar-reserved)";
  const statusBarSafeAreaPaddingBottom = "env(safe-area-inset-bottom, 0px)";

  const sharedTTSControlsProps = {
    onRequest: () => setTTSRequested(true),
    state: ttsState,
    preparing: ttsPreparing,
    onPreviewStart: () => {
      if (ttsState === 'playing' || ttsPreparing) pauseTTS();
    },
    settings: ttsSettings,
    voices,
    voicesLoading,
    voicesError,
    onReloadVoices: reloadVoices,
    onStart: startTTS,
    onStop: stopTTS,
    onNext: nextTTS,
    onPrev: prevTTS,
    onUpdateSettings: updateTTSSettings,
    uiScheme,
    resumePromptVisible,
    resumePromptMessage,
    ttsStatus,
    sleepTimer,
    onSleepTimerMinutes: setSleepTimerForMinutes,
    onClearSleepTimer: clearSleepTimer,
    onResume: resumeTTS,
    onExpandedChange: handleTTSExpandedChange,
    overlayContainer,
  } as const;

  return (
    <div
      id="main-content"
      ref={handlePageRef}
      tabIndex={-1}
      className="fixed inset-0 overflow-hidden overscroll-none"
      style={{
        background: uiScheme.bg,
      }}
    >
      <div className="relative flex h-full min-h-0 flex-col">
        <ReaderToolbar
          visible={isHeaderVisible}
          bookTitle={bookTitle}
          bookAuthor={bookAuthor}
          toc={toc}
          tocOpen={tocOpen}
          onTocOpenChange={setTocOpen}
          bookmarksOpen={bookmarksOpen}
          onBookmarksOpenChange={setBookmarksOpen}
          bookmarks={bookmarks}
          showBookmarks={isAuthenticated}
          canCreateBookmark={isAuthenticated && Boolean(currentCFI)}
          isSavingBookmark={isSavingBookmark}
          onCreateBookmark={handleCreateBookmark}
          onGoToBookmark={handleGoToBookmark}
          onDeleteBookmark={handleDeleteBookmark}
          isSavingOffline={isSavingOffline}
          offlineDownloadLabel={formatOfflineDownloadLabel(offlineDownloadProgress)}
          onSaveOffline={isAuthenticated ? handleSaveOffline : undefined}
          tocListRef={tocListRef}
          currentChapter={currentChapter}
          currentChapterHref={currentChapterHref}
          onLocateCurrentChapter={() => scrollToCurrentChapter("smooth")}
          onGoTo={goTo}
          onBack={handleBack}
          uiScheme={uiScheme}
          headerSafeAreaPaddingTop={headerSafeAreaPaddingTop}
          overlayContainer={overlayContainer}
          theme={theme}
          setTheme={setTheme}
          themeSettingsOpen={themeSettingsOpen}
          onThemeSettingsOpenChange={setThemeSettingsOpen}
          isFullscreenSupported={isFullscreenSupported}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onOpenShortcuts={handleOpenShortcuts}
          ttsControls={
            isAuthenticated ? (
              <DeferredTTSControls
                {...sharedTTSControlsProps}
                variant="toolbar"
                triggerClassName="reader-chrome-btn"
                triggerStyle={{}}
                triggerContent={
                  <>
                    <Volume2 className="size-4" strokeWidth={1.6} aria-hidden="true" />
                    <span className="sr-only">朗读</span>
                  </>
                }
              />
            ) : undefined
          }
          mobileTtsControls={
            isAuthenticated ? (
              <DeferredTTSControls
                {...sharedTTSControlsProps}
                variant="toolbar"
                triggerClassName="reader-mobile-menu-item h-auto justify-start gap-3 border-0 px-3 py-2.5 text-sm font-medium"
                triggerStyle={{}}
                triggerContent={
                  <>
                    <Volume2 className="size-4 opacity-80" aria-hidden="true" />
                    <span>朗读</span>
                  </>
                }
              />
            ) : undefined
          }
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {loading && (
              <ReaderLoadingOverlay
                loadingMsg={loadingMsg}
                loadingDetail={loadingDetail}
                readerContentInsetTop={readerContentInsetTop}
                statusBarReservedSpace={statusBarReservedSpace}
                uiScheme={uiScheme}
              />
            )}

            <div
              className="absolute inset-x-0 transition-[top] duration-300 ease-out"
              style={{
                top: readerContentInsetTop,
                bottom: statusBarReservedSpace,
              }}
            >
              <div
                className="reader-page-frame h-full w-full overflow-hidden"
                style={{ background: "transparent" }}
              >
                <div
                  ref={containerRef}
                  className="reader-page-surface h-full w-full overflow-hidden"
                  style={{
                    background: uiScheme.bg,
                  }}
                />
              </div>
            </div>

            {isTouchReader && resumePromptVisible && (
              <ReaderResumePrompt
                message={resumePromptMessage}
                uiScheme={uiScheme}
                onResume={resumeTTS}
              />
            )}

            {zoomedImage && (
              <ReaderImageZoomOverlay
                image={zoomedImage}
                imageZoom={imageZoom}
                imageInteracting={imageInteracting}
                surfaceRef={imageZoomSurfaceRef}
                onClose={handleImageClose}
                onZoomIn={handleImageZoomIn}
                onZoomOut={handleImageZoomOut}
                onResetZoom={handleImageZoomReset}
                onSurfaceClick={handleImageSurfaceClick}
                onDoubleClick={handleImageDoubleClick}
                onPointerDown={handleImagePointerDown}
                onPointerMove={handleImagePointerMove}
                onPointerEnd={handleImagePointerEnd}
              />
            )}

            {shortcutsOpen && (
              <ReaderShortcutsDialog
                open
                onOpenChange={setShortcutsOpen}
                uiScheme={uiScheme}
                overlayContainer={overlayContainer}
                isFullscreenSupported={isFullscreenSupported}
              />
            )}
          </div>

          <ReaderStatusBar
            percentage={percentage}
            currentChapter={currentChapter}
            currentPageLabel={currentPageLabel}
            safeAreaPaddingBottom={statusBarSafeAreaPaddingBottom}
            uiScheme={uiScheme}
            isToolbarVisible={isHeaderVisible}
            onToggleToolbar={isHeaderVisible ? hideHeader : showHeader}
            compactTrailingAction={
              isAuthenticated ? (
                <DeferredTTSControls
                  {...sharedTTSControlsProps}
                  variant="toolbar"
                  triggerClassName="reader-status-action [&_svg]:size-3.5"
                  triggerStyle={
                    ttsState !== "stopped" ? { color: uiScheme.link } : {}
                  }
                />
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
