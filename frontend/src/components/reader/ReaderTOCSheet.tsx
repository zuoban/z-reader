"use client";

import type { CSSProperties, RefObject } from "react";
import { List, LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
        side="right"
        container={overlayContainer}
        className="max-w-sm border-l-0 p-0 sm:w-85 sm:[&_[data-slot=sheet-close]]:top-4"
        style={{
          background: uiScheme.cardBg,
          boxShadow: `-20px 0 60px -20px ${withOpacity(uiScheme.cardBorder, 0.28)}`,
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
          className={floatingSheetActionButtonClass}
          style={getFloatingSheetActionButtonStyle({
            uiScheme,
            enabled: Boolean(currentChapter),
            side: "right",
          })}
        >
          <LocateFixed className="h-4 w-4" />
        </Button>

        <SheetHeader className="relative overflow-hidden border-b border-border/40 px-5 py-6 pr-28">
          <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-primary/10" />
          <div className="absolute -bottom-7 -right-8 h-20 w-20 rounded-full bg-accent/10" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-sm shadow-primary/5">
              <List className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle
                className="truncate text-lg font-bold tracking-tight"
                style={{ color: uiScheme.fg }}
                title={bookTitle || "阅读中"}
              >
                {bookTitle || "阅读中"}
              </SheetTitle>
              <SheetDescription
                className="mt-0.5 truncate text-[10px] font-medium opacity-60 text-muted-foreground"
                style={{ color: uiScheme.mutedText }}
                title={bookAuthor ? `作者：${bookAuthor}` : "书籍目录"}
              >
                {bookAuthor ? `作者：${bookAuthor}` : "书籍目录"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-env(safe-area-inset-top,0px)-116px)] sm:h-[calc(100vh-104px)]">
          <div ref={tocListRef} className="space-y-1 px-4 pb-8 pt-1.5">
            {toc.length > 0 ? (
              toc.map((item, idx) => (
                <MemoizedReaderTOCNode
                  key={idx}
                  item={item}
                  onGoTo={onGoTo}
                  currentChapter={currentChapter}
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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
