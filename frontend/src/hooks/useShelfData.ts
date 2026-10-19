'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Book, BookLibrarySummary } from '@/lib/api';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const STORAGE_KEY = 'z-reader-shelf-sort';
const BOOK_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;
const MAX_CONCURRENT_UPLOADS = 3;
const BOOK_PROCESSING_POLL_MS = 1500;

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function useShelfData(isAuthenticated: boolean) {
  const [books, setBooks] = useState<Book[]>([]);
  const [progressByBookId, setProgressByBookId] = useState<Record<string, number>>({});
  const [librarySummary, setLibrarySummary] = useState<BookLibrarySummary | null>(null);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [isLoadingMoreBooks, setIsLoadingMoreBooks] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingMany, setIsDeletingMany] = useState(false);
  const [isUpdatingManyCategories, setIsUpdatingManyCategories] = useState(false);
  const [sortBy, setSortByState] = useState<SortOption>(readShelfSort);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Book[] | null>(null);
  const [searchNextCursor, setSearchNextCursor] = useState<string | undefined>();
  const [isSearching, setIsSearching] = useState(false);
  const [queryRevision, setQueryRevision] = useState(0);
  const loadGenerationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const searchGenerationRef = useRef(0);
  const summaryGenerationRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const moreAbortRef = useRef<AbortController | null>(null);
  const categoryOptions = useMemo(() => selectedCategoryId === UNCATEGORIZED_FILTER_ID
    ? { uncategorized: true }
    : selectedCategoryId ? { category: selectedCategoryId } : {}, [selectedCategoryId]);

  const setSortBy = useCallback((option: SortOption) => {
    setSortByState(option);
    writeShelfSort(option);
  }, []);

  const loadLibrarySummary = useCallback(async () => {
    const generation = ++summaryGenerationRef.current;
    try {
      const summary = await api.getBookLibrarySummary();
      if (generation !== summaryGenerationRef.current) return;
      setLibrarySummary({
        total: summary.total,
        uncategorized: summary.uncategorized,
        categories: summary.categories ?? {},
      });
    } catch {
      // The visible books remain usable if aggregate filter data cannot load.
      if (generation === summaryGenerationRef.current) setLibrarySummary(null);
    }
  }, []);

  const loadBooks = useCallback(async () => {
    loadAbortRef.current?.abort();
    moreAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const loadGeneration = ++loadGenerationRef.current;
    const summaryGeneration = ++summaryGenerationRef.current;
    loadingMoreRef.current = false;
    setIsLoadingMoreBooks(false);
    setNextCursor(undefined);
    setIsLoadingBooks(true);
    setLoadError(null);
    setProgressByBookId({});
    // Aggregate data enriches the shelf; it must never hold up the first page.
    void api.getBookLibrarySummary().then((summary) => {
      if (loadGeneration !== loadGenerationRef.current || controller.signal.aborted ||
        summaryGeneration !== summaryGenerationRef.current) return;
      setLibrarySummary({ ...summary, categories: summary.categories ?? {} });
    }).catch(() => {});
    try {
      const firstPage = await api.listBooksPage(undefined, BOOK_PAGE_SIZE, sortBy, {
        ...categoryOptions, signal: controller.signal,
      });
      if (loadGeneration !== loadGenerationRef.current || controller.signal.aborted) return;

      setBooks(firstPage.books || []);
      setNextCursor(firstPage.next_cursor);
      setIsLoadingBooks(false);
      const ids = (firstPage.books ?? []).map((book) => book.id);
      if (ids.length > 0) {
        void api.listProgress({ bookIds: ids }).then((progressData) => {
          if (loadGeneration !== loadGenerationRef.current || controller.signal.aborted) return;
          setProgressByBookId((current) => ({
            ...current,
            ...Object.fromEntries(progressData.map((item) => [item.book_id, item.percentage])),
          }));
        }).catch(() => {});
      }
    } catch (err) {
      if (loadGeneration !== loadGenerationRef.current || controller.signal.aborted) return;
      setBooks([]);
      setProgressByBookId({});
      setNextCursor(undefined);
      setLoadError(err instanceof Error ? err.message : '书架加载失败');
    } finally {
      if (loadGeneration === loadGenerationRef.current) {
        setIsLoadingBooks(false);
      }
    }
  }, [categoryOptions, sortBy]);

  const loadMoreBooks = useCallback(async () => {
    const query = searchQuery.trim();
    const isSearch = query.length > 0;
    const cursor = isSearch ? searchNextCursor : nextCursor;
    if (!cursor || loadingMoreRef.current) return;

    const loadGeneration = loadGenerationRef.current;
    const searchGeneration = searchGenerationRef.current;
    const controller = new AbortController();
    moreAbortRef.current = controller;
    loadingMoreRef.current = true;
    setIsLoadingMoreBooks(true);
    try {
      const page = isSearch
        ? await api.searchBooks(query, cursor, BOOK_PAGE_SIZE, sortBy, {
          ...categoryOptions, signal: controller.signal,
        })
        : await api.listBooksPage(cursor, BOOK_PAGE_SIZE, sortBy, {
          ...categoryOptions, signal: controller.signal,
        });
      const isCurrent = () => !controller.signal.aborted &&
        loadGeneration === loadGenerationRef.current &&
        searchGeneration === searchGenerationRef.current;
      if (!isCurrent()) return;

      const mergeBooks = (currentBooks: Book[]) => {
        const byID = new Map(currentBooks.map((book) => [book.id, book]));
        page.books.forEach((book) => byID.set(book.id, book));
        return Array.from(byID.values());
      };
      if (isSearch) {
        setSearchResults((currentBooks) => mergeBooks(currentBooks ?? []));
        setSearchNextCursor(page.next_cursor);
      } else {
        setBooks(mergeBooks);
        setNextCursor(page.next_cursor);
      }
      const ids = (page.books ?? []).map((book) => book.id);
      if (ids.length > 0) {
        void api.listProgress({ bookIds: ids }).then((progressData) => {
          if (!isCurrent()) return;
          setProgressByBookId((current) => ({
            ...current,
            ...Object.fromEntries(progressData.map((item) => [item.book_id, item.percentage])),
          }));
        }).catch(() => {});
      }
    } catch (err) {
      if (!controller.signal.aborted && loadGeneration === loadGenerationRef.current) {
        toast.error(err instanceof Error ? err.message : '加载更多图书失败');
      }
    } finally {
      if (moreAbortRef.current === controller) {
        loadingMoreRef.current = false;
        setIsLoadingMoreBooks(false);
      }
    }
  }, [categoryOptions, nextCursor, searchNextCursor, searchQuery, sortBy]);

  useEffect(() => {
    if (!isAuthenticated) {
      loadGenerationRef.current += 1;
      searchGenerationRef.current += 1;
      summaryGenerationRef.current += 1;
      loadingMoreRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear private data on logout.
      setNextCursor(undefined);
      setSearchResults(null);
      setSearchNextCursor(undefined);
      setLibrarySummary(null);
      setBooks([]);
      setProgressByBookId({});
      loadAbortRef.current?.abort();
      moreAbortRef.current?.abort();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadBooks();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      loadAbortRef.current?.abort();
      moreAbortRef.current?.abort();
    };
  }, [isAuthenticated, loadBooks, queryRevision]);

  useEffect(() => {
    const query = searchQuery.trim();
    const generation = ++searchGenerationRef.current;
    moreAbortRef.current?.abort();
    loadingMoreRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Invalidate pending pagination.
    setIsLoadingMoreBooks(false);
    if (!isAuthenticated || !query) {
      setSearchResults(null);
      setSearchNextCursor(undefined);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void api.searchBooks(query, undefined, BOOK_PAGE_SIZE, sortBy, {
        ...categoryOptions, signal: controller.signal,
      })
        .then((page) => {
          if (generation !== searchGenerationRef.current || controller.signal.aborted) return;
          setSearchResults(page.books ?? []);
          setSearchNextCursor(page.next_cursor);
          const ids = (page.books ?? []).map((book) => book.id);
          if (ids.length > 0) {
            void api.listProgress({ bookIds: ids }).then((progressData) => {
              if (generation !== searchGenerationRef.current || controller.signal.aborted) return;
              setProgressByBookId((current) => ({
                ...current,
                ...Object.fromEntries(progressData.map((item) => [item.book_id, item.percentage])),
              }));
            }).catch(() => {});
          }
        })
        .catch((err) => {
          if (generation !== searchGenerationRef.current || controller.signal.aborted) return;
          setSearchResults([]);
          setSearchNextCursor(undefined);
          toast.error(err instanceof Error ? err.message : '搜索图书失败');
        })
        .finally(() => {
          if (generation === searchGenerationRef.current) {
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [categoryOptions, isAuthenticated, queryRevision, searchQuery, sortBy]);

  const pendingBookIDs = useMemo(
    () => [...new Map([...books, ...(searchResults ?? [])].map((book) => [book.id, book])).values()]
      .filter((book) => book.processing_state === 'pending')
      .map((book) => book.id)
      .join(','),
    [books, searchResults]
  );

  useEffect(() => {
    if (!isAuthenticated || !pendingBookIDs) return;

    let stopped = false;
    let timeoutId: number | undefined;
    const refreshProcessedBooks = async () => {
      const ids = pendingBookIDs.split(',').filter(Boolean);
      try {
        if (document.visibilityState === 'hidden') return;
        const updatedBooks = await api.getBooksStatus(ids);
        if (stopped) return;
        const updatedByID = new Map(updatedBooks.map((book) => [book.id, book]));
        setBooks((current) => current.map((book) => updatedByID.get(book.id) ?? book));
        setSearchResults((current) => current?.map((book) => updatedByID.get(book.id) ?? book) ?? null);
      } catch {
        // Keep the current shelf usable and retry while the jobs are pending.
      } finally {
        if (!stopped) {
          timeoutId = window.setTimeout(refreshProcessedBooks, BOOK_PROCESSING_POLL_MS);
        }
      }
    };

    timeoutId = window.setTimeout(refreshProcessedBooks, BOOK_PROCESSING_POLL_MS);
    return () => {
      stopped = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [isAuthenticated, pendingBookIDs]);

  const categories = useMemo(() => {
    if (!librarySummary) return deriveCategories(books);
    return Object.keys(librarySummary.categories).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [books, librarySummary]);

  useEffect(() => {
    if (!selectedCategoryId || selectedCategoryId === UNCATEGORIZED_FILTER_ID) return;
    // Only the full-library summary can prove a category no longer exists.
    if (librarySummary && !categories.includes(selectedCategoryId)) {
      const timeoutId = window.setTimeout(() => {
        setSelectedCategoryId(null);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [categories, librarySummary, selectedCategoryId]);

  const filteredBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sourceBooks = query ? (searchResults ?? []) : books;
    const searched = query && searchResults === null
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
      : sourceBooks;
    if (!selectedCategoryId) return searched;
    if (selectedCategoryId === UNCATEGORIZED_FILTER_ID) {
      return searched.filter((book) => !book.category?.trim());
    }
    return searched.filter((book) => book.category?.trim() === selectedCategoryId);
  }, [books, searchQuery, searchResults, selectedCategoryId]);

  const bookCounts = useMemo(() => {
    if (librarySummary) {
      return {
        all: librarySummary.total,
        [UNCATEGORIZED_FILTER_ID]: librarySummary.uncategorized,
        ...librarySummary.categories,
      };
    }

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
  }, [books, librarySummary]);

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

    let completedCount = 0;
    let nextIndex = 0;
    const uploadWorker = async () => {
      while (nextIndex < uploadableFiles.length) {
        const file = uploadableFiles[nextIndex++];
        try {
          await api.uploadBook(file);
          successCount += 1;
        } catch (err) {
          failedCount += 1;
          if (err instanceof Error && err.message.trim()) {
            failureMessages.push(err.message.trim());
          }
          console.error('Failed to upload book:', err);
        } finally {
          completedCount += 1;
          setUploadProgress({ current: completedCount, total: uploadableFiles.length });
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONCURRENT_UPLOADS, uploadableFiles.length) },
        () => uploadWorker()
      )
    );

    if (successCount > 0 && failedCount === 0) {
      toast.success(successCount === 1 ? '图书已添加' : `已添加 ${successCount} 本图书`);
    } else if (successCount > 0) {
      toast.error(`已添加 ${successCount} 本，${failedCount} 本失败`);
    } else {
      toast.error(failureMessages[0] ?? '上传失败');
    }

    if (successCount > 0) {
      await loadBooks();
    }

    setUploadProgress(null);
    setIsUploading(false);
  }, [loadBooks]);

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
      await api.deleteBook(id);
      setBooks((prev) => prev.filter((book) => book.id !== id));
      setSearchResults((prev) => prev?.filter((book) => book.id !== id) ?? null);
      setProgressByBookId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      void loadLibrarySummary();
      toast.success('图书已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  }, [loadLibrarySummary]);

  const handleDeleteMany = useCallback(async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
    if (uniqueIds.length === 0) return { successCount: 0, failedCount: 0 };

    setIsDeletingMany(true);
    try {
      const result = await api.deleteBooks(uniqueIds);
      const deletedIds = result.deleted_ids ?? uniqueIds;
      const deletedSet = new Set(deletedIds);
      setBooks((prev) => prev.filter((book) => !deletedSet.has(book.id)));
      setSearchResults((prev) => prev?.filter((book) => !deletedSet.has(book.id)) ?? null);
      setProgressByBookId((prev) => {
        const next = { ...prev };
        deletedSet.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      void loadLibrarySummary();
      toast.success(`已删除 ${deletedIds.length} 本图书`);
      return { successCount: deletedIds.length, failedCount: 0 };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
      return { successCount: 0, failedCount: uniqueIds.length };
    } finally {
      setIsDeletingMany(false);
    }
  }, [loadLibrarySummary]);

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
      setBooks((prev) => prev.map((book) => updatedById.get(book.id) ?? book));
      setSearchResults((prev) => prev === null
        ? null
        : prev.map((book) => updatedById.get(book.id) ?? book));
      void loadLibrarySummary();
      toast.success(nextCategory ? `已设置为「${nextCategory}」` : '已清空所选分类');
      return { successCount: updatedBooks.length, failedCount: 0 };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置分类失败');
      return { successCount: 0, failedCount: uniqueIds.length };
    } finally {
      setIsUpdatingManyCategories(false);
    }
  }, [loadLibrarySummary]);

  const handleRenameCategory = useCallback(async (category: string, nextCategory: string | null) => {
    const currentCategory = category.trim();
    if (!currentCategory) return { successCount: 0, failedCount: 0 };
    const normalized = nextCategory?.trim() || null;
    setIsUpdatingManyCategories(true);
    try {
      const result = await api.renameBookCategory(currentCategory, normalized);
      // Invalidate pages and summaries captured before the mutation committed.
      loadGenerationRef.current += 1;
      searchGenerationRef.current += 1;
      summaryGenerationRef.current += 1;
      loadAbortRef.current?.abort();
      moreAbortRef.current?.abort();
      const ids = new Set(result.updated_ids);
      const update = (items: Book[]) => items.map(book => ids.has(book.id)
        ? { ...book, category: normalized ?? undefined } : book);
      setBooks(update);
      setSearchResults(items => items ? update(items) : null);
      setLibrarySummary(summary => {
        if (!summary) return summary;
        const categories = { ...summary.categories };
        const count = categories[currentCategory] ?? result.updated_ids.length;
        delete categories[currentCategory];
        if (normalized) categories[normalized] = (categories[normalized] ?? 0) + count;
        return { ...summary, categories,
          uncategorized: summary.uncategorized + (normalized ? 0 : count) };
      });
      if (selectedCategoryId === currentCategory) setSelectedCategoryId(normalized);
      setQueryRevision(value => value + 1);
      toast.success(normalized ? `已设置为「${normalized}」` : '已清空分类');
      return { successCount: result.updated_ids.length, failedCount: 0 };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改分类失败');
      return { successCount: 0, failedCount: 1 };
    } finally {
      setIsUpdatingManyCategories(false);
    }
  }, [selectedCategoryId]);

  return {
    books,
    progressByBookId,
    categories,
    isLoadingBooks,
    isSearching,
    isLoadingMoreBooks,
    hasMoreBooks: Boolean(searchQuery.trim() ? searchResults && searchNextCursor : nextCursor),
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
    loadMoreBooks,
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
