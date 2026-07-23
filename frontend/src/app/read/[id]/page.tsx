"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { useFoliateReader } from "@/hooks/useFoliateReader";
import { ReaderResumePrompt } from "@/components/reader/ReaderResumePrompt";
import { ReaderStatusBar } from "@/components/reader/ReaderStatusBar";
import {
  ReaderAuthLoading,
  ReaderErrorState,
  ReaderLoadingOverlay,
} from "@/components/reader/ReaderStateViews";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { ReaderImageZoomOverlay } from "@/components/reader/ReaderImageZoomOverlay";
import { TTSControls } from "@/components/TTSControls";
import { api, type BookDownloadProgress } from "@/lib/api";
import { saveOfflineBook } from "@/lib/offline-books";
import { formatOfflineDownloadLabel } from "@/lib/reader-page";
import { withOpacity } from "@/lib/reader-ui";
import {
  applyThemeColor,
  themeColorForAppMode,
  themeColorForPreset,
} from "@/lib/theme-color";
import type { FoliateView } from "@/lib/types";

export default function ReadPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.id as string;
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const {
    progress,
    isLoading: progressLoading,
    updateProgress,
    saveNow,
  } = useProgress({ bookId });
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
        applyThemeColor(themeColorForPreset(shelfPreset));
        return;
      }
      const shelfIsDark = root.classList.contains("dark");
      root.style.colorScheme = shelfIsDark ? "dark" : "light";
      applyThemeColor(themeColorForAppMode(shelfIsDark));
    };
  }, [theme.preset]);

  const [tocOpen, setTocOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [shortcutsOpen] = useState(false);
  const [isSavingOffline, setIsSavingOffline] = useState(false);
  const [offlineDownloadProgress, setOfflineDownloadProgress] =
    useState<BookDownloadProgress | null>(null);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
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
    bindHeaderInteractionDocument,
    cleanupHeaderInteractionDocuments,
    syncChromeState,
  } = useReaderChrome();

  const {
    state: ttsState,
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
    restoreCurrentHighlight: restoreTTSHighlight,
  } = useTTS({ viewRef, onHighlight: handleHighlight, bookId });

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
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

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
    toggleImageZoom,
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
    isFullscreen,
    toggleFullscreen,
    bindReaderDocument,
  } = useReaderControls({
    pageRef,
    onPrev: handlePrev,
    onNext: handleNext,
    onBack: handleBack,
    onStopTTS: stopTTS,
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
    cleanupReader,
  } = useFoliateReader({
    bookId,
    containerRef,
    viewRef,
    isAuthenticated,
    progressLoading,
    progress,
    theme,
    getStylesheet,
    updateProgress,
    bindReaderDocument,
    bindHeaderInteractionDocument,
    cleanupHeaderInteractionDocuments,
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
    if (!user || isSavingOffline) return;

    setIsSavingOffline(true);
    setOfflineDownloadProgress(null);
    try {
      const [book, file] = await Promise.all([
        api.getBook(bookId),
        api.fetchBook(bookId, { onProgress: setOfflineDownloadProgress }),
      ]);
      await saveOfflineBook(user.id, book, file);
      toast.success("图书已保存到此设备，可在断网时继续阅读");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存离线图书失败");
    } finally {
      setOfflineDownloadProgress(null);
      setIsSavingOffline(false);
    }
  }, [bookId, isSavingOffline, user]);

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

  if (authLoading || !isAuthenticated) {
    return <ReaderAuthLoading uiScheme={uiScheme} />;
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

  const isDarkPreset = theme.preset === "dark";
  const statusBarContainerStyle = {
    background: withOpacity(uiScheme.bg, isDarkPreset ? 0.82 : 0.88),
    borderTop: `1px solid ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.18 : 0.1)}`,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow: `0 -4px 20px -8px rgba(0, 0, 0, ${isDarkPreset ? 0.4 : 0.05})`,
  } as const;
  const headerSafeAreaPaddingTop = "env(safe-area-inset-top, 0px)";
  const readerContentInsetTop = "calc(env(safe-area-inset-top, 0px) + 2.75rem)";
  const statusBarReservedSpace = "var(--status-bar-reserved)";
  const statusBarSafeAreaPaddingBottom = "env(safe-area-inset-bottom, 0px)";

  const sharedTTSControlsProps = {
    state: ttsState,
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
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            linear-gradient(90deg, ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.12 : 0.08)} 0, transparent 18%, transparent 82%, ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.12 : 0.08)} 100%)
          `,
        }}
      />

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
          canCreateBookmark={Boolean(currentCFI)}
          isSavingBookmark={isSavingBookmark}
          onCreateBookmark={handleCreateBookmark}
          onGoToBookmark={handleGoToBookmark}
          onDeleteBookmark={handleDeleteBookmark}
          isSavingOffline={isSavingOffline}
          offlineDownloadLabel={formatOfflineDownloadLabel(offlineDownloadProgress)}
          onSaveOffline={handleSaveOffline}
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
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          ttsControls={
            <TTSControls
              {...sharedTTSControlsProps}
              variant="toolbar"
              triggerClassName="flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
              triggerStyle={{}}
              triggerContent={
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  <span className="hidden sm:inline">朗读</span>
                </div>
              }
            />
          }
          mobileTtsControls={
            <TTSControls
              {...sharedTTSControlsProps}
              variant="toolbar"
              triggerClassName="flex min-h-11 w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-normal text-foreground transition-all hover:bg-muted/50"
              triggerStyle={{}}
              triggerContent={
                <>
                  <Volume2 className="h-4 w-4" />
                  <span>朗读</span>
                </>
              }
            />
          }
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {loading && (
              <ReaderLoadingOverlay
                loadingMsg={loadingMsg}
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
                    boxShadow: `
                      inset 0 1px 0 ${withOpacity(uiScheme.fg, theme.preset === "dark" ? 0.04 : 0.03)},
                      inset 0 -1px 0 ${withOpacity(uiScheme.fg, theme.preset === "dark" ? 0.05 : 0.025)}
                    `,
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
                onToggleZoom={toggleImageZoom}
                onDoubleClick={handleImageDoubleClick}
                onPointerDown={handleImagePointerDown}
                onPointerMove={handleImagePointerMove}
                onPointerEnd={handleImagePointerEnd}
              />
            )}
          </div>

          <ReaderStatusBar
            percentage={percentage}
            currentChapter={currentChapter}
            currentPageLabel={currentPageLabel}
            containerStyle={statusBarContainerStyle}
            safeAreaPaddingBottom={statusBarSafeAreaPaddingBottom}
            uiScheme={uiScheme}
            isToolbarVisible={isHeaderVisible}
            onToggleToolbar={isHeaderVisible ? hideHeader : showHeader}
            compactTrailingAction={
              <TTSControls
                {...sharedTTSControlsProps}
                variant="toolbar"
                triggerClassName="paper-motion-interactive inline-flex size-4! shrink-0 items-center justify-center rounded-[5px] p-0 transition-all hover:scale-[1.05] active:scale-90 focus-visible:ring-0 [&_svg]:size-[9px]! hover:bg-black/5 dark:hover:bg-white/5"
                triggerStyle={{
                  color:
                    ttsState !== "stopped"
                      ? uiScheme.link
                      : withOpacity(uiScheme.fg, 0.72),
                  background: "transparent",
                  border: "none",
                  height: "20px",
                  minHeight: "20px",
                  width: "20px",
                  minWidth: "20px",
                }}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
