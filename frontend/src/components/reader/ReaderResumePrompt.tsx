"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Volume2 } from "lucide-react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import { getModernReaderSurface, getReaderPanelThemeVars } from "@/lib/reader-ui";

interface ReaderResumePromptProps {
  message: string;
  uiScheme: ThemeColors;
  onResume: () => void | Promise<void>;
}

export function ReaderResumePrompt({
  message,
  uiScheme,
  onResume,
}: ReaderResumePromptProps) {
  const [isResuming, setIsResuming] = useState(false);
  const mountedRef = useRef(true);
  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleResume() {
    if (isResuming) return;
    setIsResuming(true);
    try {
      await onResume();
    } finally {
      if (mountedRef.current) {
        setIsResuming(false);
      }
    }
  }

  return (
    <div
      data-reader-interactive="true"
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]"
      style={{
        bottom: "calc(var(--status-bar-reserved) + 0.75rem)",
      }}
    >
      <div
        className="reader-resume-card paper-reveal-soft pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-3.5 py-3 sm:px-4"
        style={panelThemeVars}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{
            background: "color-mix(in srgb, var(--reader-panel-accent) 11%, transparent)",
            borderColor: "color-mix(in srgb, var(--reader-panel-accent) 22%, transparent)",
            color: "var(--reader-panel-accent)",
          }}
        >
          <Volume2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5" style={{ color: surface.fg }}>
            朗读已暂停
          </p>
          <p
            className="mt-0.5 line-clamp-2 text-xs leading-5"
            style={{ color: surface.muted }}
          >
            {message}
          </p>
        </div>
        <button
          type="button"
          data-reader-interactive="true"
          disabled={isResuming}
          aria-busy={isResuming || undefined}
          onClick={() => void handleResume()}
          className="reader-panel-action h-10 px-3.5 text-sm sm:h-9 lg:h-9"
        >
          {isResuming ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          )}
          <span>{isResuming ? "恢复中…" : "继续"}</span>
        </button>
      </div>
    </div>
  );
}
