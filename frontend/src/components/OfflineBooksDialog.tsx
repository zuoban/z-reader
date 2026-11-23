'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Button, Modal } from '@mantine/core';
import { BookOpen, HardDrive, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/AppShell';
import { PERSONAL_LIBRARY } from '@/lib/api';
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
  const [books, setBooks] = useState<OfflineBookSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsLoading(true);
      void listOfflineBooks(PERSONAL_LIBRARY)
        .then((items) => {
          if (!cancelled) {
            setBooks(items);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBooks([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const totalBytes = useMemo(
    () => books.reduce((sum, item) => sum + item.size, 0),
    [books]
  );

  async function handleRemove(book: OfflineBookSummary) {
    if (removingId || isClearing) return;
    setRemovingId(book.bookId);
    try {
      await removeOfflineBook(PERSONAL_LIBRARY, book.bookId);
      setBooks((current) => current.filter((item) => item.bookId !== book.bookId));
      toast.success(`已移除《${book.title || book.filename}》的离线缓存`);
    } catch {
      toast.error('移除离线图书失败，请重试');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleClearAll() {
    if (isClearing || books.length === 0) return;
    setIsClearing(true);
    try {
      await clearOfflineBooks(PERSONAL_LIBRARY);
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
      size="lg"
      radius="lg"
      padding={0}
      zIndex={80}
    >
      <Modal.Overlay backgroundOpacity={0.42} blur={3} />
      <Modal.Content className="app-dialog-shell flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border p-5 text-sm text-popover-foreground outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <HardDrive className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div>
              <Modal.Title className="font-heading text-base font-medium leading-tight text-foreground">
                离线图书管理
              </Modal.Title>
              <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
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
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="关闭离线图书管理"
          >
            <X className="h-4 w-4" />
          </ActionIcon>
        </div>

        <div className="mt-4 max-h-[52vh] overflow-y-auto pr-0.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
              <LoadingSpinner className="h-6 w-6 border-primary/25" />
              <span className="text-xs">读取设备缓存中…</span>
            </div>
          ) : books.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-5 py-9 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
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
            <ul className="space-y-2">
              {books.map((book) => (
                <li
                  key={book.bookId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {book.title || book.filename}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[book.author, formatStorageSize(book.size)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      component={Link}
                      href={`/read/${encodeURIComponent(book.bookId)}`}
                      onClick={() => onOpenChange(false)}
                      variant="default"
                      size="xs"
                      className="h-11 rounded-lg px-3 text-xs font-medium sm:h-9"
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
                      className="h-11 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-9"
                    >
                      移除
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2.5 border-t border-border/60 pt-4">
          {books.length > 0 ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isClearing || Boolean(removingId)}
              onClick={() => void handleClearAll()}
              leftSection={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
              className="h-10 rounded-lg border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isClearing ? '清空中…' : '清空全部离线缓存'}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-10 rounded-lg px-5"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
