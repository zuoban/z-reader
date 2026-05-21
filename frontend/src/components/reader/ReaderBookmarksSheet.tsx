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

const modernSurface = {
  bg: "rgba(255, 255, 255, 0.96)",
  panel: "#ffffff",
  surface: "#f5f5f7",
  surfaceStrong: "#eeeeF1",
  surfaceSoft: "rgba(245, 245, 247, 0.78)",
  fg: "#18181b",
  muted: "#71717a",
  border: "rgba(24, 24, 27, 0.05)",
  hairline: "rgba(24, 24, 27, 0.05)",
  shadow: "0 28px 80px rgba(15, 23, 42, 0.16)",
};

export function ReaderBookmarksSheet({
  open,
  onOpenChange,
  bookmarks,
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
        className="app-sheet-shell mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex max-h-[min(88svh,38rem)] flex-col overflow-hidden rounded-[1.75rem] p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
        style={{
          background: modernSurface.bg,
          borderColor: modernSurface.border,
          color: modernSurface.fg,
          boxShadow: modernSurface.shadow,
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: "rgba(24, 24, 27, 0.14)" }}
          />
        </div>
        <SheetHeader
          className="app-sheet-header shrink-0 px-5 pb-3 pt-2 sm:px-6"
          style={{
            background: "transparent",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: modernSurface.surface }}
                >
                  <Bookmark
                    className="h-4 w-4 shrink-0"
                    style={{ color: modernSurface.fg }}
                  />
                </div>
                <SheetTitle
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: modernSurface.fg }}
                >
                  书签
                </SheetTitle>
                {bookmarks.length > 0 && (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none"
                    style={{
                      background: modernSurface.surface,
                      color: modernSurface.muted,
                    }}
                  >
                    {bookmarks.length}
                  </span>
                )}
              </div>
              <SheetDescription
                className="mt-1 pl-10 text-xs leading-5"
                style={{ color: modernSurface.muted }}
              >
                记录阅读进度，随时回到上次停留的位置
              </SheetDescription>
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
                className="h-9 rounded-full px-3 text-[13px] font-medium shadow-none transition-colors hover:brightness-[0.985] disabled:hover:brightness-100"
                style={{
                  background: modernSurface.surfaceSoft,
                  color: modernSurface.fg,
                }}
              >
                <BookmarkPlus className="h-4 w-4" />
                {isSaving ? "保存中" : "添加"}
              </Button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                style={{
                  color: modernSurface.muted,
                  background: modernSurface.surface,
                }}
                aria-label="关闭书签"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <div
          className="app-sheet-body min-h-0 overscroll-contain px-3 pb-3 pt-2 sm:px-4"
          style={{ background: "transparent" }}
        >
          <div className="space-y-1.5 pb-4">
            {sortedBookmarks.length > 0 ? (
              sortedBookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="group rounded-[1.15rem] transition-[background-color,transform] hover:-translate-y-[1px]"
                  style={{
                    background: modernSurface.surfaceSoft,
                  }}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 cursor-pointer text-left focus:outline-none"
                      onClick={() => {
                        onGoTo(bookmark);
                        onOpenChange(false);
                      }}
                    >
                      <div
                        className="truncate text-[15px] font-medium leading-6"
                        style={{ color: modernSurface.fg }}
                      >
                        {bookmark.chapter || "未识别章节"}
                      </div>
                      <div
                        className="mt-1.5 flex items-center gap-2 text-[12px] leading-5"
                        style={{ color: modernSurface.muted }}
                      >
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 tabular-nums"
                          style={{
                            background: modernSurface.surfaceStrong,
                            color: modernSurface.fg,
                          }}
                        >
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
                      className="h-8 w-8 shrink-0 rounded-full opacity-60 transition-colors hover:bg-black/[0.045] hover:text-foreground group-hover:opacity-100"
                      style={{ color: modernSurface.muted }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{
                    background: modernSurface.surface,
                  }}
                >
                  <Bookmark
                    className="h-5 w-5 stroke-[1.75]"
                    style={{ color: modernSurface.fg }}
                  />
                </div>
                <p
                  className="text-sm font-medium tracking-tight"
                  style={{ color: modernSurface.fg }}
                >
                  暂无书签
                </p>
                <p
                  className="mt-1 text-xs leading-5"
                  style={{ color: modernSurface.muted }}
                >
                  阅读时点击上方按钮，即可保存当前位置。
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
