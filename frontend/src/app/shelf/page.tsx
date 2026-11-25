'use client';

import type { DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ActionIcon, Button, Menu, TextInput } from '@mantine/core';
import { toast } from 'sonner';
import '../styles/mantine-shelf.css';
import '../styles/shelf.css';
import {
  AlertCircle,
  BookOpen,
  CheckSquare,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Search,
  Settings2,
  Tag,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useShelfData } from '@/hooks/useShelfData';
import { useShelfTheme } from '@/hooks/useShelfTheme';
import { AppScreen, LoadingSpinner } from '@/components/AppShell';
import { BookCard } from '@/components/BookCard';
import { BookCardSkeletonGrid } from '@/components/BookCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { FileUploadAction } from '@/components/FileUploadAction';
import { ShelfHeader } from '@/components/ShelfHeader';
import { SortSelector } from '@/components/SortSelector';
import { prefetchFoliateEngine } from '@/lib/foliate-loader';
import { VirtualBookGrid } from '@/components/VirtualBookGrid';
import { cn } from '@/lib/utils';

const SUPPORTED_FORMATS_ACCEPT = [
  '.epub',
  '.mobi',
  '.azw3',
  '.pdf',
  'application/epub+zip',
  'application/pdf',
  'application/x-mobipocket-ebook',
].join(',');
const UNCATEGORIZED_FILTER_ID = 'uncategorized';

const BatchCategorySheet = dynamic(
  () => import('@/components/BatchCategorySheet').then((module) => module.BatchCategorySheet),
  { ssr: false }
);
const CategoryManagerSheet = dynamic(
  () => import('@/components/CategoryManagerSheet').then((module) => module.CategoryManagerSheet),
  { ssr: false }
);
const ConfirmDialog = dynamic(
  () => import('@/components/ConfirmDialog').then((module) => module.ConfirmDialog),
  { ssr: false }
);
const OfflineBooksDialog = dynamic(
  () => import('@/components/OfflineBooksDialog').then((module) => module.OfflineBooksDialog),
  { ssr: false }
);

