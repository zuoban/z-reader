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
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-6">
        <header className="rounded-[24px] border border-border/60 bg-background/82 px-4 py-4 shadow-[0_20px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:rounded-[28px] sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-card/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] sm:h-11 sm:w-11">
                  <Library className="h-4.5 w-4.5 text-foreground sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    书库
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {books.length} 本书
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
                  className="pointer-events-none h-10 w-10 gap-2 rounded-full border-border/70 bg-background/75 px-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] sm:h-11 sm:w-auto sm:px-4"
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/20"
                        style={{ borderTopColor: 'var(--foreground)' }}
                      />
                      <span>上传中</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span className="hidden sm:inline">导入 EPUB</span>
                    </>
                  )}
                </Button>
              </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  className="h-10 w-10 rounded-full border-border/70 bg-background/75 px-0 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] hover:bg-background sm:h-11 sm:w-auto sm:px-4"
                >
                  <LogOut className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">退出</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 py-6">
          {books.length === 0 ? (
            <div className="flex min-h-[55vh] items-center justify-center">
              <div className="w-full max-w-xl rounded-[24px] border border-border/60 bg-background/78 px-5 py-10 text-center shadow-[0_20px_70px_-40px_rgba(15,23,42,0.4)] backdrop-blur-xl sm:rounded-[30px] sm:px-8 sm:py-12">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-border/60 bg-card/82 book-shadow sm:h-18 sm:w-18 sm:rounded-[24px]">
                  <BookOpen className="h-8 w-8 text-muted-foreground/45" />
                </div>
                <p className="mt-6 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  这里还没有书
                </p>
                <div className="mt-7 flex justify-center">
                  <div className="relative w-full sm:w-auto">
                    <Input
                      type="file"
                      accept=".epub"
                      onChange={handleUpload}
                      disabled={isUploading}
                      className="absolute inset-0 z-20 cursor-pointer opacity-0"
                      title="上传 EPUB"
                    />
                    <Button
                      className="pointer-events-none h-11 w-full rounded-full px-5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.5)] sm:w-auto"
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <div
                            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30"
                            style={{ borderTopColor: 'var(--primary-foreground)' }}
                          />
                          添加中
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          添加第一本书
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <section className="rounded-[24px] border border-border/55 bg-background/72 p-3 shadow-[0_20px_70px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:rounded-[30px] sm:p-5 lg:p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
