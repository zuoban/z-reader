'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, Book, Category } from '@/lib/api';
import { extractBookPreview } from '@/lib/book-preview';

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function useShelfData(isAuthenticated: boolean) {
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    return books.filter((book) => book.category_id === selectedCategoryId);
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

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
              sortBooksByRecentRead(prevBooks.map((item) => (item.id === book.id ? finalBook : item)))
            );
            return;
          }

          setBooks((prevBooks) =>
            sortBooksByRecentRead(prevBooks.map((item) => (item.id === book.id ? updated : item)))
          );
        } catch (previewErr) {
          console.warn('Failed to enrich uploaded book:', previewErr);
        }
      })();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteBook(id);
      setBooks((prev) => prev.filter((book) => book.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  }, []);

  return {
    books,
    categories,
    isLoadingBooks,
    selectedCategoryId,
    setSelectedCategoryId,
    isUploading,
    deletingId,
    filteredBooks,
    bookCounts,
    loadBooks,
    loadCategories,
    handleUpload,
    handleDelete,
    formatFileSize,
    uncategorizedFilterId: UNCATEGORIZED_FILTER_ID,
  };
}
