'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Book } from '@/lib/api';
import { extractBookPreview } from '@/lib/book-preview';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const STORAGE_KEY = 'z-reader-shelf-sort';

export type SortOption = 'recent_read' | 'title' | 'recent_added' | 'author';
const VALID_SORT_OPTIONS: SortOption[] = ['recent_read', 'title', 'recent_added', 'author'];

function readShelfSort(): SortOption {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string' && VALID_SORT_OPTIONS.includes(parsed as SortOption)) {
        return parsed as SortOption;
      }
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'sortBy' in parsed &&
        typeof parsed.sortBy === 'string' &&
        VALID_SORT_OPTIONS.includes(parsed.sortBy as SortOption)
      ) {
        return parsed.sortBy as SortOption;
      }
    }
  } catch {
    // ignore
  }
  return 'recent_read';
}

function writeShelfSort(sortBy: SortOption) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortBy));
  } catch {
    // ignore
  }
}

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recent_read', label: '最近阅读' },
  { value: 'title', label: '书名' },
  { value: 'recent_added', label: '最近添加' },
  { value: 'author', label: '作者' },
];

function deriveCategories(items: Book[]): string[] {
  return Array.from(
    new Set(
      items
        .map((book) => book.category?.trim())
        .filter((category): category is string => Boolean(category))
    )
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function getSortTimestamp(date?: string): number {
  if (!date) return 0;
  const timestamp = Date.parse(date);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortBooks(items: Book[], sortBy: SortOption): Book[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case 'recent_read':
        return getSortTimestamp(b.last_read_at) - getSortTimestamp(a.last_read_at) ||
               getSortTimestamp(b.created_at) - getSortTimestamp(a.created_at);
      case 'title':
        return a.title.localeCompare(b.title, 'zh-CN');
      case 'recent_added':
        return getSortTimestamp(b.created_at) - getSortTimestamp(a.created_at);
      case 'author':
        return (a.author || '').localeCompare(b.author || '', 'zh-CN');
      default:
        return 0;
    }
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function useShelfData(isAuthenticated: boolean) {
  const [books, setBooks] = useState<Book[]>([]);
  const [progressByBookId, setProgressByBookId] = useState<Record<string, number>>({});
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortBy, setSortByState] = useState<SortOption>(readShelfSort);
  const enrichingBooksRef = useRef(new Set<string>());

  const enrichBookMetadata = useCallback(
    async (bookId: string, file: File) => {
      try {
        const preview = await extractBookPreview(file);
        const updated = await api.updateBook(bookId, {
          title: preview.title,
          author: preview.author,
        });

        if (preview.cover) {
          const coverFileName = file.name.replace(/\.[^.]+$/, '.png');
          const finalBook = await api.uploadCover(bookId, preview.cover, coverFileName);
          setBooks((prevBooks) => {
            const bookExists = prevBooks.some((item) => item.id === bookId);
            if (!bookExists) return prevBooks;
            return sortBooks(
              prevBooks.map((item) => (item.id === bookId ? finalBook : item)),
              sortBy
            );
          });
          return;
        }

        setBooks((prevBooks) => {
          const bookExists = prevBooks.some((item) => item.id === bookId);
          if (!bookExists) return prevBooks;
          return sortBooks(
            prevBooks.map((item) => (item.id === bookId ? updated : item)),
            sortBy
          );
        });
      } catch (previewErr) {
        console.warn('Failed to enrich uploaded book:', previewErr);
      } finally {
        enrichingBooksRef.current.delete(bookId);
      }
    },
    [sortBy]
  );

  const abortEnrichment = useCallback((bookId: string) => {
    enrichingBooksRef.current.delete(bookId);
  }, []);

  const setSortBy = useCallback((option: SortOption) => {
    setSortByState(option);
    writeShelfSort(option);
  }, []);

  const loadBooks = useCallback(async () => {
    setIsLoadingBooks(true);
    try {
      const [bookData, progressData] = await Promise.all([
        api.listBooks(),
        api.listProgress().catch(() => []),
      ]);
      setBooks(bookData || []);
      setProgressByBookId(
        Object.fromEntries(
          (progressData || []).map((progress) => [progress.book_id, progress.percentage])
        )
      );
    } catch {
      setBooks([]);
      setProgressByBookId({});
    } finally {
      setIsLoadingBooks(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      void loadBooks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated, loadBooks]);

  const categories = useMemo(() => deriveCategories(books), [books]);

  useEffect(() => {
    if (!selectedCategoryId || selectedCategoryId === UNCATEGORIZED_FILTER_ID) return;
    if (!categories.includes(selectedCategoryId)) {
      setSelectedCategoryId(null);
    }
  }, [categories, selectedCategoryId]);

  const filteredBooks = useMemo(() => {
    const sorted = sortBooks(books, sortBy);
    if (!selectedCategoryId) return sorted;
    if (selectedCategoryId === UNCATEGORIZED_FILTER_ID) {
      return sorted.filter((book) => !book.category?.trim());
    }
    return sorted.filter((book) => book.category?.trim() === selectedCategoryId);
  }, [books, selectedCategoryId, sortBy]);

  const bookCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: books.length,
      [UNCATEGORIZED_FILTER_ID]: 0,
    };
    books.forEach((book) => {
      const category = book.category?.trim();
      if (category) {
        counts[category] = (counts[category] || 0) + 1;
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
      setBooks((prev) => sortBooks([...prev, book], sortBy));
      toast.success('图书已添加');

      enrichingBooksRef.current.add(book.id);
      void enrichBookMetadata(book.id, file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }, [sortBy, enrichBookMetadata]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      abortEnrichment(id);
      await api.deleteBook(id);
      setBooks((prev) => prev.filter((book) => book.id !== id));
      setProgressByBookId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success('图书已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  }, [abortEnrichment]);

  return {
    books,
    progressByBookId,
    categories,
    isLoadingBooks,
    selectedCategoryId,
    setSelectedCategoryId,
    isUploading,
    deletingId,
    filteredBooks,
    bookCounts,
    loadBooks,
    handleUpload,
    handleDelete,
    formatFileSize,
    sortBy,
    setSortBy,
    uncategorizedFilterId: UNCATEGORIZED_FILTER_ID,
  };
}
