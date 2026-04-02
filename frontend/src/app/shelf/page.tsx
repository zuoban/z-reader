'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { BookOpen, Library, LogOut, Plus, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { api, Book, Category } from '@/lib/api';
import { extractBookPreview } from '@/lib/book-preview';
import { BookCard } from '@/components/BookCard';
import { CategoryManager } from '@/components/CategoryManager';
import { CategoryFilter } from '@/components/CategoryFilter';
import { buildRadialCategoryTargets, RadialCategoryMenu } from '@/components/RadialCategoryMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SUPPORTED_FORMATS_ACCEPT = '.epub,.mobi,.azw3,.pdf,application/pdf';
const UNCATEGORIZED_FILTER_ID = 'uncategorized';

interface ActiveCategoryDrag {
  bookId: string;
  anchorX: number;
  anchorY: number;
  pointerX: number;
  pointerY: number;
}

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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [activeCategoryDrag, setActiveCategoryDrag] = useState<ActiveCategoryDrag | null>(null);
  const [radialHoverCategoryId, setRadialHoverCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const activeCategoryDragRef = useRef<ActiveCategoryDrag | null>(null);
  const radialHoverCategoryIdRef = useRef<string | null>(null);
  const radialTargetsRef = useRef<ReturnType<typeof buildRadialCategoryTargets>>([]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const loadBooks = useCallback(async () => {
    try {
      const data = await api.listBooks();
      setBooks(sortBooksByRecentRead(data || []));
    } catch {
      setBooks([]);
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

  const handleBookDrop = useCallback(
    async (bookId: string, categoryId: string | null) => {
      setRadialHoverCategoryId(null);

      const currentBook = books.find((book) => book.id === bookId);
      if (!currentBook || currentBook.category_id === categoryId) {
        setActiveCategoryDrag(null);
        setRadialHoverCategoryId(null);
        return;
      }

      setBooks((prev) =>
        sortBooksByRecentRead(prev.map((book) =>
          book.id === bookId
            ? { ...book, category_id: categoryId ?? undefined }
            : book
        ))
      );

      try {
        const updatedBook = categoryId === null
          ? await api.removeBookCategory(bookId)
          : await api.updateBook(bookId, { category_id: categoryId });
        setBooks((prev) =>
          sortBooksByRecentRead(prev.map((book) => (book.id === bookId ? updatedBook : book)))
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : '分类失败');
        await loadBooks();
      } finally {
        setActiveCategoryDrag(null);
        setRadialHoverCategoryId(null);
      }
    },
    [books, loadBooks]
  );

  useEffect(() => {
    activeCategoryDragRef.current = activeCategoryDrag;
  }, [activeCategoryDrag]);

  useEffect(() => {
    radialHoverCategoryIdRef.current = radialHoverCategoryId;
  }, [radialHoverCategoryId]);

  const draggedBookOriginalCategoryId = useMemo(() => {
    if (!activeCategoryDrag) return null;
    return books.find((book) => book.id === activeCategoryDrag.bookId)?.category_id ?? null;
  }, [activeCategoryDrag, books]);

  const radialTargets = useMemo(() => {
    if (!activeCategoryDrag) return [];
    return buildRadialCategoryTargets(categories, bookCounts, draggedBookOriginalCategoryId);
  }, [activeCategoryDrag, bookCounts, categories, draggedBookOriginalCategoryId]);

  useEffect(() => {
    radialTargetsRef.current = radialTargets;
  }, [radialTargets]);

  const updateRadialHover = useCallback(
    (pointerX: number, pointerY: number) => {
      const currentDrag = activeCategoryDragRef.current;
      if (!currentDrag) return;

      let nextHovered: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      radialTargetsRef.current.forEach((target) => {
        if (target.blocked) return;

        const centerX = currentDrag.anchorX + target.dx;
        const centerY = currentDrag.anchorY + target.dy;
        const distance = Math.hypot(pointerX - centerX, pointerY - centerY);
        const hitRadius = target.isClear ? target.size * 0.85 : target.size * 0.72;

        if (distance <= hitRadius && distance < nearestDistance) {
          nearestDistance = distance;
          nextHovered = target.id;
        }
      });

      radialHoverCategoryIdRef.current = nextHovered;
      setRadialHoverCategoryId(nextHovered);
    },
    []
  );

  const handleCategoryDragStart = useCallback(
    ({
      bookId,
      anchorX,
      anchorY,
      pointerX,
      pointerY,
    }: {
      bookId: string;
      anchorX: number;
      anchorY: number;
      pointerX: number;
      pointerY: number;
    }) => {
      setActiveCategoryDrag({
        bookId,
        anchorX,
        anchorY,
        pointerX,
        pointerY,
      });
      activeCategoryDragRef.current = {
        bookId,
        anchorX,
        anchorY,
        pointerX,
        pointerY,
      };
      setRadialHoverCategoryId(null);
      radialHoverCategoryIdRef.current = null;
      updateRadialHover(pointerX, pointerY);
    },
    [updateRadialHover]
  );

  const handleCategoryDragMove = useCallback(
    ({ pointerX, pointerY }: { pointerX: number; pointerY: number }) => {
      setActiveCategoryDrag((prev) => {
        if (!prev) return prev;

        const next = {
          ...prev,
          pointerX,
          pointerY,
        };
        activeCategoryDragRef.current = next;
        return next;
      });
      updateRadialHover(pointerX, pointerY);
    },
    [updateRadialHover]
  );

  const handleCategoryDragEnd = useCallback(() => {
    const currentDrag = activeCategoryDragRef.current;
    if (!currentDrag) return;

    const hoveredTarget = radialTargetsRef.current.find(
      (target) => target.id === radialHoverCategoryIdRef.current
    );

    if (hoveredTarget && !hoveredTarget.blocked) {
      void handleBookDrop(currentDrag.bookId, hoveredTarget.categoryId);
      return;
    }

    activeCategoryDragRef.current = null;
    radialHoverCategoryIdRef.current = null;
    setActiveCategoryDrag(null);
    setRadialHoverCategoryId(null);
  }, [handleBookDrop]);

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
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
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
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <header className="rounded-[28px] border border-border/60 bg-background/82 px-4 py-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.38)] backdrop-blur-xl sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <Image
                  src="/icons/logo-wordmark.svg"
                  alt="Z Reader"
                  width={200}
                  height={61}
                  className="h-auto w-[150px] sm:w-[200px]"
                  priority
                />
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:text-sm">
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

            <div className="flex items-center justify-between gap-2 rounded-[22px] bg-muted/65 p-1.5 sm:justify-end sm:rounded-full sm:bg-transparent sm:p-0">
              <div className="text-[11px] leading-tight text-muted-foreground sm:hidden">
                <p className="font-medium text-foreground">移动书架</p>
                <p>上传、分类、继续阅读</p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
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
                    className="pointer-events-none h-10 w-10 shrink-0 rounded-full border-border/70 bg-background p-0 shadow-none"
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
                  className="h-10 w-10 shrink-0 rounded-full border-border/70 bg-background p-0 text-foreground shadow-none hover:bg-muted"
                >
                  <LogOut className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 py-6 sm:py-10">
          {books.length === 0 ? (
            <div className="flex min-h-[58vh] items-center justify-center">
              <div className="w-full max-w-xl rounded-[32px] border border-black/10 bg-white/90 px-5 py-12 text-center shadow-[0_28px_68px_-44px_rgba(15,23,42,0.42)] sm:px-12 sm:py-16">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] border border-black/10 bg-gradient-to-br from-stone-100 to-white shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)] sm:h-18 sm:w-18 sm:rounded-[28px]">
                  <BookOpen className="h-8 w-8 text-muted-foreground/80 sm:h-10 sm:w-10" />
                </div>
                <p className="mt-6 text-xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  书架还是空的
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                  上传你的第一本 EPUB、MOBI、AZW3 或 PDF
                </p>
                <div className="mt-8 flex justify-center">
                  <div className="relative w-full sm:w-auto">
                    <Input
                      type="file"
                      accept={SUPPORTED_FORMATS_ACCEPT}
                      onChange={handleUpload}
                      disabled={isUploading}
                      className="absolute inset-0 z-20 cursor-pointer opacity-0"
                      title="上传书籍"
                    />
                    <Button className="group h-11 w-full rounded-xl px-6 text-sm sm:w-auto sm:px-8" disabled={isUploading}>
                      {isUploading ? (
                        <>
                          <div className="mr-2.5 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 spinner-border-primary" />
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
            <section className="relative isolate">
              {activeCategoryDrag && (
                <div className="pointer-events-none absolute inset-0 z-10 rounded-[24px] bg-foreground/5 backdrop-blur-[1.5px] transition-opacity duration-200" />
              )}

              {categories.length > 0 && (
                <div className="relative z-20 mb-5 space-y-3 rounded-[26px] border border-border/55 bg-background/72 px-3 py-3 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.32)] backdrop-blur-xl sm:mb-6 sm:space-y-2 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none">
                  <p className="px-1 text-[12px] leading-5 text-muted-foreground sm:px-0 sm:text-xs">
                    点击左上角拖动按钮并滑向扇形分类，松手即可归类；点下面的标签可以筛选书架。
                  </p>
                  <CategoryFilter
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onSelectCategory={setSelectedCategoryId}
                    bookCounts={bookCounts}
                  />
                </div>
              )}

              {activeCategoryDrag && radialTargets.length > 0 && (
                <RadialCategoryMenu
                  anchorX={activeCategoryDrag.anchorX}
                  anchorY={activeCategoryDrag.anchorY}
                  targets={radialTargets}
                  hoveredCategoryId={radialHoverCategoryId}
                />
              )}

              <div className="relative z-0 grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                {filteredBooks.map((book, index) => (
                  <BookCard
                    key={`${book.id}:${book.cover_path ?? ''}:${book.format}`}
                    book={book}
                    index={index}
                    categories={categories}
                    onRead={() => router.push(`/read/${book.id}`)}
                    onDelete={() => handleDelete(book.id)}
                    onUpdate={loadBooks}
                    isDeleting={deletingId === book.id}
                    isDragging={activeCategoryDrag?.bookId === book.id}
                    onDragStart={handleCategoryDragStart}
                    onDragMove={handleCategoryDragMove}
                    onDragEnd={handleCategoryDragEnd}
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
