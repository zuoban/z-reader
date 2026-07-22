'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Book } from '@/lib/api';
import { extractBookPreview } from '@/lib/book-preview';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const STORAGE_KEY = 'z-reader-shelf-sort';
const BOOK_PAGE_SIZE = 50;

export type SortOption = 'recent_read' | 'title' | 'recent_added' | 'author';
export interface UploadProgress {
  current: number;
  total: number;
}

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

async function getImageExtension(blob: Blob): Promise<string> {
  switch (blob.type.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
  }

  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return '.jpg';
  }
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return '.png';
  }
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return '.webp';
  }

  return '.png';
}

async function getCoverFileName(bookFileName: string, cover: Blob): Promise<string> {
  const extension = await getImageExtension(cover);
  return bookFileName.replace(/\.[^.]+$/, extension);
}

export function useShelfData(isAuthenticated: boolean) {
  const [books, setBooks] = useState<Book[]>([]);
  const [progressByBookId, setProgressByBookId] = useState<Record<string, number>>({});
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingMany, setIsDeletingMany] = useState(false);
  const [isUpdatingManyCategories, setIsUpdatingManyCategories] = useState(false);
  const [sortBy, setSortByState] = useState<SortOption>(readShelfSort);
  const [searchQuery, setSearchQuery] = useState('');
  const enrichingBooksRef = useRef(new Set<string>());
  const loadGenerationRef = useRef(0);

  const enrichBookMetadata = useCallback(
    async (bookId: string, file: File) => {
      try {
        const preview = await extractBookPreview(file);
        const updated = await api.updateBook(bookId, {
          title: preview.title,
          author: preview.author,
        });

        if (preview.cover) {
          const coverFileName = await getCoverFileName(file.name, preview.cover);
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
    const loadGeneration = ++loadGenerationRef.current;
    let hasLoadedFirstPage = false;
    setIsLoadingBooks(true);
    setLoadError(null);
    try {
      const [firstPage, progressData] = await Promise.all([
        api.listBooksPage(undefined, BOOK_PAGE_SIZE, sortBy),
        api.listProgress().catch(() => []),
      ]);
      if (loadGeneration !== loadGenerationRef.current) return;

      setBooks(firstPage.books || []);
      hasLoadedFirstPage = true;
      setProgressByBookId(
        Object.fromEntries(
          (progressData || []).map((progress) => [progress.book_id, progress.percentage])
        )
      );
      setIsLoadingBooks(false);

      let cursor = firstPage.next_cursor;
      while (cursor) {
        const nextPage = await api.listBooksPage(cursor, BOOK_PAGE_SIZE, sortBy);
        if (loadGeneration !== loadGenerationRef.current) return;

        setBooks((currentBooks) => {
          const byID = new Map(currentBooks.map((book) => [book.id, book]));
          nextPage.books.forEach((book) => byID.set(book.id, book));
          return Array.from(byID.values());
        });
        cursor = nextPage.next_cursor;
      }
    } catch (err) {
      if (loadGeneration !== loadGenerationRef.current) return;
      if (!hasLoadedFirstPage) {
        setBooks([]);
        setProgressByBookId({});
        setLoadError(err instanceof Error ? err.message : '书架加载失败');
      } else {
        setLoadError('书架剩余图书加载失败，请刷新重试');
      }
    } finally {
      if (loadGeneration === loadGenerationRef.current) {
        setIsLoadingBooks(false);
      }
    }
  }, [sortBy]);

  useEffect(() => {
    if (!isAuthenticated) {
      loadGenerationRef.current += 1;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadBooks();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated, loadBooks]);

  const categories = useMemo(() => deriveCategories(books), [books]);

  useEffect(() => {
    if (!selectedCategoryId || selectedCategoryId === UNCATEGORIZED_FILTER_ID) return;
    if (!categories.includes(selectedCategoryId)) {
      const timeoutId = window.setTimeout(() => {
        setSelectedCategoryId(null);
      }, 0);
      return () => window.clearTimeout(timeoutId);
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

    const uploadableFiles = files.filter((file) => file.size > 0);

    if (uploadableFiles.length === 0) {
      toast.error('请选择 EPUB、MOBI、AZW3 或 PDF 文件');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: uploadableFiles.length });

    let successCount = 0;
    let failedCount = 0;
    const failureMessages: string[] = [];

    for (const [index, file] of uploadableFiles.entries()) {
      setUploadProgress({ current: index + 1, total: uploadableFiles.length });
      try {
        const book = await api.uploadBook(file);
        successCount += 1;
        setBooks((prev) => sortBooks([...prev, book], sortBy));

        enrichingBooksRef.current.add(book.id);
        void enrichBookMetadata(book.id, file);
      } catch (err) {
        failedCount += 1;
        if (err instanceof Error && err.message.trim()) {
          failureMessages.push(err.message.trim());
        }
        console.error('Failed to upload book:', err);
      }
    }

    if (successCount > 0 && failedCount === 0) {
      toast.success(successCount === 1 ? '图书已添加' : `已添加 ${successCount} 本图书`);
    } else if (successCount > 0) {
      toast.error(`已添加 ${successCount} 本，${failedCount} 本失败`);
    } else {
      toast.error(failureMessages[0] ?? '上传失败');
    }

    setUploadProgress(null);
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

  const handleDeleteMany = useCallback(async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
    if (uniqueIds.length === 0) return { successCount: 0, failedCount: 0 };

    setIsDeletingMany(true);
    uniqueIds.forEach(abortEnrichment);
    try {
      const result = await api.deleteBooks(uniqueIds);
      const deletedIds = result.deleted_ids ?? uniqueIds;
      const deletedSet = new Set(deletedIds);
      setBooks((prev) => prev.filter((book) => !deletedSet.has(book.id)));
      setProgressByBookId((prev) => {
        const next = { ...prev };
        deletedSet.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      toast.success(`已删除 ${deletedIds.length} 本图书`);
      return { successCount: deletedIds.length, failedCount: 0 };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
      return { successCount: 0, failedCount: uniqueIds.length };
    } finally {
      setIsDeletingMany(false);
    }
  }, [abortEnrichment]);

  const handleUpdateCategoryMany = useCallback(async (ids: string[], category: string | null) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
    const nextCategory = category?.trim() || null;
    if (uniqueIds.length === 0) return { successCount: 0, failedCount: 0 };

    if (nextCategory !== null && nextCategory.length > 50) {
      toast.error('分类不能超过 50 个字符');
      return { successCount: 0, failedCount: uniqueIds.length };
    }

    setIsUpdatingManyCategories(true);
    try {
      const result = await api.updateBooksCategory(uniqueIds, nextCategory);
      const updatedBooks = result.books ?? [];
      const updatedById = new Map(updatedBooks.map((book) => [book.id, book]));
      setBooks((prev) => sortBooks(
        prev.map((book) => updatedById.get(book.id) ?? book),
        sortBy
      ));
      toast.success(nextCategory ? `已设置为「${nextCategory}」` : '已清空所选分类');
      return { successCount: updatedBooks.length, failedCount: 0 };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置分类失败');
      return { successCount: 0, failedCount: uniqueIds.length };
    } finally {
      setIsUpdatingManyCategories(false);
    }
  }, [sortBy]);

  const handleRenameCategory = useCallback(async (category: string, nextCategory: string | null) => {
    const currentCategory = category.trim();
    if (!currentCategory) return { successCount: 0, failedCount: 0 };

    const ids = books
      .filter((book) => book.category?.trim() === currentCategory)
      .map((book) => book.id);
    const result = await handleUpdateCategoryMany(ids, nextCategory);

    if (result.successCount > 0 && selectedCategoryId === currentCategory) {
      setSelectedCategoryId(nextCategory?.trim() || null);
    }

    return result;
  }, [books, handleUpdateCategoryMany, selectedCategoryId]);

  return {
    books,
    progressByBookId,
    categories,
    isLoadingBooks,
    loadError,
    selectedCategoryId,
    setSelectedCategoryId,
    isUploading,
    uploadProgress,
    deletingId,
    isDeletingMany,
    isUpdatingManyCategories,
    filteredBooks,
    bookCounts,
    loadBooks,
    searchQuery,
    setSearchQuery,
    uploadFile,
    uploadFiles,
    handleUpload,
    handleDelete,
    handleDeleteMany,
    handleUpdateCategoryMany,
    handleRenameCategory,
    formatFileSize,
    sortBy,
    setSortBy,
    uncategorizedFilterId: UNCATEGORIZED_FILTER_ID,
  };
}
