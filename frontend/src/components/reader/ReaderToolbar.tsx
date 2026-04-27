"use client";

import { lazy, Suspense } from "react";
import type { CSSProperties, RefObject } from "react";
import { ChevronLeft } from "lucide-react";

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
  uiScheme: ThemeColors;
  isDarkPreset: boolean;
  toolbarButtonClass: string;
  toolbarStyle: CSSProperties;
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
  uiScheme,
  isDarkPreset,
  toolbarButtonClass,
  toolbarStyle,
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
          "transform 500ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <div className="flex justify-center px-3 pt-2 sm:px-4 sm:pt-3">
        <div
          className="pointer-events-auto grid h-[3.25rem] w-full max-w-xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-[1.25rem] px-1.5 py-1 sm:h-[3.75rem] sm:max-w-2xl sm:gap-2 sm:rounded-[1.5rem] sm:px-2"
          style={toolbarStyle}
        >
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              title="返回书库"
              className={toolbarButtonClass}
              style={getToolbarButtonStyle(false)}
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
              triggerStyle={getToolbarButtonStyle(tocOpen)}
              onLocateCurrent={onLocateCurrentChapter}
              onGoTo={onGoTo}
            />
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center px-2 sm:px-4">
            <span
              className="truncate text-[13px] font-semibold leading-none sm:text-[14px]"
              style={{
                color: withOpacity(uiScheme.fg, isDarkPreset ? 0.78 : 0.72),
              }}
            >
              {bookTitle || "阅读中"}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
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
                  border: "1px solid transparent",
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
              triggerStyle={getToolbarButtonStyle(themeSettingsOpen)}
              isFullscreenSupported={isFullscreenSupported}
              isFullscreen={isFullscreen}
              onToggleFullscreen={onToggleFullscreen}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
