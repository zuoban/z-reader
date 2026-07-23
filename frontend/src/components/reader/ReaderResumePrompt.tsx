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
    background: `
      linear-gradient(145deg, ${withOpacity(uiScheme.link, 0.08)} 0%, transparent 42%),
      ${withOpacity(uiScheme.cardBg, 0.92)}
    `,
    border: `1px solid ${withOpacity(uiScheme.link, 0.22)}`,
    boxShadow: `
      0 18px 40px -24px ${withOpacity(uiScheme.link, 0.38)},
      0 8px 18px -14px ${withOpacity(uiScheme.fg, 0.12)},
      inset 0 1px 0 rgba(255,255,255,0.26)
    `,
    backdropFilter: "blur(16px) saturate(1.15)",
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
        className="reading-status-panel pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-3.5 py-3 sm:px-4"
        style={cardStyle}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: withOpacity(uiScheme.link, 0.12),
            color: uiScheme.link,
          }}
        >
          <AlertCircle className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight" style={{ color: uiScheme.fg }}>
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
            border: `1px solid ${withOpacity(uiScheme.link, 0.2)}`,
            background: withOpacity(uiScheme.buttonBg, 0.35),
          }}
        >
          继续
        </Button>
      </div>
    </div>
  );
}
