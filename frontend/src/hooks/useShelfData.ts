'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Book, Category } from '@/lib/api';
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
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortBy, setSortByState] = useState<SortOption>(readShelfSort);

  const setSortBy = useCallback((option: SortOption) => {
    setSortByState(option);
    writeShelfSort(option);
  }, []);

  const loadBooks = useCallback(async () => {
    setIsLoadingBooks(true);
    try {
      const data = await api.listBooks();
      setBooks(data || []);
    } catch {
      setBooks([]);
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

  const categories = useMemo<Category[]>(() => {
    const names = Array.from(
      new Set(
        books
          .map((book) => book.category?.trim())
          .filter((category): category is string => !!category)
      )
    ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

    return names.map((name, index) => ({
      id: name,
      user_id: '',
      name,
      sort_order: index + 1,
      created_at: '',
    }));
  }, [books]);

  useEffect(() => {
    if (!selectedCategoryId || selectedCategoryId === UNCATEGORIZED_FILTER_ID) return;
    if (!categories.some((category) => category.id === selectedCategoryId)) {
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
              sortBooks(prevBooks.map((item) => (item.id === book.id ? finalBook : item)), sortBy)
            );
            return;
          }

          setBooks((prevBooks) =>
            sortBooks(prevBooks.map((item) => (item.id === book.id ? updated : item)), sortBy)
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
  }, [sortBy]);

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
    handleUpload,
    handleDelete,
    formatFileSize,
    sortBy,
    setSortBy,
    uncategorizedFilterId: UNCATEGORIZED_FILTER_ID,
  };
}
