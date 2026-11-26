"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useProgress } from "@/hooks/useProgress";
import { useReaderTheme } from "@/hooks/useReaderTheme";
import { useReaderThemeColorSync } from "@/hooks/useReaderThemeColorSync";
import { useReaderControls } from "@/hooks/useReaderControls";
import { useReaderChrome } from "@/hooks/useReaderChrome";
import { useReaderBookmarks } from "@/hooks/useReaderBookmarks";
import { useReaderImageZoom } from "@/hooks/useReaderImageZoom";
import { useReaderOffline } from "@/hooks/useReaderOffline";
import { useReaderSheets } from "@/hooks/useReaderSheets";
import { useReaderTTSBridge } from "@/hooks/useReaderTTSBridge";
import { useFoliateView } from "@/hooks/useFoliateView";
import { ReaderJumpBackPill } from "@/components/reader/ReaderJumpBackPill";
import { ReaderStatusBar } from "@/components/reader/ReaderStatusBar";
import {
  ReaderAuthLoading,
  ReaderErrorState,
} from "@/components/reader/ReaderStateViews";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { ReaderTTSControlTrigger } from "@/components/reader/ReaderTTSControlTrigger";
import { ReaderViewport } from "@/components/reader/ReaderViewport";
import "../../styles/mantine-buttons.css";
import "../../styles/reader.css";
import type { Bookmark } from "@/lib/api";
import { getOfflineLibrary } from "@/lib/library-access";
import type { FoliateView } from "@/lib/types";

const ReaderTOCSheet = dynamic(
  () =>
    import("@/components/reader/ReaderTOCSheet").then(
      (module) => module.ReaderTOCSheet,
    ),
  { ssr: false },
);

const ReaderBookmarksSheet = dynamic(
  () =>
    import("@/components/reader/ReaderBookmarksSheet").then(
      (module) => module.ReaderBookmarksSheet,
    ),
  { ssr: false },
);

const ThemeSettings = dynamic(
  () =>
    import("@/components/ThemeSettings").then((module) => module.ThemeSettings),
  { ssr: false },
);

const TTSControls = dynamic(
  () => import("@/components/TTSControls").then((module) => module.TTSControls),
  { ssr: false },
);

const ReaderTTSRuntime = dynamic(
  () =>
    import("@/components/reader/ReaderTTSRuntime").then(
      (module) => module.ReaderTTSRuntime,
    ),
  { ssr: false },
);

const ReaderSearchSheet = dynamic(
  () =>
    import("@/components/reader/ReaderSearchSheet").then(
      (module) => module.ReaderSearchSheet,
    ),
  { ssr: false },
);

const HEADER_SAFE_AREA_PADDING_TOP = "env(safe-area-inset-top, 0px)";
const READER_CONTENT_INSET_TOP =
  "calc(env(safe-area-inset-top, 0px) + var(--reader-toolbar-height))";
