"use client";

import type { CSSProperties } from "react";
import { Bookmark, BookmarkPlus, MapPin, Trash2 } from "lucide-react";

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
        side="right"
        container={overlayContainer}
        className="max-w-sm border-l-0 p-0 sm:w-85 sm:[&_[data-slot=sheet-close]]:top-4"
        style={{
          background: uiScheme.cardBg,
          boxShadow: `-20px 0 60px -20px ${withOpacity(uiScheme.cardBorder, 0.28)}`,
        }}
      >
        <SheetHeader className="relative overflow-hidden border-b border-border/40 px-5 py-6 pr-28">
          <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-primary/10" />
          <div className="absolute -bottom-7 -right-8 h-20 w-20 rounded-full bg-accent/10" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-sm shadow-primary/5">
              <Bookmark className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle
                className="truncate text-lg font-bold tracking-tight"
                style={{ color: uiScheme.fg }}
                title={bookTitle || "书签"}
              >
                书签
              </SheetTitle>
              <SheetDescription
                className="mt-0.5 truncate text-[10px] font-medium opacity-60 text-muted-foreground"
                style={{ color: uiScheme.mutedText }}
                title={bookTitle || "当前书籍"}
              >
                {bookTitle || "当前书籍"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="border-b border-border/40 px-4 py-3">
          <Button
            type="button"
            onClick={onCreate}
            disabled={!canCreate || isSaving}
            className="h-9 w-full rounded-lg"
            title={canCreate ? "添加当前位置为书签" : "当前位置尚未就绪"}
          >
            <BookmarkPlus className="h-4 w-4" />
            {isSaving ? "保存中" : "添加当前位置"}
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-env(safe-area-inset-top,0px)-154px)] sm:h-[calc(100vh-154px)]">
          <div className="space-y-2 px-4 py-3">
            {bookmarks.length > 0 ? (
              bookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="group rounded-lg border px-3 py-2.5 transition-colors"
                  style={{
                    background: withOpacity(uiScheme.bg, 0.62),
                    borderColor: withOpacity(uiScheme.cardBorder, 0.35),
                  }}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 cursor-pointer text-left"
                      onClick={() => onGoTo(bookmark)}
                    >
                      <div
                        className="flex items-center gap-1.5 text-xs font-semibold"
                        style={{ color: uiScheme.fg }}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {bookmark.chapter || "未识别章节"}
                        </span>
                      </div>
                      <div
                        className="mt-1 flex items-center gap-2 text-[11px]"
                        style={{ color: uiScheme.mutedText }}
                      >
                        <span>{formatPercent(bookmark.percentage)}</span>
                        <span aria-hidden="true">/</span>
                        <span>{formatDate(bookmark.created_at)}</span>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      onClick={() => onDelete(bookmark.id)}
                      title="删除书签"
                      aria-label="删除书签"
                      className="h-8 w-8 rounded-lg opacity-80 transition-opacity group-hover:opacity-100"
                      style={{ color: uiScheme.mutedText }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
