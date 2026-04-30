'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Book } from '@/lib/api';
import { extractBookPreview } from '@/lib/book-preview';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const STORAGE_KEY = 'z-reader-shelf-sort';
const SUPPORTED_UPLOAD_EXTENSIONS = ['epub', 'mobi', 'azw3', 'pdf'];

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

function getFileExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

function isSupportedUploadFile(file: File) {
  return SUPPORTED_UPLOAD_EXTENSIONS.includes(getFileExtension(file));
}

export function useShelfData(isAuthenticated: boolean) {
  const [books, setBooks] = useState<Book[]>([]);
  const [progressByBookId, setProgressByBookId] = useState<Record<string, number>>({});
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortBy, setSortByState] = useState<SortOption>(readShelfSort);
  const [searchQuery, setSearchQuery] = useState('');
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
    setLoadError(null);
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
    } catch (err) {
      setBooks([]);
      setProgressByBookId({});
      setLoadError(err instanceof Error ? err.message : '书架加载失败');
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
    const query = searchQuery.trim().toLowerCase();
    const searched = query
      ? books.filter((book) => {
          const haystack = [
            book.title,
            book.author,
            book.filename,
            book.category,
            book.format,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(query);
        })
      : books;
    const sorted = sortBooks(searched, sortBy);
    if (!selectedCategoryId) return sorted;
    if (selectedCategoryId === UNCATEGORIZED_FILTER_ID) {
      return sorted.filter((book) => !book.category?.trim());
    }
    return sorted.filter((book) => book.category?.trim() === selectedCategoryId);
  }, [books, searchQuery, selectedCategoryId, sortBy]);

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

  const uploadFiles = useCallback(async (fileList: File[] | FileList | null | undefined) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const supportedFiles = files.filter(isSupportedUploadFile);
    const unsupportedCount = files.length - supportedFiles.length;

    if (supportedFiles.length === 0) {
      toast.error('仅支持 EPUB、MOBI、AZW3 或 PDF');
      return;
    }

    if (unsupportedCount > 0) {
      toast.error(`已跳过 ${unsupportedCount} 个不支持的文件`);
    }

    setIsUploading(true);

    let successCount = 0;
    let failedCount = 0;

    for (const file of supportedFiles) {
      try {
        const book = await api.uploadBook(file);
        successCount += 1;
        setBooks((prev) => sortBooks([...prev, book], sortBy));

        enrichingBooksRef.current.add(book.id);
        void enrichBookMetadata(book.id, file);
      } catch (err) {
        failedCount += 1;
        console.error('Failed to upload book:', err);
      }
    }

    if (successCount > 0 && failedCount === 0) {
      toast.success(successCount === 1 ? '图书已添加' : `已添加 ${successCount} 本图书`);
    } else if (successCount > 0) {
      toast.error(`已添加 ${successCount} 本，${failedCount} 本失败`);
    } else {
      toast.error('上传失败');
    }

    setIsUploading(false);
  }, [sortBy, enrichBookMetadata]);

  const uploadFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;

    await uploadFiles([file]);
  }, [uploadFiles]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(e.target.files);
    e.target.value = '';
  }, [uploadFiles]);

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
    loadError,
    selectedCategoryId,
    setSelectedCategoryId,
    isUploading,
    deletingId,
    filteredBooks,
    bookCounts,
    loadBooks,
    searchQuery,
    setSearchQuery,
    uploadFile,
    uploadFiles,
    handleUpload,
    handleDelete,
    formatFileSize,
    sortBy,
    setSortBy,
    uncategorizedFilterId: UNCATEGORIZED_FILTER_ID,
  };
}