const STATUS_BAR_RESERVED_SPACE = "var(--status-bar-reserved)";
const STATUS_BAR_SAFE_AREA_PADDING_BOTTOM = "env(safe-area-inset-bottom, 0px)";

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
  useReaderThemeColorSync(theme.preset);

  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const cleanupReaderRef = useRef<() => void>(() => {});

  const handlePageRef = useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node;
    setOverlayContainer(node);
  }, []);

  const sheets = useReaderSheets();

  const chrome = useReaderChrome();
  const tts = useReaderTTSBridge({
    uiScheme,
    overlayContainer,
    hideHeader: chrome.hideHeader,
    ttsOpen: sheets.ttsOpen,
    onTtsOpenChange: sheets.setTtsOpen,
  });
  const offline = useReaderOffline({
    bookId,
    library,
    authLoading,
    isAuthenticated,
    isOffline,
    checkAuth,
  });

  useEffect(() => {
    void import("@/components/reader/ReaderTOCSheet").catch(() => {});
    void import("@/components/reader/ReaderBookmarksSheet").catch(() => {});
    void import("@/components/ThemeSettings").catch(() => {});
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isOffline) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, isOffline, router]);

  const goTo = useCallback((href: string) => {
    viewRef.current?.goTo?.(href);
  }, []);

  const handlePrev = useCallback(() => {
    viewRef.current?.prev?.();
  }, []);

  const handleNext = useCallback(() => {
    viewRef.current?.next?.();
  }, []);

  const imageZoom = useReaderImageZoom(pageRef);

  const handleBack = useCallback(() => {
    saveNow();
    cleanupReaderRef.current();

    if (document.fullscreenElement === pageRef.current) {
      void document.exitFullscreen()?.catch(() => {});
    }

    router.push("/shelf");
  }, [saveNow, router]);

  const controls = useReaderControls({
    pageRef,
    onPrev: handlePrev,
    onNext: handleNext,
    onBack: handleBack,
    onStopTTS: tts.stopTTS,
    overlayOpen: sheets.hasSheetOpen,
    shortcutsOpen: sheets.shortcutsOpen,
    onToggleShortcuts: sheets.handleToggleShortcuts,
    onCloseShortcuts: sheets.handleCloseShortcuts,
    onOpenSearch: sheets.openSearch,
    onOpenTOC: () => sheets.setTocOpen(true),
    onOpenBookmarks: isAuthenticated ? () => sheets.setBookmarksOpen(true) : undefined,
    onOpenThemeSettings: () => sheets.setThemeSettingsOpen(true),
  });

  const reader = useFoliateView({
    bookId,
    containerRef,
    viewRef,
    isAuthenticated,
    canLoadOffline: offline.hasLocalOfflineCopy,
    progressLoading,
    progress,
    theme,
    getStylesheet,
    updateProgress,
    bindReaderDocument: controls.bindReaderDocument,
    onImageOpen: imageZoom.handleImageOpen,
  });

  const {
    bookmarks,
    isSavingBookmark,
    handleCreateBookmark,
    handleGoToBookmark,
    handleDeleteBookmark,
    handleUpdateBookmarkNote,
  } = useReaderBookmarks({
    bookId,
    isAuthenticated,
    deferLoad: reader.loading && !sheets.bookmarksOpen,
    currentCFI: reader.currentCFI,
    percentage: reader.percentage,
    currentChapter: reader.currentChapter,
    viewRef,
    onBookmarksOpenChange: sheets.setBookmarksOpen,
  });

  const { saveBookOffline } = offline;
  const { getLoadedBookFile, goToFraction, currentCFI, percentage } = reader;
  const [jumpBackLocation, setJumpBackLocation] = useState<{
    cfi: string;
    percentage: number;
  } | null>(null);

  const captureJumpBackLocation = useCallback(() => {
    if (!currentCFI) return;
    setJumpBackLocation((prev) =>
      prev ?? {
        cfi: currentCFI,
        percentage,
      },
    );
  }, [currentCFI, percentage]);

  const handleJumpToLocation = useCallback(
    (target: string) => {
      captureJumpBackLocation();
      goTo(target);
    },
    [captureJumpBackLocation, goTo],
  );

  const handleJumpToBookmark = useCallback(
    (bookmark: Bookmark) => {
      captureJumpBackLocation();
      handleGoToBookmark(bookmark);
    },
    [captureJumpBackLocation, handleGoToBookmark],
  );

  const handleGoToFraction = useCallback(
    (fraction: number) => {
      captureJumpBackLocation();
      void goToFraction(fraction);
    },
    [captureJumpBackLocation, goToFraction],
  );

  const handleReturnToPreviousLocation = useCallback(() => {
    if (!jumpBackLocation) return;
    const targetCfi = jumpBackLocation.cfi;
    setJumpBackLocation(null);
    goTo(targetCfi);
  }, [goTo, jumpBackLocation]);

  const handleDismissJumpBack = useCallback(() => {
    setJumpBackLocation(null);
  }, []);

  const handleSaveOffline = useCallback(
    () => saveBookOffline(getLoadedBookFile()),
    [getLoadedBookFile, saveBookOffline],
  );

  useEffect(() => {
    cleanupReaderRef.current = reader.cleanupReader;
  }, [reader.cleanupReader]);

  const { syncChromeState } = chrome;
  const keepHeaderVisible = sheets.hasSheetOpen && !sheets.ttsOpen;
  useEffect(() => {
    syncChromeState({
      loading: reader.loading,
      tocOpen: sheets.tocOpen,
      keepHeaderVisible,
      currentChapter: reader.currentChapter,
      currentChapterHref: reader.currentChapterHref,
    });
  }, [
    keepHeaderVisible,
    reader.currentChapter,
    reader.currentChapterHref,
    reader.loading,
    sheets.tocOpen,
    syncChromeState,
  ]);

  if (
    authLoading ||
    (!isAuthenticated && !isOffline) ||
    (isOffline && !offline.offlineCheckedForBook)
  ) {
    return <ReaderAuthLoading uiScheme={uiScheme} />;
  }

  if (offline.offlineMissingCopy) {
    return (
      <ReaderErrorState
        error="当前处于离线状态，本书尚未保存到离线缓存"
        uiScheme={uiScheme}
        onBack={handleBack}
        onRetry={() => void offline.handleRetryConnection()}
        isRetrying={offline.isRetryingAuth}
      />
    );
  }

  if (reader.error) {
    return (
      <ReaderErrorState
        error={reader.error}
        uiScheme={uiScheme}
        onBack={handleBack}
      />
    );
  }

  const ttsLoading = tts.ttsOpen && !tts.runtimeReady;

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
        {isAuthenticated && tts.ttsRequested && (
          <ReaderTTSRuntime
            viewRef={viewRef}
            bookId={bookId}
            onSync={tts.handleSyncTTSRuntime}
          />
        )}
        <ReaderToolbar
          visible={chrome.isHeaderVisible}
          bookTitle={reader.bookTitle}
          bookAuthor={reader.bookAuthor}
          tocOpen={sheets.tocOpen}
          onTocOpenChange={sheets.setTocOpen}
          bookmarksOpen={sheets.bookmarksOpen}
          onBookmarksOpenChange={sheets.setBookmarksOpen}
          showBookmarks={isAuthenticated}
          canCreateBookmark={isAuthenticated && Boolean(reader.currentCFI)}
          isSavingBookmark={isSavingBookmark}
          onCreateBookmark={handleCreateBookmark}
          isSavingOffline={offline.isSavingOffline}
          offlineDownloadLabel={offline.offlineDownloadLabel}
          onSaveOffline={isAuthenticated ? handleSaveOffline : undefined}
          onBack={handleBack}
          uiScheme={uiScheme}
          headerSafeAreaPaddingTop={HEADER_SAFE_AREA_PADDING_TOP}
          themeSettingsOpen={sheets.themeSettingsOpen}
          onThemeSettingsOpenChange={sheets.setThemeSettingsOpen}
          isFullscreenSupported={controls.isFullscreenSupported}
          isFullscreen={controls.isFullscreen}
          onToggleFullscreen={controls.toggleFullscreen}
          onOpenShortcuts={sheets.handleOpenShortcuts}
          searchOpen={sheets.showSearch}
          onOpenSearch={sheets.openSearch}
          ttsOpen={tts.ttsOpen}
          ttsControls={
            isAuthenticated ? (
              <ReaderTTSControlTrigger
                slot="desktop-toolbar"
                expanded={tts.ttsOpen}
                state={tts.ttsState}
                isLoading={ttsLoading}
                uiScheme={uiScheme}
                onClick={tts.requestTTS}
              />
            ) : undefined
          }
          mobileTtsControls={
            isAuthenticated ? (
              <ReaderTTSControlTrigger
                slot="mobile-menu"
                expanded={tts.ttsOpen}
                state={tts.ttsState}
                isLoading={ttsLoading}
                uiScheme={uiScheme}
                onClick={tts.requestTTS}
              />
            ) : undefined
          }
        />

        {sheets.tocMounted && (
          <ReaderTOCSheet
            open={sheets.tocOpen}
            onOpenChange={sheets.setTocOpen}
            toc={reader.toc}
            bookTitle={reader.bookTitle}
            bookAuthor={reader.bookAuthor}
            tocListRef={chrome.tocListRef}
            currentChapter={reader.currentChapter}
            currentChapterHref={reader.currentChapterHref}
            uiScheme={uiScheme}
            overlayContainer={overlayContainer}
            onLocateCurrent={() => chrome.scrollToCurrentChapter("smooth")}
            onGoTo={handleJumpToLocation}
            percentage={reader.percentage}
            onGoToFraction={handleGoToFraction}
            jumpBackPercentage={jumpBackLocation?.percentage ?? null}
            onReturnToPreviousLocation={
              jumpBackLocation ? handleReturnToPreviousLocation : undefined
            }
          />
        )}

        {isAuthenticated && sheets.bookmarksMounted && (
          <ReaderBookmarksSheet
            open={sheets.bookmarksOpen}
            onOpenChange={sheets.setBookmarksOpen}
            bookmarks={bookmarks}
            bookTitle={reader.bookTitle}
            bookAuthor={reader.bookAuthor}
            uiScheme={uiScheme}
            overlayContainer={overlayContainer}
            canCreate={Boolean(reader.currentCFI)}
            isSaving={isSavingBookmark}
            onCreate={handleCreateBookmark}
            onGoTo={handleJumpToBookmark}
            onDelete={handleDeleteBookmark}
            onUpdateNote={handleUpdateBookmarkNote}
          />
        )}

        {sheets.themeSettingsMounted && (
          <ThemeSettings
            theme={theme}
            setTheme={setTheme}
            uiScheme={uiScheme}
            open={sheets.themeSettingsOpen}
            onOpenChange={sheets.setThemeSettingsOpen}
            overlayContainer={overlayContainer}
          />
        )}

        {sheets.searchMounted && (
          <ReaderSearchSheet
            open={sheets.showSearch}
            onOpenChange={sheets.setSearchOpen}
            bookTitle={reader.bookTitle}
            uiScheme={uiScheme}
            overlayContainer={overlayContainer}
            onSearch={reader.searchBook}
            onClearSearch={reader.clearSearch}
            onSelectResult={handleJumpToLocation}
          />
        )}

        {isAuthenticated && tts.ttsRequested && tts.drawerProps && (
          <TTSControls {...tts.drawerProps} />
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          <ReaderViewport
            containerRef={containerRef}
            loading={reader.loading}
            loadingMsg={reader.loadingMsg}
            loadingDetail={reader.loadingDetail}
            readerContentInsetTop={READER_CONTENT_INSET_TOP}
            statusBarReservedSpace={STATUS_BAR_RESERVED_SPACE}
            uiScheme={uiScheme}
            isTouchReader={controls.isTouchReader}
            resumePromptVisible={tts.resumePromptVisible}
            resumePromptMessage={tts.resumePromptMessage}
            onResumeTTS={tts.resumeTTS}
            imageZoom={imageZoom}
            shortcutsOpen={sheets.shortcutsOpen}
            onShortcutsOpenChange={sheets.setShortcutsOpen}
            overlayContainer={overlayContainer}
            isFullscreenSupported={controls.isFullscreenSupported}
            showBookmarksShortcut={isAuthenticated}
          />

          {!reader.loading && !reader.error && !sheets.hasSheetOpen && (
            <ReaderJumpBackPill
              percentage={jumpBackLocation?.percentage ?? null}
              uiScheme={uiScheme}
              safeAreaPaddingBottom={STATUS_BAR_SAFE_AREA_PADDING_BOTTOM}
              isToolbarVisible={chrome.isHeaderVisible}
              onReturn={handleReturnToPreviousLocation}
              onDismiss={handleDismissJumpBack}
            />
          )}

          <ReaderStatusBar
            percentage={reader.percentage}
            currentChapter={reader.currentChapter}
            currentPageLabel={reader.currentPageLabel}
            safeAreaPaddingBottom={STATUS_BAR_SAFE_AREA_PADDING_BOTTOM}
            uiScheme={uiScheme}
            isToolbarVisible={chrome.isHeaderVisible}
            onToggleToolbar={
              chrome.isHeaderVisible ? chrome.hideHeader : chrome.showHeader
            }
            compactTrailingAction={
              isAuthenticated ? (
                <ReaderTTSControlTrigger
                  slot="status-bar"
                  expanded={tts.ttsOpen}
                  state={tts.ttsState}
                  isLoading={ttsLoading}
                  uiScheme={uiScheme}
                  onClick={tts.requestTTS}
                />
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
