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
import { withOpacity } from "@/lib/reader-ui";
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
        side="left"
        showCloseButton={false}
        finalFocus={false}
        container={overlayContainer}
        className="app-sheet-shell flex h-[100svh] w-[292px] flex-col border-r p-0 !sm:top-0 !sm:bottom-0 !sm:h-[100svh] !sm:max-h-[100svh] !sm:rounded-none sm:w-[344px] sm:!border-y-0 sm:!border-l-0"
        style={{
          background: `linear-gradient(180deg, ${withOpacity(uiScheme.bg, 0.985)} 0%, ${withOpacity(uiScheme.cardBg, 0.94)} 100%)`,
          borderColor: withOpacity(uiScheme.cardBorder, 0.14),
          color: uiScheme.fg,
          boxShadow: `16px 0 44px -36px ${withOpacity(uiScheme.fg, 0.18)}`,
        }}
      >
        <SheetHeader
          className="shrink-0 border-b px-5 pb-4 pt-5 sm:px-6"
          style={{
            borderColor: withOpacity(uiScheme.cardBorder, 0.1),
            background: `linear-gradient(180deg, ${withOpacity(uiScheme.buttonBg, 0.24)} 0%, transparent 100%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-xl border"
                  style={{
                    background: withOpacity(uiScheme.buttonBg, 0.22),
                    borderColor: withOpacity(uiScheme.cardBorder, 0.16),
                    color: uiScheme.accentText,
                  }}
                >
                  <List className="h-4 w-4" />
                </div>
                <SheetTitle
                  className="text-[15px] font-bold tracking-[0.02em]"
                  style={{ color: uiScheme.fg }}
                >
                  目录
                </SheetTitle>
              </div>
              <SheetDescription
                className="truncate text-[12px] leading-5"
                style={{ color: withOpacity(uiScheme.mutedText, 0.92) }}
                title={bookTitle || "当前书籍"}
              >
                {bookTitle || "当前书籍"}
              </SheetDescription>
              {bookAuthor ? (
                <p
                  className="mt-1 truncate text-[11px] tracking-[0.03em]"
                  style={{ color: withOpacity(uiScheme.mutedText, 0.72) }}
                  title={bookAuthor}
                >
                  {bookAuthor}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onLocateCurrent}
                disabled={!currentChapter}
                title={
                  currentChapter
                    ? `定位到当前章节：${currentChapter}`
                    : "暂未识别当前章节"
                }
                className="h-8 w-8 rounded-xl border transition-[transform,background-color,border-color,color] hover:scale-[1.02] disabled:opacity-30"
                style={{
                  background: withOpacity(uiScheme.buttonBg, 0.18),
                  borderColor: withOpacity(uiScheme.cardBorder, 0.14),
                  color: withOpacity(uiScheme.fg, 0.68),
                }}
              >
                <LocateFixed className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                title="关闭目录"
                className="h-8 w-8 rounded-xl border transition-[transform,background-color,border-color,color] hover:scale-[1.02]"
                style={{
                  background: withOpacity(uiScheme.buttonBg, 0.18),
                  borderColor: withOpacity(uiScheme.cardBorder, 0.14),
                  color: withOpacity(uiScheme.fg, 0.58),
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="app-sheet-body reader-sidebar-sheet-body flex flex-1 flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-5 pb-3 pt-3 sm:px-6">
            <div
              className="flex items-center justify-between rounded-2xl border px-3 py-2 text-[11px] tracking-[0.04em]"
              style={{
                background: withOpacity(uiScheme.buttonBg, 0.18),
                borderColor: withOpacity(uiScheme.cardBorder, 0.14),
                color: withOpacity(uiScheme.mutedText, 0.82),
              }}
            >
              <span>章节导航</span>
              <span className="font-mono">{toc.length}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-4 sm:px-4">
            <div ref={tocListRef} className="space-y-1">
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
                <div className="flex flex-col items-center justify-center py-20 opacity-30">
                  <List
                    className="h-10 w-10 stroke-[1]"
                    style={{ color: uiScheme.mutedText }}
                  />
                  <p
                    className="mt-4 text-[13px] font-medium"
                    style={{ color: uiScheme.mutedText }}
                  >
                    未检测到目录结构
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
