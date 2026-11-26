"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Modal } from "@mantine/core";
import "@/app/styles/mantine-modal.css";
import { Keyboard, X } from "lucide-react";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import { getModernReaderSurface, getReaderPanelThemeVars } from "@/lib/reader-ui";

interface ShortcutItem {
  label: string;
  keys: string[];
}

interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

function getReaderShortcutGroups(
  isFullscreenSupported: boolean,
  showBookmarksShortcut: boolean,
): ShortcutGroup[] {
  const overlayItems: ShortcutItem[] = [
    { label: "目录", keys: ["T"] },
    ...(showBookmarksShortcut ? [{ label: "书签", keys: ["B"] }] : []),
    { label: "排版与外观", keys: ["S"] },
    { label: "书内搜索", keys: ["⌘/Ctrl + F"] },
    ...(isFullscreenSupported ? [{ label: "切换全屏", keys: ["F"] }] : []),
    { label: "图片预览缩放", keys: ["+", "-", "0"] },
    { label: "快捷键帮助", keys: ["?"] },
    {
      label: isFullscreenSupported
        ? "退出全屏 / 关闭浮层 / 返回书库"
        : "关闭浮层 / 返回书库",
      keys: ["Esc"],
    },
  ];

  return [
    {
      title: "翻页导航",
      items: [
        { label: "上一页", keys: ["←", "PageUp", "K", "Shift + Space"] },
        { label: "下一页", keys: ["→", "PageDown", "J", "Space"] },
      ],
    },
    {
      title: "视图与浮层",
      items: overlayItems,
    },
  ];
}

interface ReaderShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
  isFullscreenSupported?: boolean;
  showBookmarksShortcut?: boolean;
}

export function ReaderShortcutsDialog({
  open,
  onOpenChange,
  uiScheme,
  overlayContainer,
  isFullscreenSupported = true,
  showBookmarksShortcut = true,
}: ReaderShortcutsDialogProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);
  const shortcutGroups = getReaderShortcutGroups(
    isFullscreenSupported,
    showBookmarksShortcut,
  );

  useLayoutEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        onOpenChange(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  return (
    <Modal.Root
      opened={open}
      onClose={() => onOpenChange(false)}
      centered
      size="md"
      radius="lg"
      padding={0}
      zIndex={80}
      trapFocus
      returnFocus={false}
      closeOnEscape={false}
      closeOnClickOutside
      portalProps={{ target: overlayContainer ?? undefined }}
      classNames={{
        inner:
          "pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
        content:
          "flex max-h-[min(82svh,36rem)] flex-col overflow-hidden rounded-2xl border p-0",
      }}
      styles={{
        content: {
          ...panelThemeVars,
          background: uiScheme.cardBg,
          borderColor: surface.border,
          color: surface.fg,
          boxShadow: "var(--paper-shadow-floating)",
        },
      }}
      data-reader-interactive="true"
    >
      <Modal.Overlay
        role="presentation"
        backgroundOpacity={0.42}
        blur={3}
      />
      <Modal.Content data-reader-interactive="true">
        <div className="reader-panel-header flex shrink-0 items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
              style={{
                background: "color-mix(in srgb, var(--reader-panel-hover) 68%, transparent)",
                borderColor: "var(--reader-panel-rule)",
                color: "var(--reader-panel-fg)",
              }}
            >
              <Keyboard className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <Modal.Title
                className="font-heading text-base font-medium leading-tight"
                style={{ color: surface.fg }}
              >
                键盘快捷键
              </Modal.Title>
              <p
                className="mt-0.5 text-xs leading-5"
                style={{ color: surface.muted }}
              >
                阅读器支持的快捷操作
              </p>
            </div>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={() => onOpenChange(false)}
            aria-label="关闭快捷键帮助"
            title="关闭 (Esc)"
            className="reader-panel-icon"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="reader-panel-body custom-scrollbar space-y-4 px-4 py-3.5 sm:px-5">
          {shortcutGroups.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3
                className="mb-1.5 text-[11px] font-medium tracking-[0.06em]"
                style={{ color: surface.muted }}
              >
                {group.title}
              </h3>
              <ul
                className="divide-y rounded-xl border px-3.5"
                style={{
                  borderColor: surface.hairline,
                  background: "color-mix(in srgb, var(--reader-panel-hover) 32%, transparent)",
                }}
              >
                {group.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]"
                    style={{ borderColor: surface.hairline }}
                  >
                    <span style={{ color: surface.fg }}>{item.label}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {item.keys.map((keyLabel) => (
                        <kbd key={keyLabel} className="reader-kbd">
                          {keyLabel}
                        </kbd>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div
          className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5 text-xs sm:px-5"
          style={{
            borderColor: surface.hairline,
            color: surface.muted,
          }}
        >
          <span>阅读正文时随时可用</span>
          <span>按 ? 或 Esc 随时关闭</span>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
