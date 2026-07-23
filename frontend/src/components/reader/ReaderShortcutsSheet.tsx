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
import { getModernReaderSurface, withOpacity } from "@/lib/reader-ui";

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
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-[11px] font-semibold tabular-nums tracking-tight"
      style={{
        background: `
          linear-gradient(145deg, ${withOpacity(uiScheme.fg, 0.05)} 0%, transparent 42%),
          ${withOpacity(uiScheme.buttonBg, 0.62)}
        `,
        border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.28)}`,
        color: uiScheme.fg,
        boxShadow: `
          inset 0 1px 0 ${withOpacity("#ffffff", 0.16)},
          0 6px 14px -12px ${withOpacity(uiScheme.fg, 0.28)}
        `,
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
  const surface = getModernReaderSurface(uiScheme);

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
        className="app-sheet-shell reader-bottom-sheet-centered mx-auto bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] left-3 right-3 flex max-h-[min(88svh,38rem)] flex-col overflow-hidden rounded-[1.5rem] p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:w-[460px] sm:max-w-[calc(100vw-2rem)] data-[side=bottom]:sm:max-h-[min(74svh,34rem)] sm:-translate-x-1/2 sm:rounded-[1.65rem]"
        style={{
          background: surface.bg,
          borderColor: surface.border,
          color: surface.fg,
          boxShadow: surface.shadow,
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <div
            className="h-1 w-9 rounded-full"
            style={{ background: surface.hairline }}
          />
        </div>
        <SheetHeader
          className="app-sheet-header shrink-0 px-5 pb-3 pt-2 sm:px-6"
          style={{
            background: "transparent",
            borderBottom: `1px solid ${surface.hairline}`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: surface.surfaceSoft,
                  color: surface.fg,
                }}
              >
                <Keyboard className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg font-semibold tracking-tight" style={{ color: surface.fg }}>
                  键盘快捷键
                </SheetTitle>
                <SheetDescription
                  className="mt-1 text-xs font-medium"
                  style={{ color: surface.muted }}
                >
                  用键盘保持阅读节奏
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 transition-colors hover:brightness-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-95"
              style={{
                color: surface.muted,
                background: surface.surfaceSoft,
              }}
              aria-label="关闭快捷键"
              title="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </SheetHeader>

        <div className="app-sheet-body space-y-5 px-5 py-5 sm:px-6">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="space-y-2.5">
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: withOpacity(uiScheme.fg, 0.48) }}
              >
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl p-3.5"
                    style={{
                      background: `
                        linear-gradient(180deg, ${withOpacity(uiScheme.fg, 0.03)} 0%, transparent 55%),
                        ${surface.surfaceSoft}
                      `,
                      boxShadow: `
                        inset 0 0 0 1px ${surface.hairline},
                        inset 0 1px 0 ${withOpacity("#ffffff", 0.08)}
                      `,
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.keys.map((key) => (
                        <KeyCap key={key} value={key} uiScheme={uiScheme} />
                      ))}
                    </div>
                    <p
                      className="mt-2.5 text-sm font-semibold tracking-tight"
                      style={{ color: uiScheme.fg }}
                    >
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