export default function ShelfPage() {
  const router = useRouter();
  const [isDraggingBookFile, setIsDraggingBookFile] = useState(false);
  const dragDepthRef = useRef(0);
  const categoryStripRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(() => new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchCategoryOpen, setBatchCategoryOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [offlineBooksOpen, setOfflineBooksOpen] = useState(false);
  const [isRetryingAuth, setIsRetryingAuth] = useState(false);
  const {
    isLoading,
    isAuthenticated,
    isOffline,
    passwordRequired,
    logout,
    checkAuth,
  } = useAuth();
  const { toggleTheme, isDark } = useShelfTheme();
  const {
    books,
    progressByBookId,
    categories,
    isLoadingBooks,
    isSearching,
    isLoadingMoreBooks,
    hasMoreBooks,
    loadError,
    searchError,
    retrySearch,
    selectedCategoryId,
    setSelectedCategoryId,
    isUploading,
    uploadProgress,
    deletingId,
    isDeletingMany,
    isUpdatingManyCategories,
    filteredBooks,
    bookCounts,
    refreshBooks,
    loadMoreBooks,
    handleUpload,
    handleDelete,
    handleDeleteMany,
    handleUpdateCategoryMany,
    handleRenameCategory,
    searchQuery,
    setSearchQuery,
    uploadFiles,
    formatFileSize,
    sortBy,
    setSortBy,
  } = useShelfData(isAuthenticated);
  const hasSearchQuery = searchQuery.trim().length > 0;
  const isLibraryEmpty =
    books.length === 0 &&
    bookCounts.all === 0 &&
    selectedCategoryId === null &&
    !hasSearchQuery;
  const resultsLabel = hasSearchQuery
    ? '搜索结果'
    : selectedCategoryId === UNCATEGORIZED_FILTER_ID
      ? '未分类书籍'
      : selectedCategoryId ?? '全部书籍';
  const isFiltered = hasSearchQuery || selectedCategoryId !== null;
  const uploadStatusLabel = uploadProgress
    ? `上传 ${uploadProgress.current}/${uploadProgress.total}`
    : isUploading
      ? '上传中'
      : undefined;

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isOffline) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, isOffline, router]);

  const showCategoryFilters = !isOffline && !loadError && !isLoadingBooks && !isLibraryEmpty;
  const showShelfControlsSkeleton = !isOffline && !loadError && isLoadingBooks;

  useEffect(() => {
    const strip = categoryStripRef.current;
    if (!showCategoryFilters || !strip) return;

    const updateOverflowHint = () => {
      strip.parentElement?.toggleAttribute(
        'data-prev-categories',
        strip.scrollLeft > 1
      );
      strip.parentElement?.toggleAttribute(
        'data-more-categories',
        strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1
      );
    };

    const resizeObserver = new ResizeObserver(updateOverflowHint);
    resizeObserver.observe(strip);
    for (const chip of strip.children) resizeObserver.observe(chip);
    strip.addEventListener('scroll', updateOverflowHint, { passive: true });
    updateOverflowHint();

    return () => {
      resizeObserver.disconnect();
      strip.removeEventListener('scroll', updateOverflowHint);
    };
  }, [showCategoryFilters, categories, bookCounts]);

  async function handleRetryConnection() {
    if (isRetryingAuth) return;
    setIsRetryingAuth(true);
    try {
      const status = await checkAuth();
      if (status === 'offline') {
        toast.error('仍无法连接服务器，请检查网络后再试');
      }
    } finally {
      setIsRetryingAuth(false);
    }
  }

  const filteredBookIds = useMemo(
    () => filteredBooks.map((book) => book.id),
    [filteredBooks]
  );
  const selectedExistingIds = useMemo(
    () => filteredBookIds.filter((id) => selectedBookIds.has(id)),
    [filteredBookIds, selectedBookIds]
  );
  const selectedCount = selectedExistingIds.length;
  const allVisibleSelected =
    filteredBookIds.length > 0 && filteredBookIds.every((id) => selectedBookIds.has(id));
  const isBatchBusy = isDeletingMany || isUpdatingManyCategories;
  const canDropBookFiles =
    !isOffline &&
    !isLoadingBooks &&
    !loadError &&
    !batchDeleteOpen &&
    !batchCategoryOpen &&
    !categoryManagerOpen &&
    !offlineBooksOpen;

  function clearSelectionWhenFiltering() {
    if (selectionMode && selectedBookIds.size > 0) {
      setSelectedBookIds(new Set());
    }
  }

  function changeSearchQuery(value: string) {
    setSearchQuery(value);
    clearSelectionWhenFiltering();
  }

  function changeSelectedCategory(categoryId: string | null) {
    setSelectedCategoryId(categoryId);
    clearSelectionWhenFiltering();
  }

  function clearShelfFilters() {
    changeSearchQuery('');
    changeSelectedCategory(null);
  }

  function toggleSelectionMode() {
    if (isBatchBusy) return;
    setSelectionMode((enabled) => {
      if (enabled) {
        setSelectedBookIds(new Set());
        setBatchDeleteOpen(false);
        setBatchCategoryOpen(false);
      }
      return !enabled;
    });
  }

  useEffect(() => {
    if (
      !selectionMode ||
      isBatchBusy ||
      batchDeleteOpen ||
      batchCategoryOpen ||
      categoryManagerOpen ||
      offlineBooksOpen
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        document.querySelector(
          '[role="menu"]:not([aria-hidden="true"]):not([hidden]), [role="dialog"]:not([aria-hidden="true"]):not([hidden]), [role="alertdialog"]:not([aria-hidden="true"]):not([hidden])'
        )
      ) {
        return;
      }
      setSelectionMode(false);
      setSelectedBookIds(new Set());
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectionMode,
    isBatchBusy,
    batchDeleteOpen,
    batchCategoryOpen,
    categoryManagerOpen,
    offlineBooksOpen,
  ]);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDraggingBookFile(false);
  }, []);

  useEffect(() => {
    if (!isDraggingBookFile) return;

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resetDragState();
      }
    };

    window.addEventListener('dragend', resetDragState);
    window.addEventListener('drop', resetDragState);
    window.addEventListener('blur', resetDragState);
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('dragend', resetDragState);
      window.removeEventListener('drop', resetDragState);
      window.removeEventListener('blur', resetDragState);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isDraggingBookFile, resetDragState]);

  const toggleBookSelection = useCallback((bookId: string) => {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  }, []);

  const handleEndReached = useCallback(() => {
    void loadMoreBooks();
  }, [loadMoreBooks]);

  const getBookItemKey = useCallback(
    (book: (typeof filteredBooks)[number]) =>
      `${book.id}:${book.cover_path ?? ''}:${book.format}`,
    []
  );

  const handleReadBook = useCallback(
    (bookId: string) => {
      router.push(`/read/${bookId}`);
    },
    [router]
  );

  const prefetchedBookIdsRef = useRef<Set<string>>(new Set());

  const handlePrefetchBook = useCallback(
    (bookId: string) => {
      prefetchFoliateEngine();
      if (prefetchedBookIdsRef.current.has(bookId)) return;
      prefetchedBookIdsRef.current.add(bookId);
      router.prefetch(`/read/${bookId}`);
    },
    [router]
  );

  const renderBookCard = useCallback(
    (book: (typeof filteredBooks)[number], index: number) => (
      <BookCard
        book={book}
        index={index}
        categories={categories}
        bookCounts={bookCounts}
        onRead={handleReadBook}
        onPrefetch={handlePrefetchBook}
        onDelete={handleDelete}
        onUpdate={refreshBooks}
        isDeleting={deletingId === book.id}
        formatSize={formatFileSize}
        progressPercentage={progressByBookId[book.id] ?? null}
        searchQuery={searchQuery}
        selectionMode={selectionMode}
        selected={selectedBookIds.has(book.id)}
        onSelectionToggle={toggleBookSelection}
      />
    ),
    [
      categories,
      bookCounts,
      handleReadBook,
      handlePrefetchBook,
      handleDelete,
      refreshBooks,
      deletingId,
      formatFileSize,
      progressByBookId,
      searchQuery,
      selectionMode,
      selectedBookIds,
      toggleBookSelection,
    ]
  );

  function toggleVisibleSelection() {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredBookIds.forEach((id) => next.delete(id));
      } else {
        filteredBookIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function confirmBatchDelete() {
    const result = await handleDeleteMany(selectedExistingIds);
    if (result.successCount > 0) {
      setSelectedBookIds(new Set());
      setSelectionMode(false);
    }
    setBatchDeleteOpen(false);
  }

  async function saveBatchCategory(category: string | null) {
    const result = await handleUpdateCategoryMany(selectedExistingIds, category);
    if (result.successCount > 0) {
      setSelectedBookIds(new Set());
      setSelectionMode(false);
      setBatchCategoryOpen(false);
    }
  }

  async function saveManagedCategory(category: string, nextCategory: string | null) {
    await handleRenameCategory(category, nextCategory);
  }

  function handleLogout() {
    void logout().catch(() => toast.error('退出失败，请重试'));
  }

  function handleShelfDragEnter(event: DragEvent<HTMLElement>) {
    if (!canDropBookFiles || !event.dataTransfer.types.includes('Files')) return;

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingBookFile(true);
  }

  function handleShelfDragOver(event: DragEvent<HTMLElement>) {
    if (!canDropBookFiles || !event.dataTransfer.types.includes('Files')) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = isUploading ? 'none' : 'copy';
  }

  function handleShelfDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingBookFile(false);
    }
  }

  function handleShelfDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;

    event.preventDefault();
    resetDragState();

    if (!canDropBookFiles || isUploading) return;
    void uploadFiles(event.dataTransfer.files);
  }

  if (isLoading || (!isAuthenticated && !isOffline)) {
    return (
      <AppScreen>
        <div
          className="flex min-h-dvh items-center justify-center"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="正在加载书库"
        >
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner className="h-9 w-9 border-primary/20" />
            <p className="text-xs font-medium text-muted-foreground">
              正在加载书库
            </p>
          </div>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      className="overflow-clip bg-[var(--shelf-app-bg)] font-sans"
      contentClassName="flex min-h-dvh w-full flex-col"
    >
      <ShelfHeader
        uploadAccept={SUPPORTED_FORMATS_ACCEPT}
        isOffline={isOffline}
        isUploading={isUploading}
        uploadStatusLabel={uploadStatusLabel}
        isQuietUpload={!isLoadingBooks && !loadError && isLibraryEmpty}
        isDark={isDark}
        onUpload={handleUpload}
        onToggleTheme={toggleTheme}
        onManageOfflineBooks={() => setOfflineBooksOpen(true)}
        onLogout={!isOffline && passwordRequired ? handleLogout : undefined}
      />

      <main
        id="shelf-main"
        aria-label="书库"
        className="app-container relative z-10 flex-1 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] sm:pt-5 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
        onDragEnter={handleShelfDragEnter}
        onDragOver={handleShelfDragOver}
        onDragLeave={handleShelfDragLeave}
        onDrop={handleShelfDrop}
      >
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-heading text-2xl font-normal leading-tight tracking-[-0.02em] text-foreground sm:text-[28px]">
              我的书库
            </h1>
            {!isOffline && !isLoadingBooks && !loadError && (
              <p
                className="inline-flex shrink-0 items-baseline gap-2 font-mono text-xs tabular-nums text-muted-foreground"
                aria-label={`藏书共 ${bookCounts.all} 本`}
              >
                <span>{bookCounts.all} 本</span>
                {(selectedCategoryId !== null || hasSearchQuery) && (
                  <span className="text-subtle-foreground">· 显示 {filteredBooks.length} 本</span>
                )}
              </p>
            )}
          </div>

          {showCategoryFilters ? (
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 sm:w-56 lg:w-72">
                <TextInput
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => changeSearchQuery(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && !event.nativeEvent.isComposing && searchQuery) {
                      event.preventDefault();
                      changeSearchQuery('');
                    }
                  }}
                  placeholder="搜索书名或作者"
                  aria-label="搜索书库"
                  leftSection={
                    isSearching ? (
                      <Loader2
                        className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    ) : (
                      <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    )
                  }
                  leftSectionPointerEvents="none"
                  leftSectionWidth={36}
                  rightSection={
                    searchQuery ? (
                      <ActionIcon
                        type="button"
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => {
                          changeSearchQuery('');
                          searchInputRef.current?.focus();
                        }}
                        aria-label="清除搜索"
                        title="清除搜索"
                        className="size-9 min-h-0 min-w-0 cursor-pointer rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary/70 hover:text-foreground active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:size-7"
                      >
                        <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      </ActionIcon>
                    ) : null
                  }
                  rightSectionPointerEvents="all"
                  rightSectionWidth={36}
                  classNames={{
                    input: 'shelf-search app-field pl-9 pr-9 sm:h-9 sm:text-sm',
                  }}
                />
              </div>

              <div className="w-11 shrink-0 sm:w-36">
                <SortSelector value={sortBy} onChange={setSortBy} className="sm:h-9" />
              </div>
            </div>
          ) : showShelfControlsSkeleton ? (
            <div
              className="flex min-w-0 items-center gap-2"
              aria-hidden="true"
              data-testid="shelf-controls-skeleton"
            >
              <div className="skeleton-shimmer h-11 min-w-0 flex-1 rounded-lg bg-secondary/70 sm:h-9 sm:w-56 lg:w-72" />
              <div className="skeleton-shimmer h-11 w-11 shrink-0 rounded-lg bg-secondary/70 sm:h-9 sm:w-36" />
            </div>
          ) : null}
        </div>
        {isOffline ? (
          <div className="border-t border-border">
            <EmptyState
              icon={WifiOff}
              title="当前处于离线状态"
              description="暂时无法连接服务器。你仍可阅读已保存到此设备的离线图书。"
              action={(
                <>
                  <Button
                    type="button"
                    variant="filled"
                    className="min-h-11 cursor-pointer rounded-lg"
                    disabled={isRetryingAuth}
                    aria-busy={isRetryingAuth || undefined}
                    leftSection={
                      isRetryingAuth ? (
                        <Loader2
                          className="h-4 w-4 animate-spin motion-reduce:animate-none"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      ) : undefined
                    }
                    onClick={() => void handleRetryConnection()}
                  >
                    {isRetryingAuth ? '连接中…' : '重试连接'}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    leftSection={<HardDrive className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
                    className="min-h-11 cursor-pointer rounded-lg"
                    onClick={() => setOfflineBooksOpen(true)}
                  >
                    打开离线图书
                  </Button>
                </>
              )}
            />
          </div>
        ) : !isLoadingBooks && loadError ? (
          <div className="border-t border-border">
            <EmptyState
              icon={AlertCircle}
              tone="error"
              title="书架暂时无法加载"
              description="请确认服务器可用后重新加载。"
              detail={`错误信息：${loadError}`}
              action={(
                <Button
                  type="button"
                  variant="filled"
                  className="min-h-11 cursor-pointer rounded-lg"
                  onClick={refreshBooks}
                >
                  重新加载
                </Button>
              )}
            />
          </div>
        ) : !isLoadingBooks && isLibraryEmpty ? (
          <div className="relative border-t border-border">
            <EmptyState
              icon={BookOpen}
              title="书架还是空的"
              description="上传 EPUB、MOBI、AZW3 或 PDF 开始阅读。"
              detail={<span className="hidden sm:inline">也可以将文件拖放到书库批量导入。</span>}
              action={
                <FileUploadAction
                  accept={SUPPORTED_FORMATS_ACCEPT}
                  onChange={handleUpload}
                  disabled={isUploading}
                  title="上传书籍"
                  label="添加第一本书"
                  statusLabel={uploadStatusLabel}
                  density="prominent"
                  multiple
                  wrapperClassName="w-full sm:w-auto"
                  buttonClassName="w-full sm:w-auto"
                />
              }
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            {showCategoryFilters ? (
              <div className="flex min-w-0 items-center justify-between gap-2 border-y border-border/80 py-2 sm:gap-3">
                <div className="shelf-category-strip relative min-w-0 flex-1">
                  <div
                    ref={categoryStripRef}
                    role="group"
                    aria-label="书籍分类筛选"
                    className="scrollbar-none flex min-w-0 snap-x items-center gap-1 overflow-x-auto sm:flex-wrap sm:overflow-visible"
                  >
                    <button
                      type="button"
                      onClick={() => changeSelectedCategory(null)}
                      aria-pressed={selectedCategoryId === null}
                      data-active={selectedCategoryId === null}
                      className="shelf-filter-chip snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      全部
                    </button>
                    {bookCounts[UNCATEGORIZED_FILTER_ID] > 0 && (
                      <button
                        type="button"
                        onClick={() => changeSelectedCategory(UNCATEGORIZED_FILTER_ID)}
                        aria-pressed={selectedCategoryId === UNCATEGORIZED_FILTER_ID}
                        data-active={selectedCategoryId === UNCATEGORIZED_FILTER_ID}
                        className="shelf-filter-chip snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        未分类
                      </button>
                    )}
                    {categories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => changeSelectedCategory(category)}
                        aria-pressed={selectedCategoryId === category}
                        data-active={selectedCategoryId === category}
                        className="shelf-filter-chip max-w-[9rem] snap-start truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:max-w-[10rem]"
                        title={category}
                      >
                        <span className="truncate">{category}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-1 border-l border-border pl-2 sm:flex">
                  <Button
                    type="button"
                    variant="subtle"
                    color="gray"
                    size="xs"
                    disabled={isBatchBusy}
                    leftSection={<Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
                    className="min-h-8 shrink-0 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-[0.98] motion-reduce:active:scale-100"
                    onClick={() => setCategoryManagerOpen(true)}
                  >
                    管理
                  </Button>
                  <Button
                    type="button"
                    variant={selectionMode ? 'filled' : 'subtle'}
                    color={selectionMode ? undefined : 'gray'}
                    size="xs"
                    disabled={isBatchBusy}
                    leftSection={<CheckSquare className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
                    className={cn(
                      'min-h-8 shrink-0 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100',
                      selectionMode
                        ? 'bg-primary text-primary-foreground hover:bg-primary/92'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                    onClick={toggleSelectionMode}
                  >
                    {selectionMode ? '取消选择' : '批量操作'}
                  </Button>
                </div>
                <div className="shrink-0 sm:hidden">
                  <Menu
                    position="bottom-end"
                    offset={6}
                    width={184}
                    radius="lg"
                    shadow="md"
                    zIndex={60}
                    withinPortal
                    classNames={{ item: 'shelf-settings-item' }}
                  >
                    <Menu.Target>
                      <ActionIcon
                        variant={selectionMode ? 'filled' : 'default'}
                        size="md"
                        disabled={isBatchBusy}
                        aria-label="更多书库操作"
                        title="更多书库操作"
                        className={cn(
                          'flex h-11 w-11 min-h-0 min-w-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground transition-[background-color,color,border-color,transform] duration-150 hover:bg-secondary data-[expanded]:bg-secondary active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50',
                          selectionMode && 'border-primary bg-primary text-primary-foreground hover:bg-primary/92 data-[expanded]:bg-primary'
                        )}
                      >
                        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown className="paper-menu max-w-[calc(100vw-1.5rem)] rounded-xl p-1.5">
                      <Menu.Label className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground">
                        书库操作
                      </Menu.Label>
                      <Menu.Item
                        disabled={isBatchBusy}
                        leftSection={<Settings2 strokeWidth={1.5} aria-hidden="true" />}
                        onClick={() => setCategoryManagerOpen(true)}
                      >
                        管理分类
                      </Menu.Item>
                      <Menu.Item
                        disabled={isBatchBusy}
                        leftSection={<CheckSquare strokeWidth={1.5} aria-hidden="true" />}
                        onClick={toggleSelectionMode}
                      >
                        {selectionMode ? '取消选择' : '批量操作'}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </div>
              </div>
            ) : showShelfControlsSkeleton ? (
              <div
                className="flex min-w-0 items-center justify-between gap-2 border-y border-border/80 py-2 sm:gap-3"
                aria-hidden="true"
                data-testid="shelf-category-skeleton"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                  <div className="skeleton-shimmer h-11 w-14 shrink-0 rounded-lg bg-secondary/70 sm:h-8" />
                  <div className="skeleton-shimmer h-11 w-16 shrink-0 rounded-lg bg-secondary/70 sm:h-8" />
                  <div className="skeleton-shimmer h-11 w-20 shrink-0 rounded-lg bg-secondary/70 sm:h-8" />
                </div>
                <div className="hidden shrink-0 items-center gap-1 border-l border-border pl-2 sm:flex">
                  <div className="skeleton-shimmer h-8 w-16 rounded-lg bg-secondary/70" />
                  <div className="skeleton-shimmer h-8 w-20 rounded-lg bg-secondary/70" />
                </div>
                <div className="shrink-0 sm:hidden">
                  <div className="skeleton-shimmer h-11 w-11 rounded-lg bg-secondary/70" />
                </div>
              </div>
            ) : null}

            <section
              className={cn(
                'relative border-t border-border pt-4 sm:pt-5',
                selectionMode && filteredBooks.length > 0 && 'mb-32 sm:mb-28'
              )}
            >
              {!isLoadingBooks && isFiltered && (
                <div className="mb-3 flex items-baseline justify-between gap-3 text-sm">
                  <p className="min-w-0 truncate font-medium text-foreground" title={resultsLabel}>
                    {resultsLabel}
                  </p>
                  {!searchError && (
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground" role="status">
                      {isSearching
                        ? '正在搜索…'
                        : `${hasMoreBooks ? '已显示 ' : '共 '}${filteredBooks.length} 本`}
                    </p>
                  )}
                </div>
              )}
              {isLoadingBooks || isSearching ? (
                <div>
                  <BookCardSkeletonGrid count={6} />
                </div>
              ) : searchError ? (
                <EmptyState
                  icon={AlertCircle}
                  tone="error"
                  title="搜索书籍失败"
                  description="请稍后重试，或重置当前筛选。"
                  detail={`错误信息：${searchError}`}
                  action={(
                    <>
                      <Button
                        type="button"
                        variant="filled"
                        className="min-h-11 cursor-pointer rounded-lg"
                        onClick={retrySearch}
                      >
                        重试搜索
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        className="min-h-11 cursor-pointer rounded-lg"
                        onClick={clearShelfFilters}
                      >
                        重置所有筛选
                      </Button>
                    </>
                  )}
                />
              ) : filteredBooks.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="未找到相关书籍"
                  description={hasSearchQuery ? '换个关键词试试，或重置当前筛选。' : '当前分类没有书籍。'}
                  action={(
                    <Button
                      type="button"
                      variant="default"
                      className="min-h-11 cursor-pointer rounded-lg"
                      onClick={clearShelfFilters}
                    >
                      重置所有筛选
                    </Button>
                  )}
                />
              ) : (
                <div className="relative z-0">
                  <VirtualBookGrid
                    items={filteredBooks}
                    resetKey={`${selectedCategoryId ?? 'all'}:${searchQuery}:${sortBy}`}
                    canLoadMore={hasMoreBooks}
                    isLoadingMore={isLoadingMoreBooks}
                    onEndReached={handleEndReached}
                    getItemKey={getBookItemKey}
                    renderItem={renderBookCard}
                  />
                </div>
              )}
              {(hasMoreBooks || isLoadingMoreBooks) && (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  {isLoadingMoreBooks ? (
                    <div
                      className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
                      role="status"
                      aria-live="polite"
                    >
                      <LoadingSpinner className="h-4 w-4" />
                      加载中…
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="default"
                      className="min-h-11 cursor-pointer rounded-lg px-5"
                      onClick={() => void loadMoreBooks()}
                    >
                      加载更多图书
                    </Button>
                  )}
                  {!isFiltered && (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      已载入 {books.length}
                      {bookCounts.all > 0 ? ` / ${bookCounts.all}` : ''} 本
                    </p>
                  )}
                </div>
              )}
            </section>

            {selectionMode && !isLoadingBooks && !isSearching && filteredBooks.length > 0 && (
              <div
                className="pointer-events-none fixed left-[max(1rem,env(safe-area-inset-left,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-50 mx-auto max-w-[52rem] sm:left-[max(2rem,env(safe-area-inset-left,0px))] sm:right-[max(2rem,env(safe-area-inset-right,0px))] lg:left-auto lg:right-[max(2.5rem,env(safe-area-inset-right,0px))] lg:max-w-[44rem]"
              >
                <div
                  role="region"
                  aria-label="书籍批量操作"
                  className="shelf-batch-bar paper-reveal-soft pointer-events-auto flex flex-col gap-2.5 rounded-2xl px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
                >
                  <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto">
                    <div className="flex items-center gap-2 whitespace-nowrap text-sm">
                      <CheckSquare className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.6} aria-hidden="true" />
                      <span className="text-muted-foreground">
                        已选中
                      </span>
                      <span
                        className={cn(
                          'inline-flex min-w-[3.25rem] items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors',
                          selectedCount > 0
                            ? 'bg-primary/10 text-primary'
                            : 'bg-secondary text-muted-foreground'
                        )}
                        aria-live="polite"
                      >
                        {selectedCount} 本
                      </span>
                    </div>
                    <ActionIcon
                      type="button"
                      variant="subtle"
                      color="gray"
                      size="md"
                      disabled={isBatchBusy}
                      className="h-11 w-11 min-h-0 min-w-0 cursor-pointer rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-95 motion-reduce:active:scale-100 sm:hidden"
                      onClick={toggleSelectionMode}
                      aria-label="退出选择"
                      title="退出选择"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </ActionIcon>
                  </div>

                  <div className="grid w-full min-w-0 grid-cols-3 gap-2 border-t border-border/70 pt-2.5 sm:flex sm:w-auto sm:flex-1 sm:items-center sm:justify-end sm:border-t-0 sm:pt-0">
                    <Button
                      type="button"
                      variant="default"
                      size="xs"
                      disabled={isBatchBusy}
                      className="min-h-11 min-w-0 cursor-pointer rounded-lg border-border px-2 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 hover:bg-secondary active:scale-[0.98] motion-reduce:active:scale-100 sm:min-h-9 sm:px-3 sm:text-[13px]"
                      onClick={toggleVisibleSelection}
                    >
                      {allVisibleSelected ? '取消全选' : hasMoreBooks ? '选择已加载' : '全选'}
                    </Button>

                    <Button
                      type="button"
                      variant="default"
                      size="xs"
                      aria-label="批量分类"
                      aria-busy={isUpdatingManyCategories || undefined}
                      leftSection={
                        isUpdatingManyCategories ? (
                          <Loader2
                            className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        ) : (
                          <Tag className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                        )
                      }
                      className="min-h-11 min-w-0 cursor-pointer rounded-lg border-primary/25 bg-primary/8 px-2 text-xs font-medium text-primary transition-[background-color,border-color,color,transform] duration-150 hover:bg-primary/14 active:scale-[0.98] motion-reduce:active:scale-100 sm:min-h-9 sm:px-3 sm:text-[13px]"
                      disabled={selectedCount === 0 || isBatchBusy}
                      onClick={() => setBatchCategoryOpen(true)}
                    >
                      <span className="hidden sm:inline">
                        {isUpdatingManyCategories ? '更新中…' : '批量分类'}
                      </span>
                      <span className="sm:hidden">
                        {isUpdatingManyCategories ? '更新中' : '分类'}
                      </span>
                    </Button>

                    <Button
                      type="button"
                      variant="default"
                      size="xs"
                      aria-label="批量删除"
                      aria-busy={isDeletingMany || undefined}
                      leftSection={
                        isDeletingMany ? (
                          <Loader2
                            className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                        )
                      }
                      className="min-h-11 min-w-0 cursor-pointer rounded-lg border-border px-2 text-xs font-medium text-destructive transition-[background-color,border-color,color,transform] duration-150 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98] motion-reduce:active:scale-100 sm:min-h-9 sm:px-3 sm:text-[13px]"
                      disabled={selectedCount === 0 || isBatchBusy}
                      onClick={() => setBatchDeleteOpen(true)}
                    >
                      <span className="hidden sm:inline">
                        {isDeletingMany ? '删除中…' : '批量删除'}
                      </span>
                      <span className="sm:hidden">
                        {isDeletingMany ? '删除中' : '删除'}
                      </span>
                    </Button>

                    <ActionIcon
                      type="button"
                      variant="subtle"
                      color="gray"
                      size="md"
                      disabled={isBatchBusy}
                      className="ml-0.5 hidden min-h-0 min-w-0 cursor-pointer rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-95 motion-reduce:active:scale-100 sm:flex sm:size-9"
                      onClick={toggleSelectionMode}
                      aria-label="退出选择"
                      title="退出选择（Esc）"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </ActionIcon>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {isDraggingBookFile && canDropBookFiles && (
          <div
            aria-live="polite"
            className="shelf-dropzone-overlay paper-reveal-soft pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6"
          >
            <div
              className={cn(
                'paper-panel w-full max-w-sm rounded-2xl border-2 border-dashed px-8 py-8 text-center',
                isUploading ? 'border-border' : 'border-primary/45'
              )}
            >
              <div className="app-sheet-icon mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-primary/15">
                {isUploading ? (
                  <Loader2
                    className="h-5 w-5 animate-spin motion-reduce:animate-none"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : (
                  <Upload className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
                )}
              </div>
              <p className="mt-4 font-heading text-lg font-medium tracking-[-0.01em] text-foreground">
                {isUploading ? '正在上传图书，请稍候' : '松开即可批量导入'}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {isUploading
                  ? '请等待当前上传完成后再拖入新文件'
                  : '支持 EPUB、MOBI、AZW3、PDF'}
              </p>
            </div>
          </div>
        )}
        {batchDeleteOpen && (
          <ConfirmDialog
            open
            onOpenChange={setBatchDeleteOpen}
            title="删除所选图书"
            description={`确定删除选中的 ${selectedCount} 本图书吗？删除后将无法恢复。`}
            confirmLabel={isDeletingMany ? '删除中…' : '确认删除'}
            confirmDisabled={selectedCount === 0 || isDeletingMany}
            loading={isDeletingMany}
            onConfirm={confirmBatchDelete}
          />
        )}
        {batchCategoryOpen && (
          <BatchCategorySheet
            open
            onOpenChange={setBatchCategoryOpen}
            selectedCount={selectedCount}
            categories={categories}
            bookCounts={bookCounts}
            loading={isUpdatingManyCategories}
            onSave={saveBatchCategory}
          />
        )}
        {categoryManagerOpen && (
          <CategoryManagerSheet
            open
            onOpenChange={setCategoryManagerOpen}
            categories={categories}
            bookCounts={bookCounts}
            loading={isUpdatingManyCategories}
            onRenameCategory={saveManagedCategory}
          />
        )}
        {offlineBooksOpen && (
          <OfflineBooksDialog
            open
            onOpenChange={setOfflineBooksOpen}
          />
        )}
      </main>
    </AppScreen>
  );
}
