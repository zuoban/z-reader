"use client";

import { lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { TTSSettings, TTSState, Voice } from "@/lib/tts";
import { withOpacity } from "@/lib/reader-ui";

const TTSControls = lazy(() =>
  import("@/components/TTSControls").then((m) => ({ default: m.TTSControls })),
);

interface ReaderStatusBarProps {
  percentage: number;
  currentChapter: string;
  currentPageLabel: string;
  containerStyle: CSSProperties;
  safeAreaPaddingBottom: string;
  uiScheme: ThemeColors;
  toolbarVisible: boolean;
  onToggleToolbar: () => void;
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
}

export function ReaderStatusBar({
  percentage,
  currentChapter,
  currentPageLabel,
  containerStyle,
  safeAreaPaddingBottom,
  uiScheme,
  toolbarVisible,
  onToggleToolbar,
  overlayContainer,
  tts,
}: ReaderStatusBarProps) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex justify-center"
      style={{
        paddingBottom: safeAreaPaddingBottom,
        ...containerStyle,
      }}
    >
      <div className="relative flex h-9 w-full items-center px-4 text-[11px] font-medium sm:px-6 sm:text-[12px]">
        <div className="flex w-24 shrink-0 items-center gap-2">
          <button
            aria-label={toolbarVisible ? "收起顶部操作栏" : "展开顶部操作栏"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-black/5"
            data-reader-interactive="true"
            style={{ color: withOpacity(uiScheme.fg, 0.6) }}
            title={toolbarVisible ? "收起顶部操作栏" : "展开顶部操作栏"}
            type="button"
            onClick={onToggleToolbar}
          >
            {toolbarVisible ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <span
            className="font-mono font-bold tabular-nums tracking-tight"
            style={{ color: withOpacity(uiScheme.fg, 0.6) }}
          >
            {percentage.toFixed(1)}%
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center truncate px-4 text-center">
          <span
            className="truncate font-bold tracking-tight"
            style={{ color: withOpacity(uiScheme.fg, 0.5) }}
          >
            {currentChapter || "—"}
          </span>
        </div>

        <div className="flex w-24 shrink-0 items-center justify-end gap-2">
          <span
            className="font-mono font-bold tabular-nums tracking-tight"
            style={{ color: withOpacity(uiScheme.fg, 0.6) }}
          >
            {currentPageLabel || "—"}
          </span>
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
              triggerClassName="relative flex h-7 w-7 min-h-7 min-w-7 items-center justify-center rounded-lg p-0 transition-colors duration-150 ease-out hover:bg-black/5"
              triggerStyle={{
                color: tts.state !== "stopped" ? uiScheme.link : withOpacity(uiScheme.fg, 0.6),
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
        </div>
      </div>
    </div>
  );
}
