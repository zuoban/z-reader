'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Button, TextInput } from '@mantine/core';
import { BookOpen, CircleAlert, HardDrive, Loader2, RotateCw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppModal } from '@/components/AppModal';
import { LoadingSpinner } from '@/components/AppShell';
import { getOfflineLibrary } from '@/lib/library-access';
import {
  clearOfflineBooks,
  listOfflineBooks,
  removeOfflineBook,
  type OfflineBookSummary,
} from '@/lib/offline-books';
import { cn, formatByteSize } from '@/lib/utils';

interface OfflineBooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OfflineBooksDialog({
  open,
  onOpenChange,
}: OfflineBooksDialogProps) {
  const [library] = useState(getOfflineLibrary);
  const [books, setBooks] = useState<OfflineBookSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const clearAllButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusFrameRef = useRef<number | null>(null);

  const isBusy = isClearing || Boolean(removingId);

  const cancelClearConfirm = useCallback(() => {
    setConfirmingClear(false);
    if (typeof window === 'undefined') return;
    if (restoreFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFocusFrameRef.current);
    }
    restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
      restoreFocusFrameRef.current = null;
      clearAllButtonRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    return () => {
      if (restoreFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFocusFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open || library !== getOfflineLibrary()) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsLoading(true);
      setLoadError(false);
      setConfirmingClear(false);
      setFilterQuery('');
      void listOfflineBooks(library)
        .then((items) => {
          if (!cancelled && library === getOfflineLibrary()) {
            setBooks(items);
          }
        })
        .catch(() => {
          if (!cancelled && library === getOfflineLibrary()) {
            setBooks([]);
            setLoadError(true);
          }
        })
        .finally(() => {
          if (!cancelled && library === getOfflineLibrary()) {
            setIsLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [library, open, reloadCount]);

  useEffect(() => {
    if (!open || !confirmingClear || isBusy) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      cancelClearConfirm();
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [cancelClearConfirm, confirmingClear, isBusy, open]);

  const totalBytes = useMemo(
    () => books.reduce((sum, item) => sum + item.size, 0),
    [books]
  );

  const showFilter = books.length >= 5;
  const trimmedFilter = filterQuery.trim().toLowerCase();
  const visibleBooks = useMemo(() => {
    if (!showFilter || !trimmedFilter) return books;
    return books.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const author = (item.author || '').toLowerCase();
      const filename = (item.filename || '').toLowerCase();
      return (
        title.includes(trimmedFilter) ||
        author.includes(trimmedFilter) ||
        filename.includes(trimmedFilter)
      );
    });
  }, [books, showFilter, trimmedFilter]);

  function handleClose() {
    if (isBusy) return;
    setConfirmingClear(false);
    setFilterQuery('');
    onOpenChange(false);
  }

  async function handleRemove(book: OfflineBookSummary) {
    if (isBusy || library !== getOfflineLibrary()) return;
    setConfirmingClear(false);
    setRemovingId(book.bookId);
    try {
      await removeOfflineBook(library, book.bookId);
      setBooks((current) => current.filter((item) => item.bookId !== book.bookId));
      toast.success(`已移除《${book.title || book.filename}》的离线缓存`);
    } catch {
      toast.error('移除离线图书失败，请重试');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleClearAll() {
    if (isBusy || books.length === 0 || library !== getOfflineLibrary()) return;
    setIsClearing(true);
    try {
      await clearOfflineBooks(library);
      setBooks([]);
      setFilterQuery('');
      toast.success('已清空全部离线缓存');
    } catch {
      toast.error('清空离线缓存失败，请重试');
    } finally {
      setIsClearing(false);
      setConfirmingClear(false);
    }
  }

  const headerSubtitle = isLoading
    ? '正在读取离线缓存…'
    : loadError
      ? '读取离线缓存失败'
      : `已缓存 ${books.length} 本 · 共 ${formatByteSize(totalBytes)}`;

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="离线图书管理"
      subtitle={headerSubtitle}
      subtitleClassName="font-mono tabular-nums"
      icon={<HardDrive className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />}
      size={512}
      closeDisabled={isBusy}
      closeOnEscape={!isBusy && !confirmingClear && !(showFilter && Boolean(filterQuery))}
      closeLabel="关闭离线图书管理"
      contentClassName="max-h-[min(82svh,36rem)] text-sm text-popover-foreground outline-none"
    >
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              aria-busy="true"
              className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground"
            >
              <LoadingSpinner className="h-6 w-6 border-primary/25" />
              <span className="text-xs">读取设备缓存中…</span>
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-9 text-center"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <CircleAlert className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                无法读取离线缓存
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                请检查当前浏览器存储权限，或稍后重新尝试。
              </p>
              <Button
                type="button"
                variant="default"
                size="xs"
                leftSection={<RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />}
                onClick={() => setReloadCount((count) => count + 1)}
                className="mt-4 h-9 cursor-pointer rounded-lg px-3.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 sm:h-8"
              >
                重新加载
              </Button>
            </div>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/35 px-5 py-9 text-center">
              <div className="app-sheet-icon flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15">
                <BookOpen className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                暂无已保存的离线图书
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                在阅读器顶部点击「离线」，即可将书籍缓存到此设备，断网时可直接继续阅读。
              </p>
            </div>
          ) : (
            <>
              {showFilter && (
                <TextInput
                  type="search"
                  value={filterQuery}
                  onChange={(event) => setFilterQuery(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Escape' &&
                      !event.nativeEvent.isComposing &&
                      filterQuery
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      setFilterQuery('');
                    }
                  }}
                  placeholder="按书名或作者筛选离线图书…"
                  aria-label="筛选离线图书"
                  leftSection={
                    <Search
                      className="h-4 w-4 text-muted-foreground"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  }
                  leftSectionPointerEvents="none"
                  leftSectionWidth={36}
                  rightSection={
                    filterQuery ? (
                      <ActionIcon
                        type="button"
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="清除离线筛选"
                        title="清除离线筛选"
                        onClick={() => setFilterQuery('')}
                        className="size-7 cursor-pointer rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <X className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                      </ActionIcon>
                    ) : null
                  }
                  rightSectionPointerEvents={filterQuery ? 'all' : 'none'}
                  rightSectionWidth={34}
                  className="mb-3"
                  classNames={{
                    input: 'app-field h-10 pl-9 pr-9 text-sm sm:h-9',
                  }}
                />
              )}
              {visibleBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/35 px-5 py-8 text-center">
                  <p className="text-xs font-medium text-muted-foreground">
                    未找到匹配的离线图书
                  </p>
                  <Button
                    type="button"
                    variant="default"
                    size="xs"
                    onClick={() => setFilterQuery('')}
                    className="mt-3 h-9 cursor-pointer rounded-lg px-3.5 text-xs font-medium sm:h-8"
                  >
                    清除筛选
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-surface-subtle/55">
                  {visibleBooks.map((book) => {
                const bookLabel = book.title || book.filename;
                const isRemovingThis = removingId === book.bookId;
                const sharePercent =
                  totalBytes > 0
                    ? Math.max(4, Math.min(100, Math.round((book.size / totalBytes) * 100)))
                    : 0;

                return (
                  <li
                    key={book.bookId}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-card/80',
                      isRemovingThis && 'bg-destructive/5'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-accent/60 text-accent-foreground">
                        <BookOpen className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground" title={bookLabel}>
                          {bookLabel}
                        </p>
                        <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                          {[book.author, formatByteSize(book.size)]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {books.length > 1 && totalBytes > 0 && (
                          <div
                            aria-hidden="true"
                            data-storage-share={sharePercent}
                            className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-border/60"
                          >
                            <div
                              className="h-full rounded-full bg-primary/65 transition-[width] duration-300 ease-out"
                              style={{ width: `${sharePercent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        component={Link}
                        href={`/read/${encodeURIComponent(book.bookId)}`}
                        aria-disabled={isBusy || undefined}
                        tabIndex={isBusy ? -1 : undefined}
                        onClick={(event) => {
                          if (isBusy) {
                            event.preventDefault();
                            return;
                          }
                          handleClose();
                        }}
                        variant="default"
                        size="xs"
                        className={cn(
                          'h-9 cursor-pointer rounded-lg px-3 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 sm:h-8',
                          isBusy && 'pointer-events-none opacity-45'
                        )}
                      >
                        阅读
                      </Button>
                      <Button
                        type="button"
                        variant="subtle"
                        color="red"
                        size="xs"
                        disabled={isBusy}
                        aria-busy={isRemovingThis || undefined}
                        onClick={() => void handleRemove(book)}
                        aria-label={
                          isRemovingThis ? `正在移除《${bookLabel}》` : `移除《${bookLabel}》`
                        }
                        leftSection={
                          isRemovingThis ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                          )
                        }
                        className="h-9 cursor-pointer rounded-lg px-2.5 text-xs text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-45 sm:h-8"
                      >
                        {isRemovingThis ? '移除中…' : '移除'}
                      </Button>
                    </div>
                  </li>
                );
              })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="app-dialog-footer flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          {confirmingClear && books.length > 0 ? (
            <>
              <p role="status" className="text-xs font-medium text-destructive">
                确定清空全部 {books.length} 本离线缓存？
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  autoFocus
                  disabled={isClearing}
                  onClick={cancelClearConfirm}
                  className="h-9 cursor-pointer rounded-lg px-3 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-45 sm:h-8"
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="filled"
                  color="red"
                  size="xs"
                  disabled={isClearing}
                  aria-busy={isClearing || undefined}
                  onClick={() => void handleClearAll()}
                  leftSection={
                    isClearing ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    ) : undefined
                  }
                  className="h-9 cursor-pointer rounded-lg px-3.5 text-xs font-medium transition-[background-color,color,transform,opacity] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 sm:h-8"
                >
                  {isClearing ? '清空中…' : '确认清空'}
                </Button>
              </div>
            </>
          ) : (
            <>
              {books.length > 0 ? (
                <Button
                  ref={clearAllButtonRef}
                  type="button"
                  variant="subtle"
                  color="red"
                  size="xs"
                  disabled={isBusy}
                  onClick={() => setConfirmingClear(true)}
                  leftSection={
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  }
                  className="h-9 cursor-pointer rounded-lg px-2.5 text-xs font-medium text-destructive transition-[background-color,color,transform] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-45 sm:h-8"
                >
                  清空全部离线缓存
                </Button>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  离线书籍仅保存在当前浏览器
                </p>
              )}
              <Button
                type="button"
                variant="default"
                size="xs"
                disabled={isBusy}
                className="h-9 shrink-0 cursor-pointer rounded-lg px-4 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-45 sm:h-8"
                onClick={handleClose}
              >
                关闭
              </Button>
            </>
          )}
        </div>
    </AppModal>
  );
}
