"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter, useParams } from "next/navigation";
import { X } from "lucide-react";
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
import { TTSControls } from "@/components/TTSControls";
import { api } from "@/lib/api";
import type { Bookmark } from "@/lib/api";
import { withOpacity } from "@/lib/reader-ui";
import { toast } from "sonner";

const MIN_IMAGE_SCALE = 1;
const MAX_IMAGE_SCALE = 5;
const BOOKMARK_EXCERPT_MAX_LENGTH = 72;

interface ImageZoomState {
  scale: number;
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeBookmarkExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= BOOKMARK_EXCERPT_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, BOOKMARK_EXCERPT_MAX_LENGTH)}…`;
}

function getElementFromRange(range: Range) {
  const node = range.startContainer;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function getBookmarkExcerpt(view: FoliateView | null) {
  const range = view?.lastLocation?.range;
  const rangeText = range ? normalizeBookmarkExcerpt(range.toString()) : "";
  if (rangeText) return rangeText;

  const startElement = range ? getElementFromRange(range) : null;
  const block = startElement?.closest(
    "p, li, blockquote, dd, dt, h1, h2, h3, h4, h5, h6",
  );
  const blockText = block?.textContent
    ? normalizeBookmarkExcerpt(block.textContent)
    : "";
  if (blockText) return blockText;

  const doc =
    range?.startContainer.ownerDocument ??
    view?.renderer?.getContents?.()[0]?.doc ??
    view?.tts?.doc;

  return normalizeBookmarkExcerpt(doc?.body?.textContent ?? "");
}

function getZoomedState(
  state: ImageZoomState,
  nextScale: number,
  clientX: number,
  clientY: number,
): ImageZoomState {
  const scale = clamp(nextScale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);
  const viewportCenterX = window.innerWidth / 2;
  const viewportCenterY = window.innerHeight / 2;
  const focusX = clientX - viewportCenterX;
  const focusY = clientY - viewportCenterY;
  const ratio = scale / state.scale;

  return {
    scale,
    x: focusX - (focusX - state.x) * ratio,
    y: focusY - (focusY - state.y) * ratio,
  };
}

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
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
  const [imageZoom, setImageZoom] = useState<ImageZoomState>({
    scale: 1,
    x: 0,
    y: 0,
  });
  const [imageInteracting, setImageInteracting] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const cleanupReaderRef = useRef<() => void>(() => {});
  const imageZoomSurfaceRef = useRef<HTMLDivElement>(null);
  const imagePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const imageDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const imageGestureRef = useRef<{
    distance: number;
    scale: number;
    centerX: number;
    centerY: number;
    x: number;
    y: number;
  } | null>(null);
  const imageLastTapRef = useRef<{
    time: number;
    x: number;
    y: number;
  } | null>(null);
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
    [restoreTTSHighlight],
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
    if (viewRef.current) {
      viewRef.current.goTo?.(href);
    }
  }, []);

  const loadBookmarks = useCallback(async () => {
    try {
      const items = await api.listBookmarks(bookId);
      setBookmarks(items);
    } catch (err) {
      console.error("Failed to load bookmarks:", err);
    }
  }, [bookId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!isAuthenticated) return;
    void loadBookmarks();
  }, [isAuthenticated, loadBookmarks]);

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

  const handleImageOpen = useCallback((image: { src: string; alt: string }) => {
    setImageZoom({ scale: 1, x: 0, y: 0 });
    setImageInteracting(false);
    setZoomedImage(image);
  }, []);

  const handleImageClose = useCallback(() => {
    setZoomedImage(null);
    setImageZoom({ scale: 1, x: 0, y: 0 });
    setImageInteracting(false);
    imagePointersRef.current.clear();
    imageDragRef.current = null;
    imageGestureRef.current = null;
    imageLastTapRef.current = null;
  }, []);

  const toggleImageZoom = useCallback((clientX: number, clientY: number) => {
    setImageZoom((state) => {
      if (state.scale > 1.05) {
        return { scale: 1, x: 0, y: 0 };
      }

      return getZoomedState(state, 2.5, clientX, clientY);
    });
  }, []);

  const handleImageDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    toggleImageZoom(event.clientX, event.clientY);
  }, [toggleImageZoom]);

  const handleImagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();

    event.currentTarget.setPointerCapture(event.pointerId);
    setImageInteracting(true);
    imagePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const pointers = Array.from(imagePointersRef.current.values());
    if (pointers.length === 2) {
      const [first, second] = pointers;
      imageGestureRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        scale: imageZoom.scale,
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
        x: imageZoom.x,
        y: imageZoom.y,
      };
      imageDragRef.current = null;
      return;
    }

    if (imageZoom.scale > 1) {
      imageDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: imageZoom.x,
        originY: imageZoom.y,
      };
    }
  }, [imageZoom]);

  const handleImagePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!imagePointersRef.current.has(event.pointerId)) return;

    event.preventDefault();
    event.stopPropagation();
    imagePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const pointers = Array.from(imagePointersRef.current.values());
    const gesture = imageGestureRef.current;
    if (pointers.length >= 2 && gesture) {
      const [first, second] = pointers;
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const baseState = {
        scale: gesture.scale,
        x: gesture.x,
        y: gesture.y,
      };
      const nextState = getZoomedState(
        baseState,
        gesture.scale * (distance / gesture.distance),
        gesture.centerX,
        gesture.centerY,
      );

      setImageZoom({
        ...nextState,
        x: nextState.x + centerX - gesture.centerX,
        y: nextState.y + centerY - gesture.centerY,
      });
      return;
    }

    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setImageZoom((state) => ({
      ...state,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }, []);

  const handleImagePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const drag = imageDragRef.current;
    const moved = drag
      ? Math.abs(event.clientX - drag.startX) > 8 ||
        Math.abs(event.clientY - drag.startY) > 8
      : false;
    const wasGesture = Boolean(imageGestureRef.current);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    imagePointersRef.current.delete(event.pointerId);
    setImageInteracting(imagePointersRef.current.size > 0);
    imageGestureRef.current = null;
    imageDragRef.current = null;

    const remaining = Array.from(imagePointersRef.current.entries());
    if (remaining.length === 1 && imageZoom.scale > 1) {
      const [pointerId, pointer] = remaining[0];
      imageDragRef.current = {
        pointerId,
        startX: pointer.x,
        startY: pointer.y,
        originX: imageZoom.x,
        originY: imageZoom.y,
      };
    }

    if (moved || wasGesture || imagePointersRef.current.size > 0) return;

    const now = window.performance.now();
    const lastTap = imageLastTapRef.current;
    const isDoubleTap =
      lastTap &&
      now - lastTap.time < 320 &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 32;

    if (isDoubleTap) {
      imageLastTapRef.current = null;
      toggleImageZoom(event.clientX, event.clientY);
      return;
    }

    imageLastTapRef.current = {
      time: now,
      x: event.clientX,
      y: event.clientY,
    };
  }, [imageZoom, toggleImageZoom]);

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
    isFullscreenSupported: _isFullscreenSupported,
    isFullscreen: _isFullscreen,
    toggleFullscreen,
    bindReaderDocument,
  } = useReaderControls({
    pageRef,
    onPrev: handlePrev,
    onNext: handleNext,
    onBack: handleBack,
    onStopTTS: stopTTS,
  });

  const handleToggleFullscreen = useCallback(async () => {
    const enteringFullscreen = document.fullscreenElement !== pageRef.current;
    await toggleFullscreen();
    if (enteringFullscreen) {
      hideHeader();
    }
  }, [hideHeader, toggleFullscreen]);

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

  const handleCreateBookmark = useCallback(async () => {
    if (!currentCFI || isSavingBookmark) return;

    const isDuplicate = bookmarks.some((item) => item.cfi === currentCFI);
    if (isDuplicate) {
      toast.error("该位置已添加书签");
      return;
    }

    setIsSavingBookmark(true);
    try {
      const bookmark = await api.createBookmark(bookId, {
        cfi: currentCFI,
        percentage,
        chapter: currentChapter,
        note: getBookmarkExcerpt(viewRef.current),
      });
      setBookmarks((items) => [...items, bookmark]);
      toast.success("书签已添加");
    } catch (err) {
      console.error("Failed to create bookmark:", err);
      toast.error("添加书签失败");
    } finally {
      setIsSavingBookmark(false);
    }
  }, [bookId, bookmarks, currentCFI, currentChapter, isSavingBookmark, percentage]);

  const handleGoToBookmark = useCallback((bookmark: Bookmark) => {
    viewRef.current?.goTo?.(bookmark.cfi);
    setBookmarksOpen(false);
  }, [setBookmarksOpen]);

  const handleDeleteBookmark = useCallback(async (bookmarkId: string) => {
    setBookmarks((items) => items.filter((item) => item.id !== bookmarkId));
    try {
      await api.deleteBookmark(bookId, bookmarkId);
    } catch (err) {
      console.error("Failed to delete bookmark:", err);
      void loadBookmarks();
    }
  }, [bookId, loadBookmarks]);

  useEffect(() => {
    if (!pageRef.current) return;

    if (zoomedImage) {
      pageRef.current.dataset.readerImageZoomOpen = "true";
    } else {
      delete pageRef.current.dataset.readerImageZoomOpen;
    }
  }, [zoomedImage]);

  useEffect(() => {
    if (!zoomedImage) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      handleImageClose();
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [handleImageClose, zoomedImage]);

  useEffect(() => {
    const surface = imageZoomSurfaceRef.current;
    if (!zoomedImage || !surface) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();

      setImageZoom((state) => {
        const nextScale = state.scale * Math.exp(-event.deltaY * 0.0015);
        return getZoomedState(state, nextScale, event.clientX, event.clientY);
      });
    }

    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      surface.removeEventListener("wheel", handleWheel);
    };
  }, [zoomedImage]);

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
                style={{
                  background: "transparent",
                }}
              >
                <div
                  ref={containerRef}
                  className="reader-page-surface h-full w-full overflow-hidden"
                  style={{
                    background: uiScheme.bg,
                    boxShadow: "none",
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
              <div
                aria-modal="true"
                className="fixed inset-0 z-[90] flex min-h-svh items-center justify-center bg-[#1a1612]/80 p-3  sm:p-6"
                data-reader-interactive="true"
                role="dialog"
              >
                <button
                  aria-label="关闭图片预览"
                  className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_12px_28px_-20px_rgba(0,0,0,0.8)]  transition-all hover:scale-[1.04] hover:bg-white/18 sm:right-5 sm:top-5"
                  type="button"
                  onClick={handleImageClose}
                >
                  <X className="h-5 w-5" />
                </button>
                <div
                  ref={imageZoomSurfaceRef}
                  className="flex h-full w-full touch-none items-center justify-center overflow-hidden"
                  style={{
                    cursor: imageZoom.scale > 1 ? "grab" : "zoom-in",
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (event.detail >= 2) {
                      toggleImageZoom(event.clientX, event.clientY);
                    }
                  }}
                  onDoubleClick={handleImageDoubleClick}
                  onPointerCancel={handleImagePointerEnd}
                  onPointerDown={handleImagePointerDown}
                  onPointerMove={handleImagePointerMove}
                  onPointerUp={handleImagePointerEnd}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={zoomedImage.alt || "放大的书籍图片"}
                    className="max-h-full max-w-full select-none object-contain shadow-[0_24px_80px_-36px_rgba(0,0,0,0.9)]"
                    draggable={false}
                    src={zoomedImage.src}
                    style={{
                      transform: `translate3d(${imageZoom.x}px, ${imageZoom.y}px, 0) scale(${imageZoom.scale})`,
                      transition: imageInteracting ? "none" : "transform 120ms ease-out",
                    }}
                  />
                </div>
              </div>
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
                state={ttsState}
                settings={ttsSettings}
                voices={voices}
                voicesLoading={voicesLoading}
                voicesError={voicesError}
                onReloadVoices={reloadVoices}
                onStart={startTTS}
                onStop={stopTTS}
                onNext={nextTTS}
                onPrev={prevTTS}
                onUpdateSettings={updateTTSSettings}
                uiScheme={uiScheme}
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
                resumePromptVisible={resumePromptVisible}
                resumePromptMessage={resumePromptMessage}
                ttsStatus={ttsStatus}
                sleepTimer={sleepTimer}
                onSleepTimerMinutes={setSleepTimerForMinutes}
                onClearSleepTimer={clearSleepTimer}
                onResume={resumeTTS}
                onExpandedChange={handleTTSExpandedChange}
                overlayContainer={overlayContainer}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
