"use client";

import { ActionIcon, UnstyledButton } from "@mantine/core";
import { Loader2, Volume2 } from "lucide-react";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { TTSState } from "@/lib/tts";

export type ReaderTTSSlot = "desktop-toolbar" | "mobile-menu" | "status-bar";

interface ReaderTTSControlTriggerProps {
  slot: ReaderTTSSlot;
  expanded: boolean;
  state: TTSState;
  isLoading?: boolean;
  uiScheme: ThemeColors;
  onClick: () => void;
}

export function ReaderTTSControlTrigger({
  slot,
  expanded,
  state,
  isLoading = false,
  uiScheme,
  onClick,
}: ReaderTTSControlTriggerProps) {
  const isActive = state !== "stopped";
  const label = isLoading
    ? "正在加载朗读控制"
    : isActive
      ? "朗读控制（正在播放）"
      : "朗读控制";

  const sharedProps = {
    type: "button" as const,
    disabled: isLoading,
    "data-reader-interactive": "true",
    "data-reader-tts-trigger": "true",
    "data-reader-tts-active": isActive ? "true" : undefined,
    title: isLoading ? "正在加载朗读控制…" : label,
    "aria-label": label,
    "aria-busy": isLoading || undefined,
    "aria-expanded": expanded,
    "aria-haspopup": "dialog" as const,
    onClick,
  };

  if (slot === "status-bar") {
    return (
      <ActionIcon
        {...sharedProps}
        variant="subtle"
        size={44}
        radius="md"
        className="min-h-0 min-w-0 reader-status-action [&_svg]:size-3.5"
        style={isActive ? { color: uiScheme.link } : {}}
      >
        {isLoading ? (
          <Loader2
            className="relative z-10 h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <Volume2 className="relative z-10 h-4 w-4" aria-hidden="true" />
        )}
      </ActionIcon>
    );
  }

  const isMobileMenu = slot === "mobile-menu";

  return (
    <UnstyledButton
      {...sharedProps}
      className={
        isMobileMenu
          ? "reader-mobile-menu-item h-auto justify-start gap-3 border-0 px-3 py-2.5 text-sm font-medium"
          : "reader-chrome-btn"
      }
    >
      {isLoading ? (
        <>
          <Loader2
            className={
              isMobileMenu
                ? "h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                : "size-4 animate-spin motion-reduce:animate-none"
            }
            strokeWidth={isMobileMenu ? undefined : 1.6}
            aria-hidden="true"
          />
          <span className={isMobileMenu ? undefined : "sr-only"}>
            {isMobileMenu ? "加载中…" : "正在加载朗读控制"}
          </span>
        </>
      ) : (
        <>
          <Volume2
            className={isMobileMenu ? "size-4 opacity-80" : "size-4"}
            strokeWidth={isMobileMenu ? undefined : 1.6}
            aria-hidden="true"
          />
          <span className={isMobileMenu ? undefined : "sr-only"}>朗读</span>
        </>
      )}
    </UnstyledButton>
  );
}
