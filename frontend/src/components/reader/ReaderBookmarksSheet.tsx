"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon } from "@mantine/core";
import {
  Bookmark,
  BookmarkPlus,
  Copy,
  Download,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { Bookmark as ReaderBookmark } from "@/lib/api";
import {
  buildBookmarksMarkdownFilename,
  downloadMarkdownFile,
  formatBookmarksAsMarkdown,
} from "@/lib/bookmarks-export";
import { getModernReaderSurface, withOpacity } from "@/lib/reader-ui";
import { ReaderEmptyState, ReaderSheet } from "@/components/reader/ReaderSheet";

interface ReaderBookmarksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarks: ReaderBookmark[];
  bookTitle?: string;
  bookAuthor?: string | null;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
  canCreate: boolean;
  isSaving: boolean;
  onCreate: () => void;
  onGoTo: (bookmark: ReaderBookmark) => void;
  onDelete: (bookmarkId: string) => void;
  onUpdateNote?: (bookmarkId: string, note: string) => Promise<boolean> | void;
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
  canCreate,
  isSaving,
  onCreate,
  onGoTo,
  onDelete,
  onUpdateNote,
}: ReaderBookmarksSheetProps) {
  const surface = getModernReaderSurface(uiScheme);
  const [sortBy, setSortBy] = useState<"recent" | "position">("recent");
  const [notesOnly, setNotesOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editSessionRef = useRef(0);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      if (editingId !== null) {
        setEditingId(null);
        setDraftNote("");
        setIsUpdatingNote(false);
      }
      if (notesOnly) {
        setNotesOnly(false);
      }
    }
  }

  if (editingId !== null && !bookmarks.some((item) => item.id === editingId)) {
    setEditingId(null);
    setDraftNote("");
    setIsUpdatingNote(false);
  }

  useEffect(() => {
    if (!open || editingId === null) {
      editSessionRef.current += 1;
      return;
    }
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [open, editingId]);

  const notedCount = useMemo(
    () => bookmarks.filter((item) => Boolean(item.note?.trim())).length,
    [bookmarks],
  );
  const effectiveNotesOnly = notesOnly && notedCount > 0;

  const sortedBookmarks = useMemo(() => {
    const filtered = effectiveNotesOnly
      ? bookmarks.filter((item) => Boolean(item.note?.trim()))
      : bookmarks;

    return [...filtered].sort((left, right) => {
      if (sortBy === "position" && left.percentage !== right.percentage) {
        return left.percentage - right.percentage;
      }
      const leftTime = new Date(left.created_at).getTime();
      const rightTime = new Date(right.created_at).getTime();

      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
      return rightTime - leftTime;
    });
  }, [bookmarks, effectiveNotesOnly, sortBy]);

  function handleStartEdit(bookmark: ReaderBookmark) {
    editSessionRef.current += 1;
    setEditingId(bookmark.id);
    setDraftNote(bookmark.note ?? "");
    setIsUpdatingNote(false);
  }

  function handleCancelEdit() {
    editSessionRef.current += 1;
    setEditingId(null);
    setDraftNote("");
    setIsUpdatingNote(false);
  }

  async function handleSaveNote(bookmarkId: string) {
    if (!onUpdateNote || isUpdatingNote) return;
    const session = editSessionRef.current;
    setIsUpdatingNote(true);
    try {
      const result = await onUpdateNote(bookmarkId, draftNote);
      if (editSessionRef.current !== session) return;
      if (result !== false) {
        setEditingId(null);
        setDraftNote("");
      }
    } catch {
      // Keep edit mode open with the current draft on failure.
    } finally {
      if (editSessionRef.current === session) {
        setIsUpdatingNote(false);
      }
    }
  }

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
    <ReaderSheet
      open={open}
      onClose={() => onOpenChange(false)}
      closeOnEscape={editingId === null}
      widthClassName="sm:w-[460px]"
      uiScheme={uiScheme}
      overlayContainer={overlayContainer}
      closeLabel="关闭书签"
      title="书签"
      titleAddon={
        bookmarks.length > 0 ? (
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: surface.muted }}
            aria-live="polite"
          >
            {bookmarks.length}
          </span>
        ) : null
      }
      subtitle={
        <div className="mt-1 space-y-0.5">
          <p
            className="truncate text-xs leading-5"
            style={{ color: surface.muted }}
            title={bookTitle || "当前书籍"}
          >
            {bookTitle || "当前书籍"}
          </p>
        </div>
      }
      headerActions={
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
      }
      headerExtra={
        bookmarks.length > 0 ? (
          <div className="mt-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
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
            {(bookmarks.length > 1 || notedCount > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {bookmarks.length > 1 ? (
                  <div
                    role="group"
                    aria-label="书签排序"
                    className="inline-flex items-center gap-1"
                  >
                    {(
                      [
                        { id: "recent", label: "按时间" },
                        { id: "position", label: "按进度" },
                      ] as const
                    ).map((option) => {
                      const isActive = sortBy === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setSortBy(option.id)}
                          aria-pressed={isActive}
                          className="reader-settings-option inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium"
                          style={{
                            borderColor: isActive ? uiScheme.link : surface.hairline,
                            background: isActive ? withOpacity(uiScheme.link, 0.08) : "transparent",
                            color: isActive ? uiScheme.link : surface.fg,
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span />
                )}
                {notedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setNotesOnly((prev) => !prev)}
                    aria-pressed={effectiveNotesOnly}
                    className="reader-settings-option inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium"
                    style={{
                      borderColor: effectiveNotesOnly ? uiScheme.link : surface.hairline,
                      background: effectiveNotesOnly
                        ? withOpacity(uiScheme.link, 0.08)
                        : "transparent",
                      color: effectiveNotesOnly ? uiScheme.link : surface.fg,
                    }}
                  >
                    <span>有笔记</span>
                    <span className="font-mono text-[11px] tabular-nums opacity-80">
                      {notedCount}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null
      }
    >
      <div className="reader-panel-body custom-scrollbar px-3 py-2 sm:px-5">
        <div className="divide-y pb-3">
          {sortedBookmarks.length > 0 ? (
            sortedBookmarks.map((bookmark) =>
              editingId === bookmark.id ? (
                <div
                  key={bookmark.id}
                  className="py-2.5"
                  style={{ borderColor: surface.hairline }}
                >
                  <div className="px-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <div
                        className="truncate text-sm font-medium leading-6"
                        style={{ color: surface.fg }}
                        title={bookmark.chapter || "未识别章节"}
                      >
                        {bookmark.chapter || "未识别章节"}
                      </div>
                      <span
                        className="shrink-0 text-xs font-medium tabular-nums"
                        style={{ color: uiScheme.link }}
                      >
                        {formatPercent(bookmark.percentage)}
                      </span>
                    </div>
                    <textarea
                      ref={textareaRef}
                      value={draftNote}
                      onChange={(event) => setDraftNote(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === "Enter"
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleSaveNote(bookmark.id);
                          return;
                        }
                        if (
                          event.key === "Escape" &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          handleCancelEdit();
                        }
                      }}
                      aria-label="书签备注"
                      placeholder="添加阅读笔记或摘录…"
                      rows={3}
                      maxLength={10240}
                      disabled={isUpdatingNote}
                      className="mt-2 w-full resize-y rounded-lg border px-2.5 py-2 text-xs leading-5 outline-none transition-colors focus-visible:border-[var(--reader-panel-accent)] focus-visible:ring-2 focus-visible:ring-[var(--reader-panel-accent)]/25"
                      style={{
                        color: surface.fg,
                        borderColor: surface.border,
                        backgroundColor: uiScheme.cardBg,
                      }}
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={isUpdatingNote}
                        className="reader-panel-secondary !h-8 px-3 text-xs"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveNote(bookmark.id)}
                        disabled={isUpdatingNote}
                        aria-busy={isUpdatingNote || undefined}
                        className="reader-panel-action !h-8 px-3 text-xs"
                      >
                        {isUpdatingNote ? (
                          <Loader2
                            className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                            strokeWidth={1.6}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span>保存</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
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
                        className="mt-1.5 line-clamp-2 border-l-2 pl-2.5 text-xs leading-5"
                        style={{
                          borderColor: uiScheme.link,
                          color: surface.muted,
                        }}
                        title={bookmark.note}
                      >
                        {bookmark.note}
                      </p>
                    ) : null}
                    <div
                      className="mt-1.5 flex flex-wrap items-center gap-2 text-xs leading-5"
                      style={{ color: surface.muted }}
                    >
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none tabular-nums"
                        style={{
                          background: `color-mix(in srgb, ${uiScheme.link} 12%, transparent)`,
                          color: uiScheme.link,
                        }}
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
                  <div className="flex shrink-0 items-center gap-0.5">
                    {onUpdateNote ? (
                      <ActionIcon
                        variant="subtle"
                        size={44}
                        radius="md"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(bookmark);
                        }}
                        title="编辑备注"
                        aria-label={`编辑书签备注：${bookmark.chapter || "未识别章节"}`}
                        className="reader-panel-icon opacity-80 focus-visible:opacity-100 sm:opacity-60 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                      </ActionIcon>
                    ) : null}
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
                </div>
              ),
            )
          ) : (
            <ReaderEmptyState
              icon={<Bookmark className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />}
              title="暂无书签"
              description="将当前阅读位置存为书签，方便随时回看。"
              uiScheme={uiScheme}
              action={
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
              }
            />
          )}
        </div>
      </div>
    </ReaderSheet>
  );
}
