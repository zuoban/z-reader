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
      setBooks(data || []);
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
        prev.map((book) =>
          book.id === bookId
            ? { ...book, category_id: categoryId ?? undefined }
            : book
        )
      );

      try {
        const updatedBook = categoryId === null
          ? await api.removeBookCategory(bookId)
          : await api.updateBook(bookId, { category_id: categoryId });
        setBooks((prev) => prev.map((book) => (book.id === bookId ? updatedBook : book)));
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
      setBooks((prev) => [...prev, book]);

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
            setBooks((prevBooks) => prevBooks.map((b) => (b.id === book.id ? finalBook : b)));
            return;
          }

          setBooks((prevBooks) => prevBooks.map((b) => (b.id === book.id ? updated : b)));
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
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <header className="border-b border-border/60 pb-5 sm:pb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-center gap-4">
              <div className="min-w-0">
                <Image
                  src="/icons/logo-wordmark.svg"
                  alt="Z Reader"
                  width={200}
                  height={61}
                  className="h-auto w-[156px] sm:w-[200px]"
                  priority
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                  <Library className="h-3.5 w-3.5" />
                  <span>我的书架</span>
                  <span className="text-border">/</span>
                  <span>共 {books.length} 本书</span>
                </div>
              </div>
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
                  className="pointer-events-none h-9 w-9 shrink-0 rounded-full border-border/70 bg-background p-0 shadow-none sm:h-10 sm:w-10"
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
                className="h-9 w-9 shrink-0 rounded-full border-border/70 bg-background p-0 text-foreground shadow-none hover:bg-muted sm:h-10 sm:w-10"
              >
                <LogOut className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 py-8 sm:py-10">
          {books.length === 0 ? (
            <div className="flex min-h-[58vh] items-center justify-center">
              <div className="w-full max-w-xl rounded-[32px] border border-black/10 bg-white/90 px-7 py-14 text-center shadow-[0_28px_68px_-44px_rgba(15,23,42,0.42)] sm:px-12 sm:py-16">
                <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-[28px] border border-black/10 bg-gradient-to-br from-stone-100 to-white shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
                  <BookOpen className="h-9 w-9 text-muted-foreground/80 sm:h-10 sm:w-10" />
                </div>
                <p className="mt-6 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  书架还是空的
                </p>
                <p className="mt-3 text-sm text-muted-foreground sm:text-base">
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
            <section className="relative isolate">
              {activeCategoryDrag && (
                <div className="pointer-events-none absolute inset-0 z-10 rounded-[24px] bg-foreground/5 backdrop-blur-[1.5px] transition-opacity duration-200" />
              )}

              {categories.length > 0 && (
                <div className="relative z-20 mb-6 space-y-2">
                  <p className="text-xs text-muted-foreground">
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

              <div className="relative z-0 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] justify-center gap-4 sm:grid-cols-[repeat(auto-fill,minmax(184px,1fr))] sm:gap-5 lg:gap-6 xl:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
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
