"use client";

import { useMemo, type CSSProperties } from "react";
import { ActionIcon, Button, Drawer } from "@mantine/core";
import "@/app/styles/mantine-drawer.css";
import {
  Bookmark,
  BookmarkPlus,
  Copy,
  Download,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { Bookmark as ReaderBookmark } from "@/lib/api";
import {
  buildBookmarksMarkdownFilename,
  downloadMarkdownFile,
  formatBookmarksAsMarkdown,
} from "@/lib/bookmarks-export";
import {
  getModernReaderSurface,
  getReaderPanelThemeVars,
} from "@/lib/reader-ui";

interface ReaderBookmarksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarks: ReaderBookmark[];
  bookTitle?: string;
  bookAuthor?: string | null;
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
  bookTitle = "",
  bookAuthor,
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
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);
  const sortedBookmarks = useMemo(
    () =>
      [...bookmarks].sort((left, right) => {
        const leftTime = new Date(left.created_at).getTime();
        const rightTime = new Date(right.created_at).getTime();

        if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
        return rightTime - leftTime;
      }),
    [bookmarks],
  );

  function handleExportMarkdown() {
    const markdown = formatBookmarksAsMarkdown(
      { title: bookTitle, author: bookAuthor },
      bookmarks,
    );
    const filename = buildBookmarksMarkdownFilename(bookTitle);
    downloadMarkdownFile(filename, markdown);
    toast.success("已导出 Markdown 书签");
  }

  async function handleCopyMarkdown() {
    const markdown = formatBookmarksAsMarkdown(
      { title: bookTitle, author: bookAuthor },
      bookmarks,
    );

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(markdown);
      toast.success("已复制 Markdown 书签");
    } catch {
      toast.error("复制失败，请重试");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="subtle"
        title="书签"
        aria-label={trigger ? undefined : "书签"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={triggerClassName}
        style={triggerStyle}
        onClick={() => onOpenChange(!open)}
      >
        {trigger || <Bookmark className="h-4 w-4" aria-hidden="true" />}
      </Button>

      <Drawer.Root
        opened={open}
        onClose={() => onOpenChange(false)}
        position="bottom"
        size="auto"
        padding={0}
        zIndex={90}
        returnFocus={false}
        portalProps={{ target: overlayContainer ?? undefined }}
        classNames={{
          inner:
            "items-end justify-center pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]",
          content:
            "reader-panel flex max-h-[min(42rem,calc(100svh-1.5rem))] w-full flex-col overflow-hidden rounded-2xl border p-0 sm:max-h-[min(78svh,42rem)] sm:w-[460px] sm:max-w-[calc(100vw-2rem)]",
        }}
        styles={{
          content: {
            ...panelThemeVars,
            flex: "0 1 auto",
            height: "auto",
            background: uiScheme.cardBg,
            borderColor: surface.border,
            color: surface.fg,
            boxShadow: "var(--paper-shadow-floating)",
          },
        }}
      >
        <Drawer.Overlay backgroundOpacity={0.42} blur={3} />
        <Drawer.Content data-reader-interactive="true">
          <div className="reader-panel-header shrink-0 bg-transparent px-4 py-3.5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Drawer.Title
                    className="font-heading text-lg font-medium leading-tight"
                    style={{ color: surface.fg }}
                  >
                    书签
                  </Drawer.Title>
                  {bookmarks.length > 0 && (
                    <span
                      className="text-xs font-medium tabular-nums"
                      style={{ color: surface.muted }}
                      aria-live="polite"
                    >
                      {bookmarks.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  <p
                    className="truncate text-xs leading-5"
                    style={{ color: surface.muted }}
                    title={bookTitle || "当前书籍"}
                  >
                    {bookTitle || "当前书籍"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCreate}
                  disabled={!canCreate || isSaving}
                  aria-busy={isSaving || undefined}
                  title={canCreate ? "添加当前位置为书签" : "当前位置尚未就绪"}
                  aria-label="添加当前书签"
                  className="reader-panel-action"
                >
                  {isSaving ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  ) : (
                    <BookmarkPlus className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  )}
                  <span>{isSaving ? "保存中…" : "添加"}</span>
                </button>
                <ActionIcon
                  variant="subtle"
                  size={44}
                  radius="md"
                  onClick={() => onOpenChange(false)}
                  className="reader-panel-icon"
                  aria-label="关闭书签"
                  title="关闭"
                >
                  <X className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                </ActionIcon>
              </div>
            </div>
            {bookmarks.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="reader-panel-secondary !h-8 px-2.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  <span>导出 Markdown</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyMarkdown()}
                  className="reader-panel-secondary !h-8 px-2.5 text-xs"
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  <span>复制 Markdown</span>
                </button>
              </div>
            )}
          </div>

          <div className="reader-panel-body custom-scrollbar px-3 py-2 sm:px-5">
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
                      className="reader-panel-item min-w-0 flex-1 flex-col items-stretch px-2.5 py-2"
                      onClick={() => {
                        onGoTo(bookmark);
                        onOpenChange(false);
                      }}
                    >
                      <div
                        className="truncate text-sm font-medium leading-6"
                        style={{ color: surface.fg }}
                        title={bookmark.chapter || "未识别章节"}
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
                        <span
                          className="font-medium tabular-nums"
                          style={{ color: uiScheme.link }}
                        >
                          {formatPercent(bookmark.percentage)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="h-1 w-1 rounded-full bg-current opacity-30"
                        />
                        <span>{formatDate(bookmark.created_at)}</span>
                      </div>
                    </button>
                    <ActionIcon
                      variant="subtle"
                      size={44}
                      radius="md"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(bookmark.id);
                      }}
                      title="删除书签"
                      aria-label={`删除书签：${bookmark.chapter || "未识别章节"}`}
                      className="reader-panel-danger opacity-80 focus-visible:opacity-100 sm:opacity-60 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                    </ActionIcon>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <div
                    className="mb-3 flex size-10 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: surface.hairline,
                      background: "color-mix(in srgb, var(--reader-panel-hover) 62%, transparent)",
                      color: surface.fg,
                    }}
                  >
                    <Bookmark className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />
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
                    将当前阅读位置存为书签，方便随时回看。
                  </p>
                  <button
                    type="button"
                    onClick={onCreate}
                    disabled={!canCreate || isSaving}
                    aria-busy={isSaving || undefined}
                    className="reader-panel-action mt-4 px-3.5 text-xs"
                  >
                    {isSaving ? (
                      <Loader2
                        className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                        strokeWidth={1.6}
                        aria-hidden="true"
                      />
                    ) : (
                      <BookmarkPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                    )}
                    <span>{isSaving ? "保存中…" : "添加当前位置"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Root>
    </>
  );
}
