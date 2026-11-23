"use client";

import type { CSSProperties } from "react";
import { ActionIcon, Drawer, Kbd } from "@mantine/core";
import { Keyboard, X } from "lucide-react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import { getModernReaderSurface, withOpacity } from "@/lib/reader-ui";
import { cn } from "@/lib/utils";

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
    <Kbd
      size="xs"
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 font-mono text-[11px] font-medium tabular-nums"
      style={{
        background: withOpacity(uiScheme.buttonBg, 0.8),
        border: `1px solid ${withOpacity(uiScheme.cardBorder, 0.65)}`,
        borderBottomWidth: 1,
        color: uiScheme.fg,
      }}
    >
      {value}
    </Kbd>
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
    <>
      <ActionIcon
        type="button"
        variant="subtle"
        size={36}
        radius="md"
        title="键盘快捷键"
        aria-label="键盘快捷键"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn("min-h-0 min-w-0", triggerClassName)}
        style={triggerStyle}
        onClick={() => onOpenChange(!open)}
      >
        <Keyboard className="h-4 w-4" />
      </ActionIcon>

      <Drawer.Root
        opened={open}
        onClose={() => onOpenChange(false)}
        position="bottom"
        size="auto"
        padding={0}
        zIndex={90}
        returnFocus={false}
        portalProps={{ target: overlayContainer ?? undefined }}
        classNames={{
          inner:
            "items-end justify-center px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-3 sm:pb-10",
          content:
            "app-sheet-shell flex max-h-[min(88svh,38rem)] w-full flex-col overflow-hidden rounded-2xl border p-0 sm:max-h-[min(74svh,34rem)] sm:w-[460px] sm:max-w-[calc(100vw-2rem)]",
        }}
        styles={{
          content: {
            flex: "0 1 auto",
            height: "auto",
            background: surface.bg,
            borderColor: surface.border,
            color: surface.fg,
            boxShadow: surface.shadow,
            backdropFilter: "blur(14px)",
          },
        }}
      >
        <Drawer.Overlay backgroundOpacity={0.42} blur={3} />
        <Drawer.Content data-reader-interactive="true">
          <div className="flex justify-center pb-1 pt-2.5">
            <div
              className="h-1 w-9 rounded-full"
              style={{ background: surface.hairline }}
            />
          </div>
          <div
            className="app-sheet-header shrink-0 px-5 pb-3 pt-2 sm:px-6"
            style={{
              background: "transparent",
              borderBottom: `1px solid ${surface.hairline}`,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: surface.surfaceSoft,
                    color: surface.fg,
                  }}
                >
                  <Keyboard className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <Drawer.Title
                    className="font-heading text-lg font-medium"
                    style={{ color: surface.fg }}
                  >
                    键盘快捷键
                  </Drawer.Title>
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: surface.muted }}
                  >
                    用键盘保持阅读节奏
                  </p>
                </div>
              </div>
              <ActionIcon
                variant="subtle"
                size={36}
                radius="md"
                onClick={() => onOpenChange(false)}
                className="h-9 w-9 shrink-0 rounded-lg border-0 transition-colors hover:brightness-[0.985] active:scale-95"
                style={{
                  color: surface.muted,
                  background: surface.surfaceSoft,
                }}
                aria-label="关闭快捷键"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </ActionIcon>
            </div>
          </div>

          <div className="app-sheet-body space-y-5 px-5 py-5 sm:px-6">
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.title} className="space-y-2.5">
                <h3
                  className="text-xs font-medium"
                  style={{ color: surface.muted }}
                >
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border p-3.5"
                      style={{
                        background: surface.surfaceSoft,
                        borderColor: surface.hairline,
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.keys.map((key) => (
                          <KeyCap key={key} value={key} uiScheme={uiScheme} />
                        ))}
                      </div>
                      <p
                        className="mt-2 text-sm font-medium"
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
        </Drawer.Content>
      </Drawer.Root>
    </>
  );
}
