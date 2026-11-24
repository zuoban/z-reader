'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Button, Modal } from '@mantine/core';
import { BookOpen, CircleAlert, HardDrive, RotateCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/AppShell';
import { getOfflineLibrary } from '@/lib/library-access';
import {
  clearOfflineBooks,
  listOfflineBooks,
  removeOfflineBook,
  type OfflineBookSummary,
} from '@/lib/offline-books';
import { cn } from '@/lib/utils';

interface OfflineBooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatStorageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

  const isBusy = isClearing || Boolean(removingId);

  useEffect(() => {
    if (!open || library !== getOfflineLibrary()) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsLoading(true);
      setLoadError(false);
      setConfirmingClear(false);
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
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setConfirmingClear(false);
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [confirmingClear, isBusy, open]);

  const totalBytes = useMemo(
    () => books.reduce((sum, item) => sum + item.size, 0),
    [books]
  );

  function handleClose() {
    if (isBusy) return;
    setConfirmingClear(false);
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
      : `已缓存 ${books.length} 本 · 共 ${formatStorageSize(totalBytes)}`;

  return (
    <Modal.Root
      opened={open}
      onClose={handleClose}
      closeOnClickOutside={!isBusy}
      closeOnEscape={!isBusy && !confirmingClear}
      centered
      size={512}
      radius="lg"
      padding={0}
      zIndex={80}
      classNames={{
        content:
          'app-dialog-shell flex max-h-[min(82svh,36rem)] flex-col overflow-hidden overscroll-contain rounded-2xl border p-0 text-sm text-popover-foreground outline-none',
      }}
    >
      <Modal.Overlay backgroundOpacity={0.42} blur={3} />
      <Modal.Content>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="app-sheet-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15">
              <HardDrive className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <Modal.Title className="font-heading text-[17px] font-medium leading-tight text-foreground">
                离线图书管理
              </Modal.Title>
              <p className="mt-0.5 truncate font-mono text-xs leading-5 tabular-nums text-muted-foreground">
                {headerSubtitle}
              </p>
            </div>
          </div>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={36}
            radius="md"
            disabled={isBusy}
            className="dialog-close-btn -mr-1 h-9 w-9 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
            onClick={handleClose}
            aria-label="关闭离线图书管理"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
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
                className="mt-4 h-9 cursor-pointer rounded-lg px-3.5 text-xs font-medium sm:h-8"
              >
                重新加载
              </Button>
            </div>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/35 px-5 py-9 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <BookOpen className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                暂无已保存的离线图书
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                在阅读器顶部点击「离线」，即可将书籍缓存到此设备，断网时可直接继续阅读。
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-surface-subtle/55">
              {books.map((book) => {
                const bookLabel = book.title || book.filename;
                const isRemovingThis = removingId === book.bookId;

                return (
                  <li
                    key={book.bookId}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-card/80',
                      isRemovingThis && 'bg-destructive/5'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/75 bg-card text-muted-foreground">
                        <BookOpen className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground" title={bookLabel}>
                          {bookLabel}
                        </p>
                        <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                          {[book.author, formatStorageSize(book.size)]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
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
                          'h-9 cursor-pointer rounded-lg px-3 text-xs font-medium transition-transform active:scale-[0.97] sm:h-8',
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
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                        }
                        className="h-9 cursor-pointer rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-45 sm:h-8"
                      >
                        {isRemovingThis ? '移除中…' : '移除'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="app-dialog-footer flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          {confirmingClear && books.length > 0 ? (
            <>
              <p className="text-xs font-medium text-destructive">
                确定清空全部 {books.length} 本离线缓存？
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  disabled={isClearing}
                  onClick={() => setConfirmingClear(false)}
                  className="h-8 cursor-pointer rounded-lg px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45"
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
                  className="h-8 cursor-pointer rounded-lg px-3.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isClearing ? '清空中…' : '确认清空'}
                </Button>
              </div>
            </>
          ) : (
            <>
              {books.length > 0 ? (
                <Button
                  type="button"
                  variant="subtle"
                  color="red"
                  size="xs"
                  disabled={isBusy}
                  onClick={() => setConfirmingClear(true)}
                  leftSection={
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  }
                  className="h-8 cursor-pointer rounded-lg px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-45"
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
                className="h-8 shrink-0 cursor-pointer rounded-lg px-4 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45"
                onClick={handleClose}
              >
                关闭
              </Button>
            </>
          )}
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
