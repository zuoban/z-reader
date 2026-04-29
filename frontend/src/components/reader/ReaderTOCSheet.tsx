"use client";

import type { CSSProperties, RefObject } from "react";
import { List, LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { TOCItem } from "@/lib/types";
import {
  floatingSheetActionButtonClass,
  getFloatingSheetActionButtonStyle,
  withOpacity,
} from "@/lib/reader-ui";
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
        showCloseButton
        finalFocus={false}
        container={overlayContainer}
        className="mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex !h-[min(92svh,48rem)] flex-col rounded-[2.5rem] border p-0 shadow-2xl sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
        style={{
          background: uiScheme.cardBg,
          borderColor: withOpacity(uiScheme.cardBorder, 0.22),
          color: uiScheme.fg,
          boxShadow: `0 -12px 48px -12px ${withOpacity(uiScheme.cardBorder, 0.35)}`,
        }}
      >
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
          className={cn(
            floatingSheetActionButtonClass,
            "sm:[&_svg]:h-4 sm:[&_svg]:w-4"
          )}
          style={{
            ...getFloatingSheetActionButtonStyle({
              uiScheme,
              enabled: Boolean(currentChapter),
              side: "right",
            }),
            top: "max(0.75rem, env(safe-area-inset-top, 0px))",
          }}
        >
          <LocateFixed className="h-4 w-4" />
        </Button>

        <SheetHeader className="relative shrink-0 overflow-hidden border-b-0 px-8 pb-4 pt-10 pr-28">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
          <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-accent/10" />

          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
              <List className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle
                className="truncate text-2xl font-bold tracking-tight"
                style={{ color: uiScheme.fg }}
                title={bookTitle || "阅读中"}
              >
                目录
              </SheetTitle>
              <SheetDescription
                className="mt-1 truncate text-xs font-medium opacity-60 text-muted-foreground"
                style={{ color: uiScheme.mutedText }}
                title={bookAuthor ? `作者：${bookAuthor}` : "书籍目录"}
              >
                {bookTitle || "当前书籍"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 [-webkit-overflow-scrolling:touch]">
          <div ref={tocListRef} className="space-y-1 px-6 pb-12 pt-4">
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
