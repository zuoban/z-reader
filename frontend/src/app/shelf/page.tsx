'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookOpen, Library, LogOut, Plus, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { api, Book, Category } from '@/lib/api';
import { extractBookPreview } from '@/lib/book-preview';
import { AppScreen, BrandMark, LoadingSpinner } from '@/components/AppShell';
import { BookCard } from '@/components/BookCard';
import { BookCardSkeletonGrid } from '@/components/BookCardSkeleton';
import { CategoryManager } from '@/components/CategoryManager';
import { CategoryFilter } from '@/components/CategoryFilter';
import { EmptyState } from '@/components/EmptyState';
import { FileUploadAction } from '@/components/FileUploadAction';
import { Button } from '@/components/ui/button';

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
      <AppScreen ambient="shelf">
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner />
            <p className="text-sm font-medium text-muted-foreground">加载中...</p>
          </div>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      ambient="shelf"
      contentClassName="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-3 sm:px-7 sm:py-7 lg:px-10 lg:py-9"
    >
      <header className="rounded-[24px] border border-border/55 bg-background/82 px-4 py-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.38)] backdrop-blur-xl sm:rounded-[28px] sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <BrandMark size="lg" className="hidden sm:block" priority />
              <BrandMark size="sm" className="sm:hidden" priority />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-muted/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
            <CategoryManager onCategoryChange={loadCategories} />
            <FileUploadAction
              accept={SUPPORTED_FORMATS_ACCEPT}
              onChange={handleUpload}
              disabled={isUploading}
              title="上传书籍"
              buttonVariant="outline"
              buttonSize="sm"
              buttonClassName="h-10 w-10 shrink-0 rounded-full border-border/60 bg-background/86 p-0 shadow-none sm:h-11 sm:w-11"
            >
              {isUploading ? (
                <LoadingSpinner className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              )}
            </FileUploadAction>

            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              title="退出"
              className="h-10 w-10 shrink-0 rounded-full border-border/60 bg-background/86 p-0 text-foreground shadow-none hover:bg-background sm:h-11 sm:w-11 cursor-pointer"
            >
              <LogOut className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </Button>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] leading-5 text-muted-foreground sm:mt-4 sm:text-[13px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-[12px] font-semibold leading-5 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.48)] sm:text-[13px]">
            <Library className="h-3.5 w-3.5" />
            我的书架
          </span>
          <span className="font-medium tabular-nums">共 {books.length} 本书</span>
        </div>
      </header>

      <main className="flex-1 py-5 sm:py-10">
        {!isLoadingBooks && books.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="书架还是空的"
            description="上传你的第一本 EPUB、MOBI、AZW3 或 PDF，开始你的阅读之旅"
            tags={['EPUB', 'MOBI', 'AZW3', 'PDF']}
            action={
              <FileUploadAction
                accept={SUPPORTED_FORMATS_ACCEPT}
                onChange={handleUpload}
                disabled={isUploading}
                title="上传书籍"
                wrapperClassName="w-full sm:w-auto"
                buttonClassName="h-12 w-full rounded-xl bg-foreground px-8 text-sm font-medium text-background shadow-[0_12px_32px_-16px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-foreground/92 hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.5)] active:scale-[0.98] sm:w-auto sm:px-10"
              >
                {isUploading ? (
                  <>
                    <LoadingSpinner inverted className="mr-2.5 h-4 w-4 border-background/30" />
                    添加中...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2.5 h-4 w-4" />
                    添加第一本书
                  </>
                )}
              </FileUploadAction>
            }
          />
        ) : (
          <section className="relative isolate">
            {categories.length > 0 && (
              <div className="relative z-20 mb-4 sm:mb-6">
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
    </AppScreen>
  );
}
