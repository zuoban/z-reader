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
        className="app-sheet-shell reader-bottom-sheet-centered mx-auto bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] left-3 right-3 flex max-h-[min(88svh,40rem)] flex-col overflow-hidden rounded-[1.5rem] p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:w-[560px] sm:max-w-[calc(100vw-2rem)] data-[side=bottom]:sm:max-h-[min(74svh,34rem)] sm:-translate-x-1/2 sm:rounded-[1.65rem]"
        style={{
          background: surface.bg,
          borderColor: surface.border,
          color: surface.fg,
          boxShadow: surface.shadow,
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <div
            className="h-1 w-9 rounded-full"
            style={{ background: surface.hairline }}
          />
        </div>
        <SheetHeader
          className="shrink-0 space-y-0 px-5 pb-3 pt-2 sm:px-6"
          style={{
            background: "transparent",
            borderBottom: `1px solid ${surface.hairline}`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: surface.surfaceSoft,
                    color: surface.fg,
                  }}
                >
                  <List className="h-4 w-4" />
                </div>
                <SheetTitle
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: surface.fg }}
                >
                  目录
                </SheetTitle>
                {toc.length > 0 ? (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none"
                    style={{
                      background: surface.surfaceSoft,
                      color: surface.muted,
                    }}
                  >
                    {toc.length}
                  </span>
                ) : null}
              </div>
              <div className="space-y-0.5 pl-10 pr-2">
                <SheetDescription
                  className="truncate text-xs font-medium leading-5"
                  style={{ color: surface.muted }}
                  title={bookTitle || "当前书籍"}
                >
                  {bookTitle || "当前书籍"}
                </SheetDescription>
                {bookAuthor ? (
                  <p
                    className="truncate text-[11px] font-medium opacity-70"
                    style={{ color: surface.muted }}
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
                className="h-9 w-9 rounded-full border-0 transition-colors hover:brightness-[0.985] active:scale-95 disabled:opacity-35"
                style={{
                  background: currentChapter ? surface.surfaceStrong : surface.surfaceSoft,
                  color: surface.fg,
                }}
              >
                <LocateFixed className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                title="关闭目录"
                className="h-9 w-9 rounded-full border-0 transition-colors hover:brightness-[0.985] active:scale-95"
                style={{
                  background: surface.surfaceSoft,
                  color: surface.muted,
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="app-sheet-body reader-sidebar-sheet-body relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-8 pt-2.5 sm:px-4">
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
                <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                  <div
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
                    style={{
                      background: surface.surface,
                      borderColor: surface.hairline,
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
          <div 
            className="pointer-events-none absolute left-0 right-0 top-0 h-5"
            style={{
              background: `linear-gradient(to bottom, ${surface.bg} 0%, transparent 100%)`,
            }}
          />
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-10"
            style={{
              background: `linear-gradient(to top, ${surface.bg} 0%, transparent 100%)`,
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
