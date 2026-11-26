"use client";

import type { CSSProperties, RefObject } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ReaderResumePrompt } from "@/components/reader/ReaderResumePrompt";
import { ReaderLoadingOverlay } from "@/components/reader/ReaderStateViews";
import type { useReaderImageZoom } from "@/hooks/useReaderImageZoom";
import type { ThemeColors } from "@/hooks/useReaderTheme";

const ReaderShortcutsDialog = dynamic(
  () =>
    import("@/components/reader/ReaderShortcutsDialog").then(
      (module) => module.ReaderShortcutsDialog,
    ),
  { ssr: false },
);

const ReaderImageZoomOverlay = dynamic(
  () =>
    import("@/components/reader/ReaderImageZoomOverlay").then(
      (module) => module.ReaderImageZoomOverlay,
    ),
  { ssr: false },
);

interface ReaderViewportProps {
  containerRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  loadingMsg: string;
  loadingDetail: string;
  readerContentInsetTop: string;
  statusBarReservedSpace: string;
  uiScheme: ThemeColors;
  isTouchReader: boolean;
  resumePromptVisible: boolean;
  resumePromptMessage: string;
  onResumeTTS: () => void;
  imageZoom: ReturnType<typeof useReaderImageZoom>;
  shortcutsOpen: boolean;
  onShortcutsOpenChange: (open: boolean) => void;
  overlayContainer: HTMLDivElement | null;
  isFullscreenSupported: boolean;
  showBookmarksShortcut?: boolean;
  flow?: "paginated" | "scrolled";
  onPrev?: () => void;
  onNext?: () => void;
}

export function ReaderViewport({
  containerRef,
  loading,
  loadingMsg,
  loadingDetail,
  readerContentInsetTop,
  statusBarReservedSpace,
  uiScheme,
  isTouchReader,
  resumePromptVisible,
  resumePromptMessage,
  onResumeTTS,
  imageZoom,
  shortcutsOpen,
  onShortcutsOpenChange,
  overlayContainer,
  isFullscreenSupported,
  showBookmarksShortcut = true,
  flow = "paginated",
  onPrev,
  onNext,
}: ReaderViewportProps) {
  const showDesktopEdgeNav =
    !loading && !isTouchReader && flow === "paginated" && Boolean(onPrev) && Boolean(onNext);
  const edgeNavThemeVars = {
    "--reader-chrome-bg": uiScheme.bg,
    "--reader-chrome-rule": uiScheme.cardBorder,
    "--reader-chrome-ink": uiScheme.fg,
    "--reader-chrome-hover": uiScheme.buttonBg,
    "--reader-chrome-accent": uiScheme.link,
  } as CSSProperties;

  return (
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
        className="absolute left-[env(safe-area-inset-left,0px)] right-[env(safe-area-inset-right,0px)] transition-[top] duration-300 ease-out"
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
        {showDesktopEdgeNav && (
          <div style={edgeNavThemeVars}>
            <div className="reader-edge-nav-zone left-0 hidden lg:flex">
              <button
                type="button"
                data-reader-interactive="true"
                onClick={onPrev}
                aria-label="上一页"
                title="上一页 (←)"
                className="reader-edge-nav-btn"
              >
                <ChevronLeft className="size-5" strokeWidth={1.6} aria-hidden="true" />
              </button>
            </div>
            <div className="reader-edge-nav-zone right-0 hidden lg:flex">
              <button
                type="button"
                data-reader-interactive="true"
                onClick={onNext}
                aria-label="下一页"
                title="下一页 (→)"
                className="reader-edge-nav-btn"
              >
                <ChevronRight className="size-5" strokeWidth={1.6} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {isTouchReader && resumePromptVisible && (
        <ReaderResumePrompt
          message={resumePromptMessage}
          uiScheme={uiScheme}
          onResume={onResumeTTS}
        />
      )}

      {imageZoom.zoomedImage && (
        <ReaderImageZoomOverlay
          image={imageZoom.zoomedImage}
          imageZoom={imageZoom.imageZoom}
          imageInteracting={imageZoom.imageInteracting}
          surfaceRef={imageZoom.imageZoomSurfaceRef}
          onClose={imageZoom.handleImageClose}
          onZoomIn={imageZoom.handleImageZoomIn}
          onZoomOut={imageZoom.handleImageZoomOut}
          onResetZoom={imageZoom.handleImageZoomReset}
          onSurfaceClick={imageZoom.handleImageSurfaceClick}
          onDoubleClick={imageZoom.handleImageDoubleClick}
          onPointerDown={imageZoom.handleImagePointerDown}
          onPointerMove={imageZoom.handleImagePointerMove}
          onPointerEnd={imageZoom.handleImagePointerEnd}
        />
      )}

      {shortcutsOpen && (
        <ReaderShortcutsDialog
          open
          onOpenChange={onShortcutsOpenChange}
          uiScheme={uiScheme}
          overlayContainer={overlayContainer}
          isFullscreenSupported={isFullscreenSupported}
          showBookmarksShortcut={showBookmarksShortcut}
        />
      )}
    </div>
  );
}
