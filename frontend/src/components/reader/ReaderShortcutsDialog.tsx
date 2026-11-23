"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Keyboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
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
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(open, dialogRef);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  const portalRoot =
    overlayContainer ?? (typeof document === "undefined" ? null : document.body);

  if (!portalRoot || !open) {
    return null;
  }

  return createPortal(
    <div
      data-reader-interactive="true"
      className="fixed inset-0 z-[var(--z-modal)] flex min-h-svh items-center justify-center p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div className="paper-motion-veil absolute inset-0 bg-black/42 backdrop-blur-[3px]" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="paper-motion-panel paper-texture relative z-10 w-full max-w-md overflow-hidden rounded-2xl border p-5 shadow-[0_24px_56px_-24px_rgba(0,0,0,0.45)] outline-none"
        style={{
          background: uiScheme.cardBg,
          borderColor: withOpacity(uiScheme.cardBorder, 0.8),
          color: uiScheme.fg,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b pb-3.5"
          style={{ borderColor: withOpacity(uiScheme.cardBorder, 0.5) }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl border"
              style={{
                background: withOpacity(uiScheme.buttonBg, 0.7),
                borderColor: withOpacity(uiScheme.cardBorder, 0.6),
                color: uiScheme.fg,
              }}
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={titleId}
                className="font-heading text-[15px] font-semibold leading-tight tracking-[-0.015em]"
              >
                键盘快捷键
              </h2>
              <p
                className="mt-0.5 text-xs"
                style={{ color: uiScheme.mutedText }}
              >
                阅读器支持的快捷操作
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="关闭快捷键帮助"
            className="h-9 w-9 rounded-lg border-0 bg-transparent shadow-none hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: uiScheme.mutedText }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <ul className="mt-3.5 divide-y" style={{ borderColor: withOpacity(uiScheme.cardBorder, 0.35) }}>
          {READER_SHORTCUTS.map((item) => (
            <li
              key={item.label}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]"
              style={{ borderColor: withOpacity(uiScheme.cardBorder, 0.35) }}
            >
              <span style={{ color: uiScheme.fg }}>{item.label}</span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {item.keys.map((keyLabel) => (
                  <kbd
                    key={keyLabel}
                    className="inline-flex min-w-[1.6rem] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium leading-4"
                    style={{
                      background: withOpacity(uiScheme.buttonBg, 0.75),
                      borderColor: withOpacity(uiScheme.cardBorder, 0.75),
                      color: uiScheme.fg,
                    }}
                  >
                    {keyLabel}
                  </kbd>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    portalRoot
  );
}
