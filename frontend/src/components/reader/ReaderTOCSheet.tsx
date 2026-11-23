"use client";

import type { CSSProperties, RefObject } from "react";
import { ActionIcon, Button, Drawer } from "@mantine/core";
import { List, LocateFixed, X } from "lucide-react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { TOCItem } from "@/lib/types";
import { getModernReaderSurface } from "@/lib/reader-ui";
import { MemoizedReaderTOCNode } from "@/components/reader/ReaderTOCNode";

interface ReaderTOCSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toc: TOCItem[];
  bookTitle: string;
  bookAuthor: string;
  tocListRef: RefObject<HTMLDivElement | null>;
  currentChapter: string;
  currentChapterHref: string;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
  triggerClassName: string;
  triggerStyle: CSSProperties;
  onLocateCurrent: () => void;
  onGoTo: (href: string) => void;
  trigger?: React.ReactNode;
}

export function ReaderTOCSheet({
  open,
  onOpenChange,
  toc,
  bookTitle,
  bookAuthor,
  tocListRef,
  currentChapter,
  currentChapterHref,
  uiScheme,
  overlayContainer,
  triggerClassName,
  triggerStyle,
  onLocateCurrent,
  onGoTo,
  trigger,
}: ReaderTOCSheetProps) {
  const surface = getModernReaderSurface(uiScheme);

  return (
    <>
      <Button
        type="button"
        variant="subtle"
        title="目录"
        aria-label={trigger ? undefined : "目录"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={triggerClassName}
        style={triggerStyle}
        onClick={() => onOpenChange(!open)}
      >
        {trigger || <List className="h-4 w-4" />}
      </Button>

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
            "items-end justify-center px-[max(0.75rem,env(safe-area-inset-left,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]",
          content:
            "reader-panel flex max-h-[min(42rem,calc(100svh-1.5rem))] w-full flex-col overflow-hidden rounded-2xl border p-0 sm:max-h-[min(78svh,42rem)] sm:w-[560px] sm:max-w-[calc(100vw-2rem)]",
        }}
        styles={{
          content: {
            flex: "0 1 auto",
            height: "auto",
            background: uiScheme.cardBg,
            borderColor: surface.border,
            color: surface.fg,
            boxShadow: "var(--paper-shadow-floating)",
          },
        }}
      >
        <Drawer.Overlay backgroundOpacity={0.42} blur={3} />
        <Drawer.Content data-reader-interactive="true">
          <div
            className="shrink-0 bg-transparent px-4 py-3 sm:px-6"
            style={{ borderColor: surface.hairline }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Drawer.Title
                    className="text-xl font-medium"
                    style={{ color: surface.fg }}
                  >
                    目录
                  </Drawer.Title>
                  {toc.length > 0 ? (
                    <span
                      className="text-xs font-medium tabular-nums"
                      style={{ color: surface.muted }}
                    >
                      {toc.length}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-0.5">
                  <p
                    className="truncate text-xs leading-5"
                    style={{ color: surface.muted }}
                    title={bookTitle || "当前书籍"}
                  >
                    {bookTitle || "当前书籍"}
                  </p>
                  {bookAuthor ? (
                    <p
                      className="truncate text-[11px]"
                      style={{ color: surface.muted }}
                      title={bookAuthor}
                    >
                      {bookAuthor}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <ActionIcon
                  variant="subtle"
                  size={44}
                  radius="md"
                  onClick={onLocateCurrent}
                  disabled={!currentChapter}
                  title={
                    currentChapter
                      ? `定位到当前章节：${currentChapter}`
                      : "暂未识别当前章节"
                  }
                  aria-label={
                    currentChapter
                      ? `定位到当前章节：${currentChapter}`
                      : "暂未识别当前章节"
                  }
                  className="size-11 min-h-0 min-w-0 rounded-lg border-0 transition-colors hover:bg-secondary lg:size-9 disabled:opacity-35"
                  style={{
                    color: surface.fg,
                  }}
                >
                  <LocateFixed className="h-4 w-4" strokeWidth={1.5} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size={44}
                  radius="md"
                  onClick={() => onOpenChange(false)}
                  title="关闭目录"
                  aria-label="关闭目录"
                  className="size-11 min-h-0 min-w-0 rounded-lg border-0 transition-colors hover:bg-secondary lg:size-9"
                  style={{
                    color: surface.muted,
                  }}
                >
                  <X className="h-4 w-4" />
                </ActionIcon>
              </div>
            </div>
          </div>

          <div className="reader-panel-body custom-scrollbar px-4 py-2 sm:px-6">
            <div ref={tocListRef} className="space-y-0.5">
              {toc.length > 0 ? (
                toc.map((item, idx) => (
                  <MemoizedReaderTOCNode
                    key={idx}
                    item={item}
                    onGoTo={(href) => {
                      onGoTo(href);
                      onOpenChange(false);
                    }}
                    currentChapter={currentChapter}
                    currentChapterHref={currentChapterHref}
                    uiScheme={uiScheme}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                  <div
                    className="mb-4 flex size-8 items-center justify-center"
                    style={{
                      color: surface.fg,
                    }}
                  >
                    <List className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <p
                    className="text-sm font-semibold tracking-tight"
                    style={{ color: surface.fg }}
                  >
                    未检测到目录结构
                  </p>
                  <p
                    className="mt-1.5 max-w-[16rem] text-xs leading-5"
                    style={{ color: surface.muted }}
                  >
                    该书籍可能没有定义标准目录，仍可通过翻页阅读
                  </p>
                </div>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Root>
    </>
  );
}
