"use client";

import type { RefObject } from "react";
import dynamic from "next/dynamic";
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
}: ReaderViewportProps) {
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
        />
      )}
    </div>
  );
}
