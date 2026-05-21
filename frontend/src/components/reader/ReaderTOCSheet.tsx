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
        className="app-sheet-shell fixed left-4 top-4 flex h-auto max-h-[calc(100svh-32px)] w-[calc(100vw-32px)] flex-col rounded-[24px] border p-0 shadow-2xl transition-all duration-300 sm:inset-y-0 sm:left-0 sm:h-full sm:w-[360px] sm:rounded-none sm:border-y-0 sm:border-l-0"
        style={{
          background: uiScheme.bg,
          borderColor: withOpacity(uiScheme.cardBorder, 0.15),
          color: uiScheme.fg,
          boxShadow: `0 20px 50px -12px ${withOpacity(uiScheme.fg, 0.25)}`,
        }}
      >
        <SheetHeader
          className="shrink-0 space-y-0 px-6 pb-2 pt-6 sm:px-7 sm:pb-4 sm:pt-7"
          style={{
            background: `linear-gradient(to bottom, ${withOpacity(uiScheme.buttonBg, 0.1)} 0%, transparent 100%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border"
                  style={{
                    background: withOpacity(uiScheme.accentText, 0.08),
                    borderColor: withOpacity(uiScheme.accentText, 0.15),
                    color: uiScheme.accentText,
                  }}
                >
                  <List className="h-[18px] w-[18px]" />
                </div>
                <SheetTitle
                  className="text-[17px] font-bold tracking-tight"
                  style={{ color: uiScheme.fg }}
                >
                  目录
                </SheetTitle>
              </div>
              <div className="space-y-1 pr-2">
                <SheetDescription
                  className="truncate text-[13px] font-semibold leading-tight opacity-90"
                  style={{ color: uiScheme.fg }}
                  title={bookTitle || "当前书籍"}
                >
                  {bookTitle || "当前书籍"}
                </SheetDescription>
                {bookAuthor ? (
                  <p
                    className="truncate text-[11px] font-medium tracking-wide opacity-50"
                    style={{ color: uiScheme.fg }}
                    title={bookAuthor}
                  >
                    {bookAuthor}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
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
                className="h-9 w-9 rounded-2xl border transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                style={{
                  background: withOpacity(uiScheme.buttonBg, 0.2),
                  borderColor: withOpacity(uiScheme.cardBorder, 0.15),
                  color: uiScheme.fg,
                }}
              >
                <LocateFixed className="h-[18px] w-[18px]" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                title="关闭目录"
                className="h-9 w-9 rounded-2xl border transition-all hover:scale-105 active:scale-95"
                style={{
                  background: withOpacity(uiScheme.buttonBg, 0.2),
                  borderColor: withOpacity(uiScheme.cardBorder, 0.15),
                  color: uiScheme.fg,
                }}
              >
                <X className="h-[18px] w-[18px]" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="app-sheet-body reader-sidebar-sheet-body flex flex-1 flex-col min-h-0 overflow-hidden relative">
          <div className="shrink-0 px-6 pb-3 pt-4 sm:px-7">
            <div
              className="flex items-center justify-between rounded-xl border px-4 py-2.5 text-[11px] font-bold tracking-[0.08em] uppercase opacity-60"
              style={{
                background: withOpacity(uiScheme.buttonBg, 0.1),
                borderColor: withOpacity(uiScheme.cardBorder, 0.08),
                color: uiScheme.fg,
              }}
            >
              <span>Chapters Navigation</span>
              <span className="font-mono text-[12px]">{toc.length}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-8 sm:px-5 custom-scrollbar">
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
                <div className="flex flex-col items-center justify-center py-24 px-6 text-center opacity-40">
                  <div 
                    className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border-2 border-dashed"
                    style={{ borderColor: withOpacity(uiScheme.cardBorder, 0.2) }}
                  >
                    <List
                      className="h-7 w-7 stroke-[1.5]"
                      style={{ color: uiScheme.mutedText }}
                    />
                  </div>
                  <p
                    className="text-[14px] font-semibold tracking-tight"
                    style={{ color: uiScheme.mutedText }}
                  >
                    未检测到目录结构
                  </p>
                  <p 
                    className="mt-2 text-[12px] opacity-70"
                    style={{ color: uiScheme.mutedText }}
                  >
                    该书籍可能没有定义标准目录
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Scroll Indicators */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
            style={{
              background: `linear-gradient(to top, ${uiScheme.bg} 0%, transparent 100%)`
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
