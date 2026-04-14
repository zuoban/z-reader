'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookOpen, Library, LogOut, Plus, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { api, Book, Category } from '@/lib/api';
import { extractBookPreview } from '@/lib/book-preview';
import { BookCard } from '@/components/BookCard';
import { BookCardSkeletonGrid } from '@/components/BookCardSkeleton';
import { CategoryManager } from '@/components/CategoryManager';
import { CategoryFilter } from '@/components/CategoryFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';


const SUPPORTED_FORMATS_ACCEPT = '.epub,.mobi,.azw3,.pdf,application/pdf';
const UNCATEGORIZED_FILTER_ID = 'uncategorized';

function getSortTimestamp(date?: string): number {
  if (!date) return 0;
  const timestamp = Date.parse(date);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortBooksByRecentRead(items: Book[]): Book[] {
  return [...items].sort((a, b) => {
    const readDiff = getSortTimestamp(b.last_read_at) - getSortTimestamp(a.last_read_at);
    if (readDiff !== 0) return readDiff;

    return getSortTimestamp(b.created_at) - getSortTimestamp(a.created_at);
  });
}

function ShelfAmbientBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden shelf-ambient-bg" />
  );
}

export default function ShelfPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, logout } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const loadBooks = useCallback(async () => {
    setIsLoadingBooks(true);
    try {
      const data = await api.listBooks();
      setBooks(sortBooksByRecentRead(data || []));
    } catch {
      setBooks([]);
    } finally {
      setIsLoadingBooks(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const data = await api.listCategories();
      setCategories(data || []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      void loadBooks();
      void loadCategories();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated, loadBooks, loadCategories]);

  const filteredBooks = useMemo(() => {
    if (!selectedCategoryId) return books;
    if (selectedCategoryId === UNCATEGORIZED_FILTER_ID) {
      return books.filter((book) => !book.category_id);
    }
    return books.filter((b) => b.category_id === selectedCategoryId);
  }, [books, selectedCategoryId]);

  const bookCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: books.length,
      [UNCATEGORIZED_FILTER_ID]: 0,
    };
    books.forEach((book) => {
      if (book.category_id) {
        counts[book.category_id] = (counts[book.category_id] || 0) + 1;
      } else {
        counts[UNCATEGORIZED_FILTER_ID] += 1;
      }
    });
    return counts;
  }, [books]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const book = await api.uploadBook(file);
      setBooks((prev) => sortBooksByRecentRead([...prev, book]));

      void (async () => {
        try {
          const preview = await extractBookPreview(file);
          const updated = await api.updateBook(book.id, {
            title: preview.title,
            author: preview.author,
          });

          if (preview.cover) {
            const coverFileName = file.name.replace(/\.[^.]+$/, '.png');
            const finalBook = await api.uploadCover(book.id, preview.cover, coverFileName);
            setBooks((prevBooks) =>
              sortBooksByRecentRead(prevBooks.map((b) => (b.id === book.id ? finalBook : b)))
            );
            return;
          }

          setBooks((prevBooks) =>
            sortBooksByRecentRead(prevBooks.map((b) => (b.id === book.id ? updated : b)))
          );
        } catch (previewErr) {
          console.warn('Failed to enrich uploaded book:', previewErr);
        }
      })();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
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
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
    setDeletingId(null);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="relative min-h-screen overflow-hidden warm-gradient">
        <ShelfAmbientBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-foreground/20"
              style={{ borderTopColor: 'var(--foreground)' }}
            />
            <p className="text-sm text-muted-foreground font-medium">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden warm-gradient">
      <ShelfAmbientBackground />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-3 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <header className="rounded-[24px] border border-border/60 bg-background/82 px-3.5 py-3.5 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.38)] backdrop-blur-xl sm:rounded-[28px] sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <Image
                  src="/icons/logo-wordmark.svg"
                  alt="Z Reader"
                  width={200}
                  height={61}
                  className="h-auto w-[142px] sm:w-[200px]"
                  priority
                />
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground sm:mt-3 sm:text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-1 text-[11px] font-medium text-foreground sm:bg-transparent sm:px-0 sm:py-0 sm:text-sm">
                    <Library className="h-3.5 w-3.5" />
                    我的书架
                  </span>
                  <span className="hidden text-border sm:inline">/</span>
                  <span>共 {books.length} 本书</span>
                  {filteredBooks.length !== books.length && (
                    <>
                      <span className="hidden text-border sm:inline">/</span>
                      <span>当前 {filteredBooks.length} 本</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[20px] border border-border/50 bg-muted/55 px-2 py-2 sm:justify-end sm:rounded-full sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
              <div className="sm:hidden">
                <p className="text-[11px] font-medium tracking-[0.02em] text-foreground">随手整理你的书架</p>
                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">上传、分类、继续阅读</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-[18px] bg-background/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] sm:gap-3 sm:rounded-full sm:bg-transparent sm:p-0 sm:shadow-none">
                <CategoryManager onCategoryChange={loadCategories} />
                <div className="relative min-w-0">
                  <Input
                    type="file"
                    accept={SUPPORTED_FORMATS_ACCEPT}
                    onChange={handleUpload}
                    disabled={isUploading}
                    className="absolute inset-0 z-20 cursor-pointer opacity-0"
                    title="上传书籍"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="pointer-events-none h-11 w-11 shrink-0 rounded-full border-border/70 bg-background p-0 shadow-none sm:h-11 sm:w-11"
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/20 spinner-border" />
                    ) : (
                      <Upload className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                    )}
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  title="退出"
                  className="h-11 w-11 shrink-0 rounded-full border-border/70 bg-background p-0 text-foreground shadow-none hover:bg-muted sm:h-11 sm:w-11 cursor-pointer"
                >
                  <LogOut className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 py-5 sm:py-10">
          {!isLoadingBooks && books.length === 0 ? (
            <div className="flex min-h-[58vh] items-center justify-center">
              <div className="w-full max-w-xl rounded-[36px] border border-black/8 bg-white/95 px-6 py-14 text-center shadow-[0_32px_80px_-48px_rgba(15,23,42,0.38),0_12px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:px-14 sm:py-18">
                {/* 装饰性背景元素 */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/5 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-black/5 to-transparent" />

                {/* 主图标区域 - 增加层次感 */}
                <div className="relative mx-auto mb-8 inline-flex">
                  <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-primary/8 via-transparent to-transparent blur-xl" />
                  <div className="relative mx-auto flex h-18 w-18 items-center justify-center rounded-[28px] border border-black/8 bg-gradient-to-br from-stone-50 via-white to-stone-100 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.32),inset_0_1px_1px_rgba(255,255,255,0.8)] sm:h-22 sm:w-22 sm:rounded-[32px]">
                    <BookOpen className="h-9 w-9 text-muted-foreground/70 sm:h-11 sm:w-11" />
                  </div>
                </div>

                {/* 标题区域 */}
                <div className="space-y-3">
                  <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3.5xl">
                    书架还是空的
                  </p>
                  <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground sm:max-w-sm sm:text-base">
                    上传你的第一本 EPUB、MOBI、AZW3 或 PDF，开始你的阅读之旅
                  </p>
                </div>

                {/* 支持格式标签 */}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {['EPUB', 'MOBI', 'AZW3', 'PDF'].map((format) => (
                    <span
                      key={format}
                      className="rounded-full border border-black/8 bg-muted/40 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground sm:text-xs"
                    >
                      {format}
                    </span>
                  ))}
                </div>

                {/* 操作按钮 */}
                <div className="mt-10 flex justify-center">
                  <div className="relative w-full sm:w-auto">
                    <Input
                      type="file"
                      accept={SUPPORTED_FORMATS_ACCEPT}
                      onChange={handleUpload}
                      disabled={isUploading}
                      className="absolute inset-0 z-20 cursor-pointer opacity-0"
                      title="上传书籍"
                    />
                    <Button
                      className="group relative h-12 w-full overflow-hidden rounded-xl bg-foreground px-8 text-sm font-medium text-background shadow-[0_12px_32px_-16px_rgba(15,23,42,0.45)] transition-[transform,shadow] duration-300 hover:scale-[1.02] hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.5)] active:scale-[0.98] sm:w-auto sm:px-10 cursor-pointer"
                      disabled={isUploading}
                    >
                      <span className="relative z-10 flex items-center">
                        {isUploading ? (
                          <>
                            <div className="mr-2.5 h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                            添加中...
                          </>
                        ) : (
                          <>
                            <Plus className="mr-2.5 h-4 w-4 transition-transform group-hover:scale-110" />
                            添加第一本书
                          </>
                        )}
                      </span>
                      {/* 按钮光效 */}
                      <div className="absolute inset-0 -z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <section className="relative isolate">
              {categories.length > 0 && (
                <div className="relative z-20 mb-4 space-y-2.5 rounded-[24px] border border-border/55 bg-background/78 px-3.5 py-3.5 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.32)] backdrop-blur-xl sm:mb-6 sm:space-y-2 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none">
                  <div className="flex items-center gap-3 px-0.5 sm:hidden">
                    <p className="text-[11px] font-medium text-foreground">书架筛选</p>
                  </div>
                  <p className="px-0.5 text-[11px] leading-4.5 text-muted-foreground sm:px-0 sm:text-xs sm:leading-5">
                    点击左上角标签设置分类，点筛选标签筛选书架。
                  </p>
                  <CategoryFilter
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onSelectCategory={setSelectedCategoryId}
                    bookCounts={bookCounts}
                  />
                </div>
              )}

              {isLoadingBooks ? (
                <BookCardSkeletonGrid count={6} />
              ) : (
                <div className="relative z-0 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-x-5 sm:gap-y-6 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] lg:gap-x-6 lg:gap-y-7">
                  {filteredBooks.map((book, index) => (
                    <BookCard
                      key={`${book.id}:${book.cover_path ?? ''}:${book.format}`}
                      book={book}
                      index={index}
                      categories={categories}
                      bookCounts={bookCounts}
                      onRead={() => router.push(`/read/${book.id}`)}
                      onDelete={() => handleDelete(book.id)}
                      onUpdate={loadBooks}
                      isDeleting={deletingId === book.id}
                      formatSize={formatSize}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
