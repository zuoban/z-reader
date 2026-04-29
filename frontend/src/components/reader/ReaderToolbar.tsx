"use client";

import { lazy, Suspense } from "react";
import type { CSSProperties, RefObject } from "react";
import { ChevronRight, Expand, Library, Shrink } from "lucide-react";

import { ThemeSettings } from "@/components/ThemeSettings";
import { Button } from "@/components/ui/button";
import { ReaderBookmarksSheet } from "@/components/reader/ReaderBookmarksSheet";
import { ReaderTOCSheet } from "@/components/reader/ReaderTOCSheet";
import type { ReaderTheme, ThemeColors } from "@/hooks/useReaderTheme";
import type { Bookmark } from "@/lib/api";
import { withOpacity } from "@/lib/reader-ui";
import type { TTSSettings, TTSState, Voice } from "@/lib/tts";
import type { TOCItem } from "@/lib/types";

const TTSControls = lazy(() =>
  import("@/components/TTSControls").then((m) => ({ default: m.TTSControls })),
);

interface ReaderToolbarProps {
  visible: boolean;
  bookTitle: string;
  bookAuthor: string;
  toc: TOCItem[];
  tocOpen: boolean;
  onTocOpenChange: (open: boolean) => void;
  bookmarksOpen: boolean;
  onBookmarksOpenChange: (open: boolean) => void;
  bookmarks: Bookmark[];
  canCreateBookmark: boolean;
  isSavingBookmark: boolean;
  onCreateBookmark: () => void;
  onGoToBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  tocListRef: RefObject<HTMLDivElement | null>;
  currentChapter: string;
  currentChapterHref: string;
  onLocateCurrentChapter: () => void;
  onGoTo: (href: string) => void;
  onBack: () => void;
  onToggleToolbar: () => void;
  uiScheme: ThemeColors;
  toolbarButtonClass: string;
  getToolbarButtonStyle: (active?: boolean) => CSSProperties;
  headerSafeAreaPaddingTop: string;
  overlayContainer?: HTMLElement | null;
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  themeSettingsOpen: boolean;
  onThemeSettingsOpenChange: (open: boolean) => void;
  isFullscreenSupported: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void | Promise<void>;
  tts: {
    state: TTSState;
    settings: TTSSettings;
    voices: Voice[];
    voicesLoading: boolean;
    voicesError: string | null;
    reloadVoices: () => void | Promise<void>;
    start: () => void | Promise<void>;
    stop: () => void;
    next: () => void | Promise<void>;
    prev: () => void | Promise<void>;
    updateSettings: (settings: Partial<TTSSettings>) => void;
    resumePromptVisible: boolean;
    resumePromptMessage: string;
    status: {
      headline: string;
      detail?: string;
      tone?: "idle" | "active" | "warning" | "error";
    };
    sleepTimer: {
      mode: "off" | "minutes";
      minutes?: number;
      endsAt?: number;
      label: string;
    };
    setSleepTimerForMinutes: (minutes: number) => void;
    clearSleepTimer: () => void;
    resume: () => void | Promise<void>;
    onExpandedChange: (expanded: boolean) => void;
  };
}

