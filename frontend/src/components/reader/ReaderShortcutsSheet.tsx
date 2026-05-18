"use client";

import { Keyboard, X } from "lucide-react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import { withOpacity } from "@/lib/reader-ui";

interface ReaderShortcutsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}

const SHORTCUT_GROUPS = [
  {
    title: "翻页",
    items: [
      { keys: ["→", "PageDown", "J", "Space"], label: "下一页" },
      { keys: ["←", "PageUp", "K", "Shift Space"], label: "上一页" },
    ],
  },
  {
    title: "阅读器",
    items: [
      { keys: ["F"], label: "进入或退出全屏" },
      { keys: ["Esc"], label: "退出全屏，或返回书架" },
    ],
  },
];

function KeyCap({ value, uiScheme }: { value: string; uiScheme: ThemeColors }) {
  return (
    <kbd
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-[11px] font-black tabular-nums shadow-sm"
      style={{
        background:
          `linear-gradient(135deg, ${withOpacity(uiScheme.fg, 0.06)} 0%, transparent 34%), ${withOpacity(uiScheme.buttonBg, 0.58)}`,
        border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.26)}`,
        color: uiScheme.fg,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 16px -14px ${withOpacity(uiScheme.fg, 0.22)}`,
      }}
    >
      {value}
    </kbd>
  );
}

export function ReaderShortcutsSheet({
  open,
  onOpenChange,
  uiScheme,
  overlayContainer,
  triggerClassName,
  triggerStyle,
}: ReaderShortcutsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            title="键盘快捷键"
            aria-label="键盘快捷键"
            className={triggerClassName}
            style={triggerStyle}
          />
        }
      >
        <Keyboard className="h-4 w-4" />
      </SheetTrigger>

      <SheetContent
        side="bottom"
        showCloseButton={false}
        finalFocus={false}
        container={overlayContainer}
        className="app-sheet-shell mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex max-h-[min(90svh,42rem)] flex-col rounded-[1.75rem] border p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[440px] sm:-translate-x-1/2"
        style={{
          background:
            `linear-gradient(135deg, ${withOpacity(uiScheme.fg, 0.055)} 0%, transparent 34%), ${withOpacity(uiScheme.cardBg, 0.9)}`,
          borderColor: withOpacity(uiScheme.cardBorder, 0.22),
          color: uiScheme.fg,
          boxShadow: `0 -12px 48px -12px ${withOpacity(uiScheme.cardBorder, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.32)`,
        }}
      >
        <SheetHeader className="app-sheet-header shrink-0 px-6 pb-5 pt-7 sm:px-7 sm:pt-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  background: withOpacity(uiScheme.buttonBg, 0.2),
                  borderColor: withOpacity(uiScheme.cardBorder, 0.14),
                  color: uiScheme.link,
                }}
              >
                <Keyboard className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-xl font-semibold tracking-tight" style={{ color: uiScheme.fg }}>
                  键盘快捷键
                </SheetTitle>
                <SheetDescription
                  className="mt-1 text-xs font-medium"
                  style={{ color: uiScheme.mutedText }}
                >
                  用键盘保持阅读节奏
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-[transform,background-color,border-color,color] hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              style={{
                color: withOpacity(uiScheme.fg, 0.62),
                background: withOpacity(uiScheme.buttonBg, 0.18),
                borderColor: withOpacity(uiScheme.cardBorder, 0.14),
              }}
              aria-label="关闭快捷键"
              title="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </SheetHeader>

        <div className="app-sheet-body space-y-5 px-6 py-5 sm:px-7">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="space-y-3">
              <h3
                className="text-[11px] font-black uppercase tracking-[0.16em]"
                style={{ color: withOpacity(uiScheme.fg, 0.48) }}
              >
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1.25rem] border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] "
                    style={{
                      background:
                        `linear-gradient(135deg, ${withOpacity(uiScheme.fg, 0.04)} 0%, transparent 34%), ${withOpacity(uiScheme.buttonBg, 0.24)}`,
                      borderColor: withOpacity(uiScheme.cardBorder, 0.14),
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {item.keys.map((key) => (
                        <KeyCap key={key} value={key} uiScheme={uiScheme} />
                      ))}
                    </div>
                    <p className="mt-2 text-sm font-bold" style={{ color: uiScheme.fg }}>
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
