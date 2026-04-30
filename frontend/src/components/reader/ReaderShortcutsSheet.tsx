"use client";

import { Keyboard } from "lucide-react";
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
        background: withOpacity(uiScheme.buttonBg, 0.72),
        border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.26)}`,
        color: uiScheme.fg,
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
        showCloseButton
        finalFocus={false}
        container={overlayContainer}
        className="mx-auto flex flex-col p-0 bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 rounded-[2rem] border shadow-2xl sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
        style={{
          background: uiScheme.cardBg,
          borderColor: withOpacity(uiScheme.cardBorder, 0.22),
          color: uiScheme.fg,
          boxShadow: `0 -12px 48px -12px ${withOpacity(uiScheme.cardBorder, 0.35)}`,
        }}
      >
        <SheetHeader className="relative overflow-hidden border-b-0 px-8 pb-4 pt-10 pr-24">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
              <Keyboard className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-2xl font-bold tracking-tight" style={{ color: uiScheme.fg }}>
                键盘快捷键
              </SheetTitle>
              <SheetDescription
                className="mt-1 text-xs font-medium opacity-60"
                style={{ color: uiScheme.mutedText }}
              >
                用键盘保持阅读节奏
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 overflow-y-auto px-8 pb-10 pt-4">
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
                    className="rounded-[1.25rem] border p-3"
                    style={{
                      background: withOpacity(uiScheme.buttonBg, 0.22),
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
