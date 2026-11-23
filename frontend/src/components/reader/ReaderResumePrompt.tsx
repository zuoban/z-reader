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
    background: withOpacity(uiScheme.cardBg, 0.96),
    border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.8)}`,
    boxShadow: `0 12px 32px -16px ${withOpacity(uiScheme.fg, 0.28)}`,
    backdropFilter: "blur(12px)",
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
        className="reading-status-panel pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl px-3.5 py-3 sm:px-4"
        style={cardStyle}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: withOpacity(uiScheme.link, 0.12),
            color: uiScheme.link,
          }}
        >
          <AlertCircle className="h-4.5 w-4.5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: uiScheme.fg }}>
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
          className="h-9 shrink-0 rounded-lg px-3.5 text-sm font-medium"
          style={{
            color: uiScheme.link,
            border: `1px solid ${withOpacity(uiScheme.link, 0.28)}`,
            background: withOpacity(uiScheme.buttonBg, 0.5),
          }}
        >
          继续
        </Button>
      </div>
    </div>
  );
}
