"use client";

import type { CSSProperties } from "react";
import { Bookmark, BookmarkPlus, Trash2, X } from "lucide-react";

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
import { getModernReaderSurface } from "@/lib/reader-ui";

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
  trigger?: React.ReactNode;
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(value, 100)).toFixed(1)}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 60_000) return "刚刚";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}分钟前`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}小时前`;

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfTargetDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfTargetDay.getTime()) / 86_400_000,
  );

  if (dayDiff === 1) return "昨天";
  if (dayDiff === 2) return "前天";
  if (dayDiff < 7) return `${dayDiff}天前`;

  const sameYear = now.getFullYear() === date.getFullYear();
  return date.toLocaleDateString("zh-CN", sameYear
    ? {
        month: "2-digit",
        day: "2-digit",
      }
    : {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
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
  trigger,
}: ReaderBookmarksSheetProps) {
  const surface = getModernReaderSurface(uiScheme);
  const sortedBookmarks = [...bookmarks].sort((left, right) => {
    const leftTime = new Date(left.created_at).getTime();
    const rightTime = new Date(right.created_at).getTime();

    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
    return rightTime - leftTime;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            title="书签"
            aria-label="书签"
            className={triggerClassName}
            style={triggerStyle}
          />
        }
      >
        {trigger || <Bookmark className="h-4 w-4" />}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        finalFocus={false}
        container={overlayContainer}
        className="reader-panel border p-0 sm:w-[460px] sm:max-w-[calc(100vw-2rem)]"
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
                  书签
                </SheetTitle>
                {bookmarks.length > 0 && (
                  <span
                    className="text-xs font-medium tabular-nums"
                    style={{ color: surface.muted }}
                  >
                    {bookmarks.length}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                <SheetDescription
                  className="truncate text-xs font-medium leading-5"
                  style={{ color: surface.muted }}
                  title={bookTitle || "当前书籍"}
                >
                  {bookTitle || "当前书籍"}
                </SheetDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCreate}
                disabled={!canCreate || isSaving}
                title={canCreate ? "添加当前位置为书签" : "当前位置尚未就绪"}
                aria-label="添加当前书签"
                className="h-11 rounded-lg px-2.5 text-sm font-medium shadow-none transition-colors hover:bg-secondary lg:h-9"
                style={{
                  color: surface.fg,
                }}
              >
                <BookmarkPlus className="h-4 w-4" strokeWidth={1.5} />
                {isSaving ? "保存中" : "添加"}
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 lg:size-9"
                style={{
                  color: surface.muted,
                }}
                aria-label="关闭书签"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <div className="reader-panel-body custom-scrollbar px-4 py-2 sm:px-6">
          <div className="divide-y pb-3">
            {sortedBookmarks.length > 0 ? (
              sortedBookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="group flex items-center gap-2 py-1.5 sm:gap-3"
                  style={{ borderColor: surface.hairline }}
                >
                  <button
                    type="button"
                    aria-label={`打开书签：${bookmark.chapter || "未识别章节"}，${formatPercent(bookmark.percentage)}`}
                    className="min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-2 py-1 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2"
                    onClick={() => {
                      onGoTo(bookmark);
                      onOpenChange(false);
                    }}
                  >
                    <div
                      className="truncate text-sm font-medium leading-6"
                      style={{ color: surface.fg }}
                    >
                      {bookmark.chapter || "未识别章节"}
                    </div>
                    {bookmark.note ? (
                      <p
                        className="mt-1 line-clamp-2 text-xs leading-5"
                        style={{ color: surface.muted }}
                        title={bookmark.note}
                      >
                        {bookmark.note}
                      </p>
                    ) : null}
                    <div
                      className="mt-1 flex flex-wrap items-center gap-2 text-xs leading-5"
                      style={{ color: surface.muted }}
                    >
                      <span className="font-medium tabular-nums" style={{ color: surface.fg }}>
                        {formatPercent(bookmark.percentage)}
                      </span>
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
                    className="size-11 shrink-0 rounded-lg opacity-75 transition-colors hover:bg-destructive/10 lg:size-9 sm:opacity-60 sm:group-hover:opacity-100"
                    style={{ color: surface.muted }}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div
                  className="mb-4 flex size-8 items-center justify-center"
                  style={{
                    color: surface.fg,
                  }}
                >
                  <Bookmark className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <p
                  className="text-sm font-medium tracking-tight"
                  style={{ color: surface.fg }}
                >
                  暂无书签
                </p>
                <p
                  className="mt-1.5 max-w-[16rem] text-xs leading-5"
                  style={{ color: surface.muted }}
                >
                  阅读时点击上方「添加」，即可保存当前位置。
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