export function ReaderToolbar({
  visible,
  bookTitle,
  bookAuthor,
  toc,
  tocOpen,
  onTocOpenChange,
  bookmarksOpen,
  onBookmarksOpenChange,
  bookmarks,
  canCreateBookmark,
  isSavingBookmark,
  onCreateBookmark,
  onGoToBookmark,
  onDeleteBookmark,
  tocListRef,
  currentChapter,
  currentChapterHref,
  onLocateCurrentChapter,
  onGoTo,
  onBack,
  onToggleToolbar,
  uiScheme,
  toolbarButtonClass,
  getToolbarButtonStyle,
  headerSafeAreaPaddingTop,
  overlayContainer,
  theme,
  setTheme,
  themeSettingsOpen,
  onThemeSettingsOpenChange,
  isFullscreenSupported,
  isFullscreen,
  onToggleFullscreen,
  tts,
}: ReaderToolbarProps) {
  const toggleToolbarButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggleToolbar}
      title={visible ? "收起顶部操作栏" : "展开顶部操作栏"}
      aria-label={visible ? "收起顶部操作栏" : "展开顶部操作栏"}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${toolbarButtonClass}`}
      style={{
        color: uiScheme.buttonText,
        ...getToolbarButtonStyle(false),
        background: "transparent",
        border: "none",
        boxShadow: "none",
      }}
    >
      <ChevronRight
        className={`h-4 w-4 transition-transform duration-200 ease-out ${
          visible ? "rotate-90" : "rotate-0"
        }`}
      />
    </Button>
  );

  return (
    <>
      {!visible ? (
        <button
          type="button"
          data-reader-interactive="true"
          onClick={onToggleToolbar}
          title="展开顶部操作栏"
          aria-label="展开顶部操作栏"
          className="pointer-events-auto absolute inset-x-0 top-0 z-[60] flex cursor-pointer items-start px-3 text-left transition-colors duration-150 hover:bg-black/[0.03] active:bg-black/[0.05] sm:px-8"
          style={{
            paddingTop: headerSafeAreaPaddingTop,
            background: `linear-gradient(180deg, ${uiScheme.bg} 0%, ${withOpacity(uiScheme.bg, 0.82)} 72%, transparent 100%)`,
          }}
        >
          <span className="flex h-11 w-full items-center">
            <span
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${toolbarButtonClass}`}
              style={{
                color: uiScheme.buttonText,
                ...getToolbarButtonStyle(false),
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
            >
              <ChevronRight className="h-4 w-4 rotate-0 transition-transform duration-200 ease-out" />
            </span>
          </span>
        </button>
      ) : null}
      <header
        data-reader-interactive="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-50 sm:px-4 ${
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-[calc(100%+env(safe-area-inset-top,0px))] opacity-0"
        }`}
        style={{
          background: uiScheme.bg,
          paddingTop: headerSafeAreaPaddingTop,
          transition:
            "transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="flex h-9 items-center justify-between px-3 pointer-events-auto sm:h-9 sm:px-4">
          <div className="flex items-center gap-1 sm:gap-2">
            {toggleToolbarButton}
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              title="返回书库"
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${toolbarButtonClass}`}
              style={{
                color: uiScheme.buttonText,
                ...getToolbarButtonStyle(false),
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
            >
              <Library className="h-4 w-4" />
            </Button>
            {isFullscreenSupported ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void onToggleFullscreen()}
                title={isFullscreen ? "退出全屏" : "进入全屏"}
                aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${toolbarButtonClass}`}
                style={{
                  color: isFullscreen ? uiScheme.link : uiScheme.buttonText,
                  ...getToolbarButtonStyle(isFullscreen),
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                {isFullscreen ? (
                  <Shrink className="h-4 w-4" />
                ) : (
                  <Expand className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Suspense fallback={null}>
              <TTSControls
                state={tts.state}
                settings={tts.settings}
                voices={tts.voices}
                voicesLoading={tts.voicesLoading}
                voicesError={tts.voicesError}
                onReloadVoices={tts.reloadVoices}
                onStart={tts.start}
                onStop={tts.stop}
                onNext={tts.next}
                onPrev={tts.prev}
                onUpdateSettings={tts.updateSettings}
                uiScheme={uiScheme}
                variant="toolbar"
                triggerClassName={toolbarButtonClass}
                triggerStyle={{
                  ...getToolbarButtonStyle(tts.state !== "stopped"),
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                }}
                resumePromptVisible={tts.resumePromptVisible}
                resumePromptMessage={tts.resumePromptMessage}
                ttsStatus={tts.status}
                sleepTimer={tts.sleepTimer}
                onSleepTimerMinutes={tts.setSleepTimerForMinutes}
                onClearSleepTimer={tts.clearSleepTimer}
                onResume={tts.resume}
                onExpandedChange={tts.onExpandedChange}
                overlayContainer={overlayContainer}
              />
            </Suspense>
            <ReaderTOCSheet
              open={tocOpen}
              onOpenChange={onTocOpenChange}
              toc={toc}
              bookTitle={bookTitle}
              bookAuthor={bookAuthor}
              tocListRef={tocListRef}
              currentChapter={currentChapter}
              currentChapterHref={currentChapterHref}
              uiScheme={uiScheme}
              overlayContainer={overlayContainer}
              triggerClassName={toolbarButtonClass}
              triggerStyle={{
                ...getToolbarButtonStyle(tocOpen),
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
              onLocateCurrent={onLocateCurrentChapter}
              onGoTo={onGoTo}
            />
            <ReaderBookmarksSheet
              open={bookmarksOpen}
              onOpenChange={onBookmarksOpenChange}
              bookmarks={bookmarks}
              bookTitle={bookTitle}
              uiScheme={uiScheme}
              overlayContainer={overlayContainer}
              triggerClassName={toolbarButtonClass}
              triggerStyle={{
                ...getToolbarButtonStyle(bookmarksOpen),
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
              canCreate={canCreateBookmark}
              isSaving={isSavingBookmark}
              onCreate={onCreateBookmark}
              onGoTo={onGoToBookmark}
              onDelete={onDeleteBookmark}
            />
            <ThemeSettings
              theme={theme}
              setTheme={setTheme}
              uiScheme={uiScheme}
              open={themeSettingsOpen}
              onOpenChange={onThemeSettingsOpenChange}
              overlayContainer={overlayContainer}
              triggerClassName={toolbarButtonClass}
              triggerStyle={{
                ...getToolbarButtonStyle(themeSettingsOpen),
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
            />
          </div>
        </div>
      </header>
    </>
  );
}
