"use client";

import type { CSSProperties, RefObject } from "react";
import { List, LocateFixed, X } from "lucide-react";

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            title="目录"
            className={triggerClassName}
            style={triggerStyle}
          />
        }
      >
        {trigger || <List className="h-4 w-4" />}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        finalFocus={false}
        container={overlayContainer}
        className="reader-panel border p-0 sm:w-[560px] sm:max-w-[calc(100vw-2rem)]"
        style={{
          background: uiScheme.cardBg,
          borderColor: surface.border,
          color: surface.fg,
        }}
      >
        <SheetHeader
          className="shrink-0 bg-transparent px-4 py-3 sm:px-6"
          style={{ borderColor: surface.hairline }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <SheetTitle className="text-xl font-medium" style={{ color: surface.fg }}>
                  目录
                </SheetTitle>
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
                <SheetDescription
                  className="truncate text-xs leading-5"
                  style={{ color: surface.muted }}
                  title={bookTitle || "当前书籍"}
                >
                  {bookTitle || "当前书籍"}
                </SheetDescription>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={onLocateCurrent}
                disabled={!currentChapter}
                title={
                  currentChapter
                    ? `定位到当前章节：${currentChapter}`
                    : "暂未识别当前章节"
                }
                className="size-11 rounded-lg border-0 transition-colors hover:bg-secondary lg:size-9 disabled:opacity-35"
                style={{
                  color: surface.fg,
                }}
              >
                <LocateFixed className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                title="关闭目录"
                className="size-11 rounded-lg border-0 transition-colors hover:bg-secondary lg:size-9"
                style={{
                  color: surface.muted,
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

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
      </SheetContent>
    </Sheet>
  );
}
