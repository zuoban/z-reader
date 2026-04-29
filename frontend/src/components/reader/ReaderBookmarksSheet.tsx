"use client";

import type { CSSProperties } from "react";
import { Bookmark, BookmarkPlus, MapPin, Trash2 } from "lucide-react";

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
import type { Bookmark as ReaderBookmark } from "@/lib/api";
import { withOpacity } from "@/lib/reader-ui";

interface ReaderBookmarksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarks: ReaderBookmark[];
  bookTitle: string;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
  triggerClassName: string;
  triggerStyle: CSSProperties;
  canCreate: boolean;
  isSaving: boolean;
  onCreate: () => void;
  onGoTo: (bookmark: ReaderBookmark) => void;
  onDelete: (bookmarkId: string) => void;
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(value, 100)).toFixed(1)}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReaderBookmarksSheet({
  open,
  onOpenChange,
  bookmarks,
  bookTitle,
  uiScheme,
  overlayContainer,
  triggerClassName,
  triggerStyle,
  canCreate,
  isSaving,
  onCreate,
  onGoTo,
  onDelete,
}: ReaderBookmarksSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            title="书签"
            aria-label="书签"
            className={triggerClassName}
            style={triggerStyle}
          />
        }
      >
        <Bookmark className="h-4 w-4" />
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
        <SheetHeader className="relative shrink-0 overflow-hidden border-b-0 px-8 pb-4 pt-10 pr-24">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
          <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-accent/10" />

          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
              <Bookmark className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-2xl font-bold tracking-tight" style={{ color: uiScheme.fg }}>
                书签
              </SheetTitle>
              <SheetDescription
                className="mt-1 text-xs font-medium opacity-60"
                style={{ color: uiScheme.mutedText }}
              >
                记录那些值得回味的阅读瞬间
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="shrink-0 px-8 py-2">
          <Button
            type="button"
            onClick={onCreate}
            disabled={!canCreate || isSaving}
            className="h-11 w-full rounded-2xl text-sm font-bold shadow-sm transition-all active:scale-[0.98]"
            title={canCreate ? "添加当前位置为书签" : "当前位置尚未就绪"}
          >
            <BookmarkPlus className="mr-2 h-4.5 w-4.5" />
            {isSaving ? "保存中" : "添加当前书签"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-3 px-6 pb-12 pt-4">
            {bookmarks.length > 0 ? (
              bookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="group rounded-[1.25rem] border px-4 py-3.5 transition-all hover:bg-black/5 dark:hover:bg-white/5"
                  style={{
                    background: withOpacity(uiScheme.buttonBg, 0.3),
                    borderColor: withOpacity(uiScheme.cardBorder, 0.15),
                  }}
                >
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      className="min-w-0 flex-1 cursor-pointer text-left focus:outline-none"
                      onClick={() => {
                        onGoTo(bookmark);
                        onOpenChange(false);
                      }}
                    >
                      <div
                        className="flex items-center gap-2 text-[13px] font-bold"
                        style={{ color: uiScheme.fg }}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">
                          {bookmark.chapter || "未识别章节"}
                        </span>
                      </div>
                      <div
                        className="mt-1 flex items-center gap-2 text-[11px] font-medium opacity-50"
                        style={{ color: uiScheme.mutedText }}
                      >
                        <span className="tabular-nums">{formatPercent(bookmark.percentage)}</span>
                        <span className="h-1 w-1 rounded-full bg-current opacity-30" />
                        <span>{formatDate(bookmark.created_at)}</span>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(bookmark.id);
                      }}
                      title="删除书签"
                      aria-label="删除书签"
                      className="h-9 w-9 shrink-0 rounded-xl transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
                      style={{ color: uiScheme.mutedText }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-45">
                <Bookmark
                  className="h-12 w-12 stroke-[1]"
                  style={{ color: uiScheme.mutedText }}
                />
                <p
                  className="mt-4 text-xs font-medium"
                  style={{ color: uiScheme.mutedText }}
                >
                  暂无书签
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
