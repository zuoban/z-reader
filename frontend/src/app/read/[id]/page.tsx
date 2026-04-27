"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { FoliateView } from "@/lib/types";
import { useProgress } from "@/hooks/useProgress";
import { useReaderTheme } from "@/hooks/useReaderTheme";
import { useReaderControls } from "@/hooks/useReaderControls";
import { useReaderChrome } from "@/hooks/useReaderChrome";
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
import { withOpacity } from "@/lib/reader-ui";

export default function ReadPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.id as string;
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const {
    progress,
    isLoading: progressLoading,
    updateProgress,
    saveNow,
  } = useProgress({ bookId });
  const { theme, setTheme, getStylesheet, getUIScheme } = useReaderTheme();
  const uiScheme = getUIScheme();

  const [tocOpen, setTocOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);

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
    handleReaderClick,
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
    [restoreTTSHighlight],
  );

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const goTo = useCallback((href: string) => {
    if (viewRef.current) {
      viewRef.current.goTo?.(href);
    }
  }, []);

  const handlePrev = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.prev?.();
    }
  }, []);

  const handleNext = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.next?.();
    }
  }, []);

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
  });

  const {
    toc,
    bookTitle,
    percentage,
    currentChapter,
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
  });

  useEffect(() => {
    cleanupReaderRef.current = cleanupReader;
  }, [cleanupReader]);

  useEffect(() => {
    syncChromeState({
      loading,
      tocOpen,
      themeSettingsOpen,
      currentChapter,
    });
  }, [
    currentChapter,
    loading,
    syncChromeState,
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

  const toolbarButtonClass =
    "relative flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-lg transition-colors duration-150 ease-out hover:bg-black/5 sm:h-10 sm:w-10 sm:min-h-10 sm:min-w-10";
  const isDarkPreset = theme.preset === "dark";
  const getToolbarButtonStyle = (active = false) => ({
    color: active ? uiScheme.link : uiScheme.buttonText,
    transition: "all 150ms ease-out",
  });
  const statusBarContainerStyle = {
    background: uiScheme.bg,
    borderTop: `1px solid ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.3 : 0.4)}`,
  } as const;
  const headerSafeAreaPaddingTop = "env(safe-area-inset-top, 0px)";
  const readerContentInsetTop = "1.25rem";
  const statusBarReservedSpace = "calc(env(safe-area-inset-bottom, 0px) + 2.4rem)";
  const statusBarSafeAreaPaddingBottom = "env(safe-area-inset-bottom, 0px)";

  return (
    <div
      ref={handlePageRef}
      className="fixed inset-0 overflow-hidden overscroll-none"
      style={{ background: uiScheme.bg }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${withOpacity(uiScheme.headerBg, 0.96)} 0%, ${uiScheme.bg} 16%, ${uiScheme.bg} 100%)`,
        }}
      />

      <div className="relative flex h-full min-h-0 flex-col">
        <ReaderToolbar
          visible={isHeaderVisible}
          bookTitle={bookTitle}
          toc={toc}
          tocOpen={tocOpen}
          onTocOpenChange={setTocOpen}
          tocListRef={tocListRef}
          currentChapter={currentChapter}
          onLocateCurrentChapter={() => scrollToCurrentChapter("smooth")}
          onGoTo={goTo}
          onBack={handleBack}
          uiScheme={uiScheme}
          isDarkPreset={isDarkPreset}
          toolbarButtonClass={toolbarButtonClass}
          getToolbarButtonStyle={getToolbarButtonStyle}
          headerSafeAreaPaddingTop={headerSafeAreaPaddingTop}
          overlayContainer={overlayContainer}
          tts={{
            state: ttsState,
            settings: ttsSettings,
            voices,
            voicesLoading,
            voicesError,
            reloadVoices,
            start: startTTS,
            stop: stopTTS,
            next: nextTTS,
            prev: prevTTS,
            updateSettings: updateTTSSettings,
            resumePromptVisible,
            resumePromptMessage,
            status: ttsStatus,
            sleepTimer,
            setSleepTimerForMinutes,
            clearSleepTimer,
            resume: resumeTTS,
            onExpandedChange: handleTTSExpandedChange,
          }}
          theme={theme}
          setTheme={setTheme}
          themeSettingsOpen={themeSettingsOpen}
          onThemeSettingsOpenChange={setThemeSettingsOpen}
          isFullscreenSupported={isFullscreenSupported}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            style={{ background: uiScheme.bg }}
          >
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
              onClickCapture={(event) => handleReaderClick(event.nativeEvent)}
            >
              <div
                ref={containerRef}
                className="h-full w-full overflow-hidden"
              />
            </div>

            {isTouchReader && resumePromptVisible && (
              <ReaderResumePrompt
                message={resumePromptMessage}
                uiScheme={uiScheme}
                onResume={resumeTTS}
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
          />
        </div>
      </div>
    </div>
  );
}
