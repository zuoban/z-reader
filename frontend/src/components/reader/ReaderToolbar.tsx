"use client";

import { lazy, Suspense } from "react";
import type { CSSProperties, RefObject } from "react";
import { ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";

import { ThemeSettings } from "@/components/ThemeSettings";
import { Button } from "@/components/ui/button";
import { ReaderTOCSheet } from "@/components/reader/ReaderTOCSheet";
import type { ReaderTheme, ThemeColors } from "@/hooks/useReaderTheme";
import type { TOCItem } from "@/lib/types";
import type { TTSSettings, TTSState, Voice } from "@/lib/tts";
import { withOpacity } from "@/lib/reader-ui";

const TTSControls = lazy(() =>
  import("@/components/TTSControls").then((m) => ({ default: m.TTSControls })),
);

interface ReaderToolbarProps {
  visible: boolean;
  bookTitle: string;
  toc: TOCItem[];
  tocOpen: boolean;
  onTocOpenChange: (open: boolean) => void;
  tocListRef: RefObject<HTMLDivElement | null>;
  currentChapter: string;
  onLocateCurrentChapter: () => void;
  onGoTo: (href: string) => void;
  onBack: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  uiScheme: ThemeColors;
  isDarkPreset: boolean;
  toolbarButtonClass: string;
  getToolbarButtonStyle: (active?: boolean) => CSSProperties;
  headerSafeAreaPaddingTop: string;
  overlayContainer?: HTMLElement | null;
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
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  themeSettingsOpen: boolean;
  onThemeSettingsOpenChange: (open: boolean) => void;
  isFullscreenSupported: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void | Promise<void>;
}

export function ReaderToolbar({
  visible,
  bookTitle,
  toc,
  tocOpen,
  onTocOpenChange,
  tocListRef,
  currentChapter,
  onLocateCurrentChapter,
  onGoTo,
  onBack,
  onExpand,
  onCollapse,
  uiScheme,
  isDarkPreset,
  toolbarButtonClass,
  getToolbarButtonStyle,
  headerSafeAreaPaddingTop,
  overlayContainer,
  tts,
  theme,
  setTheme,
  themeSettingsOpen,
  onThemeSettingsOpenChange,
  isFullscreenSupported,
  isFullscreen,
  onToggleFullscreen,
}: ReaderToolbarProps) {
  return (
    <>
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
        <div className="flex h-11 items-center justify-between px-3 pointer-events-auto sm:h-12 sm:px-4">
          <div className="flex items-center gap-1 sm:gap-2">
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
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <ReaderTOCSheet
              open={tocOpen}
              onOpenChange={onTocOpenChange}
              toc={toc}
              tocListRef={tocListRef}
              currentChapter={currentChapter}
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
          </div>

          <span
            className="absolute left-1/2 max-w-[44%] -translate-x-1/2 truncate text-[13px] font-medium leading-none sm:max-w-[50%] sm:text-[14px]"
            style={{
              color: withOpacity(uiScheme.fg, isDarkPreset ? 0.7 : 0.65),
            }}
          >
            {bookTitle || "阅读中"}
          </span>

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
              isFullscreenSupported={isFullscreenSupported}
              isFullscreen={isFullscreen}
              onToggleFullscreen={onToggleFullscreen}
            />
            <button
              aria-label="收起顶部操作栏"
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-black/5"
              style={{ color: uiScheme.buttonText }}
              title="收起顶部操作栏"
              type="button"
              onClick={onCollapse}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {!visible && (
        <button
          aria-label="展开顶部操作栏"
          className="absolute right-1.5 z-50 flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-black/5 sm:right-2"
          data-reader-interactive="true"
          style={{
            top: `calc(${headerSafeAreaPaddingTop} + 0.25rem)`,
            background: "transparent",
            color: uiScheme.buttonText,
          }}
          title="展开顶部操作栏"
          type="button"
          onClick={onExpand}
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
