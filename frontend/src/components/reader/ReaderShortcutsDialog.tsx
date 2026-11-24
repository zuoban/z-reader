"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { ActionIcon, Kbd, Modal } from "@mantine/core";
import { Keyboard, X } from "lucide-react";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import { withOpacity } from "@/lib/reader-ui";

interface ShortcutItem {
  label: string;
  keys: string[];
}

const READER_SHORTCUTS: ShortcutItem[] = [
  { label: "上一页", keys: ["←", "PageUp", "K", "Shift + Space"] },
  { label: "下一页", keys: ["→", "PageDown", "J", "Space"] },
  { label: "切换全屏", keys: ["F"] },
  { label: "快捷键帮助", keys: ["?"] },
  { label: "退出全屏 / 关闭浮层 / 返回书库", keys: ["Esc"] },
];

interface ReaderShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
}

export function ReaderShortcutsDialog({
  open,
  onOpenChange,
  uiScheme,
  overlayContainer,
}: ReaderShortcutsDialogProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
      // Modal.Content forwards direct styling props to its viewport wrapper as well.
      classNames={{
        content: "overscroll-contain rounded-2xl border p-4 shadow-[var(--paper-shadow-floating)] sm:p-5",
      }}
      styles={{
        content: {
          background: uiScheme.cardBg,
          borderColor: withOpacity(uiScheme.cardBorder, 0.8),
          color: uiScheme.fg,
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
        <div
          className="flex items-center justify-between border-b pb-3.5"
          style={{ borderColor: withOpacity(uiScheme.cardBorder, 0.5) }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg border"
              style={{
                background: withOpacity(uiScheme.buttonBg, 0.7),
                borderColor: withOpacity(uiScheme.cardBorder, 0.6),
                color: uiScheme.fg,
              }}
            >
              <Keyboard className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div>
              <Modal.Title className="font-heading text-base font-medium leading-tight">
                键盘快捷键
              </Modal.Title>
              <p
                className="mt-0.5 text-xs"
                style={{ color: uiScheme.mutedText }}
              >
                阅读器支持的快捷操作
              </p>
            </div>
          </div>
          <ActionIcon
            variant="subtle"
            size={36}
            radius="md"
            data-autofocus
            onClick={() => onOpenChange(false)}
            aria-label="关闭快捷键帮助"
            className="border-0 bg-transparent shadow-none hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: uiScheme.mutedText }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        </div>

        <ul
          className="mt-3.5 divide-y"
          style={{ borderColor: withOpacity(uiScheme.cardBorder, 0.35) }}
        >
          {READER_SHORTCUTS.map((item) => (
            <li
              key={item.label}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]"
              style={{ borderColor: withOpacity(uiScheme.cardBorder, 0.35) }}
            >
              <span style={{ color: uiScheme.fg }}>{item.label}</span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {item.keys.map((keyLabel) => (
                  <Kbd
                    key={keyLabel}
                    size="xs"
                    className="inline-flex min-w-[1.6rem] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium leading-4"
                    style={{
                      background: withOpacity(uiScheme.buttonBg, 0.75),
                      borderColor: withOpacity(uiScheme.cardBorder, 0.75),
                      borderBottomWidth: 1,
                      color: uiScheme.fg,
                    }}
                  >
                    {keyLabel}
                  </Kbd>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Modal.Content>
    </Modal.Root>
  );
}
