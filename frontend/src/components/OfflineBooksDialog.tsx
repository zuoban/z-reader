'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Button, Modal } from '@mantine/core';
import { BookOpen, HardDrive, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/AppShell';
import { getOfflineLibrary } from '@/lib/library-access';
import {
  clearOfflineBooks,
  listOfflineBooks,
  removeOfflineBook,
  type OfflineBookSummary,
} from '@/lib/offline-books';

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
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!open || library !== getOfflineLibrary()) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsLoading(true);
      void listOfflineBooks(library)
        .then((items) => {
          if (!cancelled && library === getOfflineLibrary()) {
            setBooks(items);
          }
        })
        .catch(() => {
          if (!cancelled && library === getOfflineLibrary()) {
            setBooks([]);
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
  }, [library, open]);

  const totalBytes = useMemo(
    () => books.reduce((sum, item) => sum + item.size, 0),
    [books]
  );

  async function handleRemove(book: OfflineBookSummary) {
    if (removingId || isClearing || library !== getOfflineLibrary()) return;
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
    if (isClearing || books.length === 0 || library !== getOfflineLibrary()) return;
    setIsClearing(true);
    try {
      await clearOfflineBooks(library);
      setBooks([]);
      toast.success('已清空全部离线缓存');
    } catch {
      toast.error('清空离线缓存失败，请重试');
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <Modal.Root
      opened={open}
      onClose={() => onOpenChange(false)}
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
              <HardDrive className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <Modal.Title className="font-heading text-[17px] font-medium leading-tight text-foreground">
                离线图书管理
              </Modal.Title>
              <p className="mt-0.5 truncate font-mono text-xs leading-5 tabular-nums text-muted-foreground">
                {isLoading
                  ? '正在读取离线缓存…'
                  : `已缓存 ${books.length} 本 · 共 ${formatStorageSize(totalBytes)}`}
              </p>
            </div>
          </div>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={36}
            radius="md"
            className="dialog-close-btn -mr-1 h-9 w-9"
            onClick={() => onOpenChange(false)}
            aria-label="关闭离线图书管理"
          >
            <X className="h-4 w-4" />
          </ActionIcon>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <LoadingSpinner className="h-6 w-6 border-primary/25" />
              <span className="text-xs">读取设备缓存中…</span>
            </div>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/35 px-5 py-9 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <BookOpen className="h-5 w-5" strokeWidth={1.5} />
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
              {books.map((book) => (
                <li
                  key={book.bookId}
                  className="flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-card/80"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/75 bg-card text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {book.title || book.filename}
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
                      onClick={() => onOpenChange(false)}
                      variant="default"
                      size="xs"
                      className="h-9 rounded-lg px-3 text-xs font-medium sm:h-8"
                    >
                      阅读
                    </Button>
                    <Button
                      type="button"
                      variant="subtle"
                      color="red"
                      size="xs"
                      disabled={removingId === book.bookId || isClearing}
                      onClick={() => void handleRemove(book)}
                      aria-label={`移除《${book.title || book.filename}》`}
                      leftSection={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                      className="h-9 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-8"
                    >
                      移除
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="app-dialog-footer flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          {books.length > 0 ? (
            <Button
              type="button"
              variant="subtle"
              color="red"
              size="xs"
              disabled={isClearing || Boolean(removingId)}
              onClick={() => void handleClearAll()}
              leftSection={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
              className="h-8 rounded-lg px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isClearing ? '清空中…' : '清空全部离线缓存'}
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
            className="h-8 shrink-0 rounded-lg px-4 text-xs font-medium"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
