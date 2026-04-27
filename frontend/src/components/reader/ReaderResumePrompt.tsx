"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import { withOpacity } from "@/lib/reader-ui";

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
  const cardStyle = {
    background: uiScheme.cardBg,
    border: `1px solid ${withOpacity(uiScheme.link, 0.24)}`,
    boxShadow: `0 18px 36px -24px ${withOpacity(uiScheme.link, 0.42)}, inset 0 1px 0 rgba(255,255,255,0.28)`,
  };

  return (
    <div
      data-reader-interactive="true"
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4 sm:hidden"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 3.25rem)",
      }}
    >
      <div
        className="reading-status-panel pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[1.5rem] px-4 py-3"
        style={cardStyle}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{
            background: withOpacity(uiScheme.link, 0.14),
            color: uiScheme.link,
          }}
        >
          <AlertCircle className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: uiScheme.fg }}>
            朗读已暂停
          </p>
          <p
            className="mt-0.5 line-clamp-2 text-xs leading-5"
            style={{ color: uiScheme.mutedText }}
          >
            {message}
          </p>
        </div>
        <Button
          data-reader-interactive="true"
          variant="outline"
          size="sm"
          onClick={() => void onResume()}
          className="h-10 shrink-0 rounded-xl px-3.5 text-sm font-semibold"
          style={{
            color: uiScheme.link,
            border: `1px solid ${withOpacity(uiScheme.link, 0.18)}`,
          }}
        >
          继续
        </Button>
      </div>
    </div>
  );
}
