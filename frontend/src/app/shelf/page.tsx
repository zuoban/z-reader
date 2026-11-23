'use client';

import type { DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle,
  BookOpen,
  CheckSquare,
  HardDrive,
  LogOut,
  MoreHorizontal,
  Moon,
  Plus,
  Search,
  Settings2,
  Sun,
  Tag,
  Trash2,
  Upload,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useShelfData } from '@/hooks/useShelfData';
import { useShelfTheme } from '@/hooks/useShelfTheme';
import { AppScreen, BrandLogo, LoadingSpinner } from '@/components/AppShell';
import { BookCard } from '@/components/BookCard';
import { BookCardSkeletonGrid } from '@/components/BookCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { FileUploadAction } from '@/components/FileUploadAction';
import { SortSelector } from '@/components/SortSelector';
import { VirtualBookGrid } from '@/components/VirtualBookGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    loadBooks,
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

  const selectedExistingIds = useMemo(() => {
    const existingIds = new Set(books.map((book) => book.id));
    return Array.from(selectedBookIds).filter((id) => existingIds.has(id));
  }, [books, selectedBookIds]);

  const selectedCount = selectedExistingIds.length;
  const filteredBookIds = useMemo(
    () => filteredBooks.map((book) => book.id),
    [filteredBooks]
  );
  const allVisibleSelected =
    filteredBookIds.length > 0 && filteredBookIds.every((id) => selectedBookIds.has(id));

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
    setSelectionMode((enabled) => {
      if (enabled) {
        setSelectedBookIds(new Set());
        setBatchDeleteOpen(false);
        setBatchCategoryOpen(false);
      }
      return !enabled;
    });
  }

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

  function handleShelfDragEnter(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingBookFile(true);
  }

  function handleShelfDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;

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
    dragDepthRef.current = 0;
    setIsDraggingBookFile(false);

    if (isUploading) return;
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
      className="bg-[var(--shelf-app-bg)] font-sans"
      contentClassName="flex min-h-dvh w-full flex-col"
    >
      <header className="shelf-header sticky top-0 z-50 w-full border-b border-border">
        <div className="app-container flex h-14 items-center justify-between sm:h-16">
          <BrandLogo compact />

          <div className="flex items-center gap-2">
            {!isOffline && (
              <FileUploadAction
                accept={SUPPORTED_FORMATS_ACCEPT}
                onChange={handleUpload}
                disabled={isUploading}
                title="上传书籍"
                multiple
                buttonSize="icon-sm"
                buttonClassName="size-11 gap-1.5 px-0 sm:h-11 sm:w-auto sm:px-4"
              >
                {isUploading ? (
                  <LoadingSpinner className="h-4 w-4 border-primary-foreground/35 border-t-primary-foreground" />
                ) : (
                  <Upload className="h-4 w-4" strokeWidth={1.5} />
                )}
                <span className="hidden sm:inline">{uploadStatusLabel ?? '上传'}</span>
              </FileUploadAction>
            )}
            {!isOffline && passwordRequired ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11 shadow-none sm:size-11"
                    aria-label="书架设置"
                    title="书架设置"
                  >
                    <UserRound className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="shelf-account-menu w-48 rounded-lg border-border p-1"
                >
                  <DropdownMenuItem className="shelf-account-menu-item" onClick={toggleTheme}>
                    {isDark ? (
                      <Sun className="h-4 w-4" strokeWidth={1.5} />
                    ) : (
                      <Moon className="h-4 w-4" strokeWidth={1.5} />
                    )}
                    {isDark ? '亮色模式' : '暗色模式'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="shelf-account-menu-item"
                    onClick={() => setOfflineBooksOpen(true)}
                  >
                    <HardDrive className="h-4 w-4" strokeWidth={1.5} />
                    离线图书管理
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => { void logout().catch(() => toast.error('退出失败，请重试')); }}
                    className="shelf-account-menu-item shelf-account-menu-danger"
                  >
                    <LogOut className="h-4 w-4" strokeWidth={1.5} /> 退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 shadow-none sm:size-11"
                  onClick={() => setOfflineBooksOpen(true)}
                  aria-label="离线图书管理"
                  title="离线图书管理"
                >
                  <HardDrive className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 shadow-none sm:size-11"
                  onClick={toggleTheme}
                  aria-label={isDark ? '亮色模式' : '暗色模式'}
                  title={isDark ? '亮色模式' : '暗色模式'}
                >
                  {isDark ? (
                    <Sun className="h-4 w-4" strokeWidth={1.5} />
                  ) : (
                    <Moon className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main
        id="shelf-main"
        aria-label="书库"
        className="app-container relative z-10 flex-1 py-4 sm:py-6"
        onDragEnter={handleShelfDragEnter}
        onDragOver={handleShelfDragOver}
        onDragLeave={handleShelfDragLeave}
        onDrop={handleShelfDrop}
      >
        <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 sm:mb-5">
          <h1 className="font-heading text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-3xl">
            我的书库
          </h1>
          {!isOffline && !isLoadingBooks && !loadError && (
            <p className="shrink-0 text-sm tabular-nums text-muted-foreground" aria-label={`藏书共 ${bookCounts.all} 本`}>
              藏书 <span className="font-medium text-foreground">{bookCounts.all}</span> 本
            </p>
          )}
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
                    className="min-h-11"
                    disabled={isRetryingAuth}
                    onClick={() => void handleRetryConnection()}
                  >
                    {isRetryingAuth ? '连接中…' : '重试连接'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setOfflineBooksOpen(true)}
                  >
                    <HardDrive className="h-4 w-4" strokeWidth={1.5} />
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
                <Button type="button" className="min-h-11" onClick={() => void loadBooks()}>
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
                  multiple
                  wrapperClassName="w-full sm:w-auto"
                  buttonClassName="h-11 w-full sm:h-11 sm:w-auto"
                >
                  {isUploading ? (
                    <>
                      <LoadingSpinner className="mr-2 h-4 w-4 border-primary-foreground/30 border-t-primary-foreground" />
                      {uploadStatusLabel ?? '添加中...'}
                    </>
                  ) : (
                    <>
                      <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
                      添加第一本书
                    </>
                  )}
                </FileUploadAction>
              }
            />
            {isDraggingBookFile && (
              <div className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-background/95 text-center sm:flex">
                <div className="px-8 py-6">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="mt-3 font-heading text-xl font-semibold tracking-[-0.02em]">
                    松开以批量导入
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    支持 EPUB、MOBI、AZW3、PDF
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            {!isLoadingBooks && !isLibraryEmpty && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="relative min-w-0 flex-1 sm:max-w-[32rem]">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => changeSearchQuery(event.target.value)}
                      placeholder="搜索书名或作者"
                      aria-label="搜索书库"
                      className="shelf-search app-field pr-12 pl-11 sm:text-sm"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => changeSearchQuery('')}
                        aria-label="清除搜索"
                        className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="w-11 shrink-0 sm:w-40">
                    <SortSelector
                      value={sortBy}
                      onChange={setSortBy}
                    />
                  </div>
                </div>

                <div className="relative flex min-w-0 items-center gap-2">
                  <div
                    role="group"
                    aria-label="书籍分类筛选"
                    className="scrollbar-none flex min-w-0 flex-1 snap-x items-center gap-1 overflow-x-auto sm:flex-wrap sm:overflow-visible"
                  >
                    <span className="mr-1 hidden text-[13px] font-medium text-muted-foreground sm:block"
                      aria-hidden="true">
                      分类：
                    </span>
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
                        {category}
                      </button>
                    ))}
                  </div>
                  <div className="hidden shrink-0 items-center gap-1 border-l border-border pl-2 sm:flex">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 shrink-0 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                      onClick={() => setCategoryManagerOpen(true)}
                    >
                      <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      管理
                    </Button>
                    <Button
                      type="button"
                      variant={selectionMode ? 'secondary' : 'ghost'}
                      className={cn(
                        "min-h-11 shrink-0 rounded-lg px-3 text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98]",
                        selectionMode
                          ? "bg-primary text-primary-foreground hover:bg-primary/92"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                      onClick={toggleSelectionMode}
                    >
                      <CheckSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
                      <span>{selectionMode ? "取消选择" : "批量操作"}</span>
                    </Button>
                  </div>
                  <div className="shrink-0 self-start sm:hidden">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="更多书库操作"
                        className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-foreground',
                          selectionMode && 'border-primary bg-primary text-primary-foreground'
                        )}
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="min-h-11" onClick={() => setCategoryManagerOpen(true)}>
                          <Settings2 className="h-4 w-4" />
                          管理分类
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11" onClick={toggleSelectionMode}>
                          <CheckSquare className="h-4 w-4" />
                          {selectionMode ? '取消选择' : '批量操作'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            )}

            <section
              className={cn(
                'relative border-t border-border',
                selectionMode && filteredBooks.length > 0 && 'mb-32 sm:mb-28'
              )}
            >
              {!isLoadingBooks && (
                <div className="mb-2 flex min-h-9 items-baseline justify-between gap-3 pt-2 text-sm">
                  <p className="min-w-0 truncate font-medium text-foreground" title={resultsLabel}>
                    {resultsLabel}
                  </p>
                  {isFiltered && !searchError && (
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground" role="status">
                      {isSearching
                        ? '正在搜索…'
                        : `${hasMoreBooks ? '已显示 ' : '共 '}${filteredBooks.length} 本`}
                    </p>
                  )}
                </div>
              )}
              {isLoadingBooks || isSearching ? (
                <div className={cn(isLoadingBooks && 'pt-3')}>
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
                      <Button type="button" className="min-h-11" onClick={retrySearch}>
                        重试搜索
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
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
                      variant="outline"
                      className="min-h-11"
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
                    renderItem={(book, index) => (
                      <BookCard
                        book={book}
                        index={index}
                        categories={categories}
                        bookCounts={bookCounts}
                        onRead={() => router.push(`/read/${book.id}`)}
                        onDelete={() => handleDelete(book.id)}
                        onUpdate={loadBooks}
                        isDeleting={deletingId === book.id}
                        formatSize={formatFileSize}
                        progressPercentage={progressByBookId[book.id] ?? null}
                        searchQuery={searchQuery}
                        selectionMode={selectionMode}
                        selected={selectedBookIds.has(book.id)}
                        onSelectionToggle={() => toggleBookSelection(book.id)}
                      />
                    )}
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
                      variant="outline"
                      className="min-h-11 px-5"
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
              {isDraggingBookFile && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-background/95 text-center">
                  <div className="px-8 py-6">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Upload className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                    <p className="font-heading text-xl font-medium">
                      松开即可导入
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      支持 EPUB、PDF、MOBI、AZW3
                    </p>
                  </div>
                </div>
              )}
            </section>

            {selectionMode && !isLoadingBooks && filteredBooks.length > 0 && (
              <div
                className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-50 mx-auto max-w-[52rem] sm:inset-x-8 lg:left-auto lg:right-10 lg:max-w-[42rem]"
              >
                <div
                  role="region"
                  aria-label="书籍批量操作"
                  className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-border bg-card px-3 pt-2 pb-3 shadow-[var(--paper-shadow-floating)] sm:flex-row sm:items-center sm:gap-4 sm:py-2"
                >
                  <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto">
                    <div className="flex items-center gap-2 whitespace-nowrap text-sm">
                      <CheckSquare className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
                      <span className="text-muted-foreground">
                        已选中
                      </span>
                      <span className="font-semibold tabular-nums text-foreground" aria-live="polite">
                        {selectedCount} 本
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 rounded-lg text-muted-foreground sm:hidden"
                      onClick={toggleSelectionMode}
                      aria-label="退出选择"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid w-full min-w-0 grid-cols-3 gap-2 border-t border-border pt-2 sm:flex sm:border-t-0 sm:pt-0 sm:w-auto sm:flex-1 sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 min-w-0 rounded-lg border-border px-2 text-xs font-medium hover:bg-secondary sm:px-3 sm:text-sm"
                      onClick={toggleVisibleSelection}
                    >
                      {allVisibleSelected ? '取消全选' : '选择已加载'}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      aria-label="批量分类"
                      className="min-h-11 min-w-0 gap-1 rounded-lg border-primary/20 bg-primary/5 px-2 text-xs font-medium text-primary hover:bg-primary/10 sm:gap-1.5 sm:px-3 sm:text-sm"
                      disabled={selectedCount === 0 || isUpdatingManyCategories}
                      onClick={() => setBatchCategoryOpen(true)}
                    >
                      <Tag className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span className="hidden sm:inline">批量分类</span>
                      <span className="sm:hidden">分类</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      aria-label="批量删除"
                      className="min-h-11 min-w-0 gap-1 rounded-lg px-2 text-xs font-medium text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive sm:gap-1.5 sm:px-3 sm:text-sm"
                      disabled={selectedCount === 0 || isDeletingMany}
                      onClick={() => setBatchDeleteOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span className="hidden sm:inline">批量删除</span>
                      <span className="sm:hidden">删除</span>
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-1 hidden rounded-lg text-muted-foreground sm:flex sm:size-11"
                      onClick={toggleSelectionMode}
                      aria-label="退出选择"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {batchDeleteOpen && (
          <ConfirmDialog
            open
            onOpenChange={setBatchDeleteOpen}
            title="删除所选图书"
            description={`确定删除选中的 ${selectedCount} 本图书吗？删除后将无法恢复。`}
            confirmLabel={isDeletingMany ? '删除中' : '确认删除'}
            confirmDisabled={selectedCount === 0 || isDeletingMany}
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
