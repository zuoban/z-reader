"use client";

import type { CSSProperties } from "react";
import { Bookmark, BookmarkPlus, MapPin, Trash2, X } from "lucide-react";

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
        showCloseButton={false}
        finalFocus={false}
        container={overlayContainer}
        className="app-sheet-shell mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex max-h-[min(90svh,42rem)] flex-col rounded-[1.75rem] border p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[440px] sm:-translate-x-1/2"
        style={{
          background:
            `linear-gradient(135deg, ${withOpacity(uiScheme.fg, 0.055)} 0%, transparent 34%), ${withOpacity(uiScheme.cardBg, 0.9)}`,
          borderColor: withOpacity(uiScheme.cardBorder, 0.22),
          color: uiScheme.fg,
          boxShadow: `0 -12px 48px -12px ${withOpacity(uiScheme.cardBorder, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.32)`,
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
                <Bookmark className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-xl font-semibold tracking-tight" style={{ color: uiScheme.fg }}>
                  书签
                </SheetTitle>
                <SheetDescription
                  className="mt-1 text-xs font-medium"
                  style={{ color: uiScheme.mutedText }}
                >
                  记录那些值得回味的阅读瞬间
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-[transform,background-color,border-color,color] hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              style={{
                color: withOpacity(uiScheme.fg, 0.62),
                background: withOpacity(uiScheme.buttonBg, 0.18),
                borderColor: withOpacity(uiScheme.cardBorder, 0.14),
              }}
              aria-label="关闭书签"
              title="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </SheetHeader>

        <div className="shrink-0 px-6 py-4 sm:px-7">
          <Button
            type="button"
            onClick={onCreate}
            disabled={!canCreate || isSaving}
            className="h-10 w-full rounded-xl text-sm font-bold shadow-none transition-all active:scale-[0.98]"
            title={canCreate ? "添加当前位置为书签" : "当前位置尚未就绪"}
            style={{
              background: withOpacity(uiScheme.link, 0.12),
              border: `1px solid ${withOpacity(uiScheme.link, 0.18)}`,
              color: uiScheme.link,
            }}
          >
            <BookmarkPlus className="mr-2 h-4 w-4" />
            {isSaving ? "保存中" : "添加当前书签"}
          </Button>
        </div>

        <div className="app-sheet-body min-h-0 overscroll-contain px-2">
          <div className="space-y-3 px-4 pb-5 pt-1 sm:px-5">
            {bookmarks.length > 0 ? (
              bookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="group rounded-[1.25rem] border px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]  transition-all hover:scale-[1.01]"
                  style={{
                    background:
                      `linear-gradient(135deg, ${withOpacity(uiScheme.fg, 0.04)} 0%, transparent 34%), ${withOpacity(uiScheme.buttonBg, 0.28)}`,
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
