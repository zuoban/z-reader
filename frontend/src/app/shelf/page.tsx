'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Library, LogOut, Plus, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { api, Book } from '@/lib/api';
import { BookCard } from '@/components/BookCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ShelfPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, logout } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const loadBooks = useCallback(async () => {
    try {
      const data = await api.listBooks();
      setBooks(data || []);
    } catch {
      setBooks([]);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      void loadBooks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated, loadBooks]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const book = await api.uploadBook(file);
      setBooks((prev) => [...prev, book]);
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败');
    }

    setIsUploading(false);
    e.target.value = '';
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
    setDeletingId(null);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen warm-gradient paper-texture flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-foreground/20"
            style={{ borderTopColor: 'var(--foreground)' }}
          />
          <p className="text-sm text-muted-foreground font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen warm-gradient paper-texture">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <header className="border-b border-border/70 pb-5 sm:pb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)] sm:h-12 sm:w-12">
                <Library className="h-5 w-5 text-muted-foreground sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  我的书架
                </h1>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  共 {books.length} 本书
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
              <div className="relative min-w-0">
                <Input
                  type="file"
                  accept=".epub"
                  onChange={handleUpload}
                  disabled={isUploading}
                  className="absolute inset-0 z-20 cursor-pointer opacity-0"
                  title="上传 EPUB"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-events-none h-10 min-w-[44px] gap-2 rounded-lg border-border/70 bg-background px-0 shadow-none sm:h-11 sm:min-w-[52px] sm:px-3.5"
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/20 spinner-border"
                      />
                      <span className="hidden sm:inline text-sm">上传中</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                      <span className="hidden text-sm font-medium sm:inline">导入</span>
                    </>
                  )}
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="h-10 min-w-[44px] rounded-lg border-border/70 bg-background px-0 text-foreground shadow-none hover:bg-muted sm:h-11 sm:min-w-[52px] sm:px-3.5"
              >
                <LogOut className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                <span className="hidden text-sm font-medium sm:inline">退出</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 py-8 sm:py-10">
          {books.length === 0 ? (
            <div className="flex min-h-[56vh] items-center justify-center">
              <div className="w-full max-w-lg rounded-[28px] border border-border/70 bg-background px-7 py-14 text-center shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)] sm:px-12 sm:py-16">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/80 ring-1 ring-border/60">
                  <BookOpen className="h-8 w-8 text-muted-foreground sm:h-9 sm:w-9" />
                </div>
                <p className="mt-6 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  书架还是空的
                </p>
                <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                  上传你的第一本 EPUB 书籍
                </p>
                <div className="mt-8 flex justify-center">
                  <div className="relative w-full sm:w-auto">
                    <Input
                      type="file"
                      accept=".epub"
                      onChange={handleUpload}
                      disabled={isUploading}
                      className="absolute inset-0 z-20 cursor-pointer opacity-0"
                      title="上传 EPUB"
                    />
                    <Button className="group h-11 w-full rounded-xl px-6 text-sm sm:w-auto sm:px-8" disabled={isUploading}>
                      {isUploading ? (
                        <>
                          <div
                            className="mr-2.5 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 spinner-border-primary"
                          />
                          添加中
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2.5 h-4 w-4 rotate-plus" />
                          添加第一本书
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <section>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {books.map((book, index) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    index={index}
                    onRead={() => router.push(`/read/${book.id}`)}
                    onDelete={() => handleDelete(book.id)}
                    isDeleting={deletingId === book.id}
                    formatSize={formatSize}
                  />
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
