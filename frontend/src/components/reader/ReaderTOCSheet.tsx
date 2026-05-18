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
}: ReaderTOCSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            title="目录"
            className={triggerClassName}
            style={triggerStyle}
          />
        }
      >
        <List className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        finalFocus={false}
        container={overlayContainer}
        className="app-sheet-shell mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex max-h-[min(90svh,42rem)] flex-col rounded-[1.75rem] border p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[440px] sm:-translate-x-1/2"
        style={{
          background:
            `linear-gradient(180deg, ${withOpacity(uiScheme.buttonBg, 0.42)} 0%, transparent 9rem), ${uiScheme.cardBg}`,
          borderColor: withOpacity(uiScheme.cardBorder, 0.22),
          color: uiScheme.fg,
          boxShadow: `0 24px 70px -44px ${withOpacity(uiScheme.cardBorder, 0.75)}, 0 12px 30px -26px ${withOpacity(uiScheme.cardBorder, 0.5)}, inset 0 1px 0 rgba(255,255,255,0.52)`,
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
                <List className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle
                  className="truncate text-xl font-semibold tracking-tight"
                  style={{ color: uiScheme.fg }}
                  title={bookTitle || "阅读中"}
                >
                  目录
                </SheetTitle>
                <SheetDescription
                  className="mt-1 truncate text-xs font-medium text-muted-foreground"
                  style={{ color: uiScheme.mutedText }}
                  title={bookAuthor ? `作者：${bookAuthor}` : "书籍目录"}
                >
                  {bookTitle || "当前书籍"}
                </SheetDescription>
              </div>
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
                aria-label="定位到当前章节"
                className="h-8 w-8 rounded-xl border transition-[transform,background-color,border-color,color] hover:scale-[1.02] disabled:opacity-45"
                style={{
                  color: currentChapter
                    ? withOpacity(uiScheme.fg, 0.68)
                    : withOpacity(uiScheme.mutedText, 0.58),
                  background: withOpacity(uiScheme.buttonBg, currentChapter ? 0.18 : 0.08),
                  borderColor: withOpacity(uiScheme.cardBorder, 0.14),
                }}
              >
                <LocateFixed className="h-3.5 w-3.5" />
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border transition-[transform,background-color,border-color,color] hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                style={{
                  color: withOpacity(uiScheme.fg, 0.62),
                  background: withOpacity(uiScheme.buttonBg, 0.18),
                  borderColor: withOpacity(uiScheme.cardBorder, 0.14),
                }}
                aria-label="关闭目录"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <div className="app-sheet-body min-h-0 overscroll-contain px-2">
          <div ref={tocListRef} className="space-y-1 px-4 py-5 sm:px-5">
            {toc.length > 0 ? (
              toc.map((item, idx) => (
                <MemoizedReaderTOCNode
                  key={idx}
                  item={item}
                  onGoTo={onGoTo}
                  currentChapter={currentChapter}
                  currentChapterHref={currentChapterHref}
                  uiScheme={uiScheme}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 opacity-30">
                <List
                  className="h-12 w-12 stroke-[1]"
                  style={{ color: uiScheme.mutedText }}
                />
                <p
                  className="mt-4 text-xs font-medium"
                  style={{ color: uiScheme.mutedText }}
                >
                  未检测到目录结构
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
