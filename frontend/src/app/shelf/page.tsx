'use client';

import Link from 'next/link';
import type { DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  CheckSquare,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Sun,
  Tag,
  Trash2,
  Upload,
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
import { AppScreen, LoadingSpinner } from '@/components/AppShell';
import { BatchCategorySheet } from '@/components/BatchCategorySheet';
import { BookCard } from '@/components/BookCard';
import { BookCardSkeletonGrid } from '@/components/BookCardSkeleton';
import { CategoryFilter } from '@/components/CategoryFilter';
import { CategoryManagerSheet } from '@/components/CategoryManagerSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { FileUploadAction } from '@/components/FileUploadAction';
import { ShelfFilterSheet } from '@/components/ShelfFilterSheet';
import { SortSelector } from '@/components/SortSelector';
import { UserManager } from '@/components/UserManager';
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
const SHELF_TITLE = '我的书架';

function ShelfTitle() {
  return (
    <Link
      href="/"
      aria-label="返回 Z Reader 落地页"
      className="group flex min-w-0 flex-col items-start gap-0 outline-none transition-transform duration-200 hover:scale-[1.01] active:scale-[0.995] focus-visible:ring-2 focus-visible:ring-primary/30 rounded-xl py-0.5"
    >
      <h1
        className="font-heading text-lg font-semibold tracking-tight text-foreground/90 sm:text-xl lg:text-lg"
      >
        {SHELF_TITLE}
      </h1>
      <span className="text-[9.5px] font-medium tracking-[0.18em] text-muted-foreground/50 uppercase">
        Digital Library
      </span>
    </Link>
  );
}

export default function ShelfPage() {
  const router = useRouter();
  const [isDraggingBookFile, setIsDraggingBookFile] = useState(false);
  const dragDepthRef = useRef(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(() => new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchCategoryOpen, setBatchCategoryOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const { isLoading, isAuthenticated, user, logout } = useAuth();
  const { toggleTheme, isDark } = useShelfTheme();
  const {
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
  const activeCategoryLabel = selectedCategoryId === null
    ? null
    : selectedCategoryId === 'uncategorized'
      ? '未分类'
      : selectedCategoryId;
  const hasActiveShelfFilter = Boolean(searchQuery.trim() || activeCategoryLabel);
  const uploadStatusLabel = uploadProgress
    ? `上传 ${uploadProgress.current}/${uploadProgress.total}`
    : isUploading
      ? '上传中'
      : undefined;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

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

  function toggleBookSelection(bookId: string) {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  }

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

  if (isLoading || !isAuthenticated) {
    return (
      <AppScreen ambient="shelf">
        <div className="flex min-h-screen items-center justify-center">
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
            <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px] animate-pulse" />
            <div className="absolute -right-[10%] -bottom-[10%] h-[40%] w-[40%] rounded-full bg-accent/10 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
          </div>
          <div className="relative flex flex-col items-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 animate-ping opacity-15 bg-primary rounded-full blur-xl" />
              <LoadingSpinner className="relative h-11 w-11 border-primary/25" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-sm font-bold tracking-widest text-foreground/80 uppercase">Loading Library</p>
              <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full bg-primary animate-[shimmer_2s_infinite]" style={{ width: '40%' }} />
              </div>
            </div>
          </div>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      ambient="shelf"
      contentClassName="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col px-5 py-4 sm:px-6 sm:py-6 lg:px-12 lg:py-7 xl:px-14 2xl:px-16"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute left-[5%] top-[10%] h-[30%] w-[30%] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute right-[5%] bottom-[10%] h-[30%] w-[30%] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <header className="sticky top-0 z-50 mb-4 w-full pt-1 lg:mb-6 lg:pt-2">
        <div className="shelf-header flex h-16 items-center justify-between px-0 sm:h-20 lg:h-18">
          <div className="flex items-center gap-5">
            <ShelfTitle />
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div role="button" className="shelf-icon-btn p-2 cursor-pointer" tabIndex={0} aria-label="菜单">
                    <Menu className="h-4 w-4" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  className="shelf-account-menu w-44 min-w-44 rounded-2xl p-1.5"
                >
                  {user?.role === 'admin' && (
                    <UserManager
                      currentUser={user}
                      buttonClassName="shelf-account-menu-item shelf-account-menu-button w-full justify-start"
                      triggerLabel="用户管理"
                      triggerLabelClassName="inline"
                    />
                  )}

                  <FileUploadAction
                    accept={SUPPORTED_FORMATS_ACCEPT}
                    onChange={handleUpload}
                    disabled={isUploading}
                    title="上传书籍"
                    multiple
                    wrapperClassName="w-full"
                    buttonVariant="ghost"
                    buttonSize="sm"
                    buttonClassName={cn(
                      'shelf-account-menu-item shelf-account-menu-button w-full justify-start',
                      isUploading && 'text-primary opacity-100'
                    )}
                  >
                    {isUploading ? (
                      <LoadingSpinner className="h-4 w-4 border-primary/25 shadow-none" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploadStatusLabel ?? '上传书籍'}
                  </FileUploadAction>

                  <DropdownMenuItem
                    className="shelf-account-menu-item"
                    onClick={() => setCategoryManagerOpen(true)}
                  >
                    <Tag className="h-4 w-4" /> 分类管理
                  </DropdownMenuItem>
                  <DropdownMenuItem className="shelf-account-menu-item" onClick={toggleTheme}>
                    {isDark ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                    {isDark ? '亮色模式' : '暗色模式'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={logout}
                    className="shelf-account-menu-item shelf-account-menu-danger"
                  >
                    <LogOut className="h-4 w-4" /> 退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

          </div>
        </div>
      </header>

      <main
        className="relative z-10 flex-1"
        onDragEnter={handleShelfDragEnter}
        onDragOver={handleShelfDragOver}
        onDragLeave={handleShelfDragLeave}
        onDrop={handleShelfDrop}
      >
        {!isLoadingBooks && loadError ? (
          <div>
            <div className="shelf-container flex min-h-[28rem] flex-col items-center justify-center rounded-2xl px-6 py-12 text-center ">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertCircle className="h-7 w-7" />
              </div>
              <h2 className="mt-5 font-heading text-2xl font-semibold text-foreground">
                书架暂时无法加载
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                请确认后端服务可用后重试。错误信息：{loadError}
              </p>
              <Button
                type="button"
                className="mt-6 h-11 rounded-lg px-5"
                onClick={() => void loadBooks()}
              >
                重新加载
              </Button>
            </div>
          </div>
        ) : !isLoadingBooks && books.length === 0 ? (
          <div className="relative">
            <EmptyState
              icon={BookOpen}
              title="书架还是空的"
              description="上传你的第一本 EPUB、MOBI、AZW3 或 PDF，开始你的阅读之旅"
              tags={['EPUB', 'MOBI', 'AZW3', 'PDF']}
              action={
                <FileUploadAction
                  accept={SUPPORTED_FORMATS_ACCEPT}
                  onChange={handleUpload}
                  disabled={isUploading}
                  title="上传书籍"
                  multiple
                  wrapperClassName="w-full sm:w-auto"
                  buttonClassName="h-11 w-full rounded-xl border border-primary/12 bg-primary px-8 text-sm font-semibold tracking-[0.02em] text-primary-foreground transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/18 hover:bg-primary/92 active:scale-[0.985] sm:w-auto sm:px-10"
                >
                  {isUploading ? (
                    <>
                      <LoadingSpinner inverted className="mr-2.5 h-4 w-4 border-background/30" />
                      {uploadStatusLabel ?? '添加中...'}
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2.5 h-4 w-4" />
                      添加第一本书
                    </>
                  )}
                </FileUploadAction>
              }
            />
            {isDraggingBookFile && (
              <div className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-background/78 text-center shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--paper-edge)_70%,transparent)]  sm:flex">
                <div className="rounded-2xl border border-primary/16 bg-card/58 px-8 py-6 shadow-[0_18px_48px_-34px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_52%,transparent)] ">
                  <Upload className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-3 font-heading text-xl font-semibold">松开以批量导入</p>
                  <p className="mt-1 text-sm text-muted-foreground">支持 EPUB、MOBI、AZW3、PDF</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:gap-5">
            {!isLoadingBooks && books.length > 0 && (
              <div className="shelf-toolbar py-2.5 sm:px-4 sm:py-3 lg:px-0">
                <div
                  className={cn(
                    'flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:grid lg:grid-cols-[minmax(28rem,42rem)_minmax(0,1fr)] lg:gap-10',
                    categories.length === 0 && 'sm:min-w-[13rem]'
                  )}
                >
                  <div className="relative w-full sm:max-w-[24rem] lg:max-w-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40 transition-colors group-focus-within:text-primary/60" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => changeSearchQuery(event.target.value)}
                      placeholder="搜索书名、作者或关键词..."
                      aria-label="搜索书架"
                      className="h-9 rounded-md border border-border/40 bg-background pl-9.5 pr-9 text-sm shadow-none transition-all hover:border-border/60 focus:border-primary/40 focus:ring-0 placeholder:text-muted-foreground/60"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => changeSearchQuery('')}
                        aria-label="清空搜索"
                        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 sm:ml-auto lg:min-w-0 lg:justify-end">
                    {hasActiveShelfFilter && (
                      <div className="hidden flex-wrap items-center gap-2 text-[11px] font-medium sm:flex">
                        <span className="rounded-md bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground/70">
                          {filteredBooks.length} 本
                        </span>
                        <button
                          type="button"
                          onClick={clearShelfFilters}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-border/15 bg-card/40 px-2 text-xs text-muted-foreground/70  transition-all hover:border-border/25 hover:bg-card/60 hover:text-foreground/80 active:scale-95"
                        >
                          <X className="h-2.5 w-2.5" />
                          <span>重置</span>
                        </button>
                      </div>
                    )}

                    <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 sm:flex sm:w-auto lg:gap-2.5">
                      <div className="hidden flex-row items-center gap-2 lg:flex lg:shrink-0">
                        {categories.length > 0 && (
                          <CategoryFilter
                            categories={categories}
                            selectedCategoryId={selectedCategoryId}
                            onSelectCategory={changeSelectedCategory}
                            bookCounts={bookCounts}
                            className="sm:w-[12.5rem]"
                          />
                        )}
                        <SortSelector
                          value={sortBy}
                          onChange={setSortBy}
                          className="sm:w-[12.5rem]"
                        />
                      </div>
                      
                      <div className="flex items-center gap-1.5 lg:hidden">
                        <ShelfFilterSheet
                          categories={categories}
                          selectedCategoryId={selectedCategoryId}
                          onSelectCategory={changeSelectedCategory}
                          bookCounts={bookCounts}
                          sortBy={sortBy}
                          onSortChange={setSortBy}
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          'group h-9 min-w-[5.5rem] rounded-lg border border-border/15 bg-card/30 px-2.5 text-xs font-medium text-muted-foreground/70  transition-all duration-200 hover:border-border/25 hover:bg-card/50 hover:text-foreground/80 active:scale-[0.97] sm:px-3.5 sm:text-sm',
                          selectionMode && 'border-primary/20 bg-primary/5 text-primary shadow-none'
                        )}
                        onClick={toggleSelectionMode}
                      >
                        <CheckSquare className={cn(
                          "h-3.5 w-3.5 transition-colors",
                          selectionMode ? "text-primary" : "text-muted-foreground/40 group-hover:text-primary/60"
                        )} />
                        <span>{selectionMode ? '取消' : '选择'}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {hasActiveShelfFilter && (
              <div className="flex flex-wrap items-center gap-1.5 px-0.5 sm:hidden">
                <span className="text-[9px] font-medium tracking-wider text-muted-foreground/40 uppercase">
                  筛选
                </span>
                <div className="flex flex-wrap gap-1">
                   <span className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/60">
                    {filteredBooks.length} 本
                  </span>
                  {activeCategoryLabel && (
                    <span className="rounded-md bg-primary/5 px-1.5 py-0.5 text-[9px] font-medium text-primary/60">
                      {activeCategoryLabel}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={clearShelfFilters}
                    className="flex h-4.5 items-center gap-0.5 rounded-md border border-border/15 bg-card/40 px-1.5 text-[8px] font-medium text-muted-foreground/60 transition-all active:scale-95"
                  >
                    <X className="h-2 w-2" />
                    重置
                  </button>
                </div>
              </div>
            )}

            <section
              className={cn(
                'shelf-container relative rounded-3xl transition-all duration-500 bg-card/40 border-0 shadow-none',
                selectionMode && filteredBooks.length > 0 && 'mb-32 sm:mb-28'
              )}
            >
              {isLoadingBooks ? (
                <div className="px-4 py-6 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
                  <BookCardSkeletonGrid count={6} />
                </div>
              ) : filteredBooks.length === 0 ? (
                <div className="flex min-h-[26rem] flex-col items-center justify-center px-8 py-16 text-center">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 animate-pulse blur-2xl bg-primary/10 rounded-full" />
                    <Search className="relative h-12 w-12 text-primary/30" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-foreground tracking-tight">
                    未找到相关书籍
                  </h2>
                  <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-muted-foreground/80">
                    尝试使用不同的关键词搜索，或重置当前的分类筛选与排序。
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-8 h-11 rounded-xl px-6 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 font-bold"
                    onClick={clearShelfFilters}
                  >
                    重置所有筛选
                  </Button>
                </div>
              ) : (
                <div className="relative z-0 grid grid-cols-2 gap-x-5 gap-y-6 py-5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-x-8 sm:gap-y-12 sm:px-8 sm:py-10 lg:grid-cols-[repeat(auto-fill,minmax(184px,184px))] lg:justify-between lg:gap-x-8 lg:gap-y-14 lg:px-0 lg:pb-12 lg:pt-7 xl:gap-x-10 xl:pt-8 2xl:gap-y-16">
                  {filteredBooks.map((book, index) => (
                    <BookCard
                      key={`${book.id}:${book.cover_path ?? ''}:${book.format}`}
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
                  ))}
                </div>
              )}
              {isDraggingBookFile && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary/30 bg-background/80 text-center shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--paper-edge)_70%,transparent)] ">
                  <div className="rounded-3xl border border-primary/15 bg-card/60 px-10 py-8 shadow-[0_24px_54px_-30px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_50%,transparent)] ">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
                      <Upload className="h-8 w-8" />
                    </div>
                    <p className="font-heading text-2xl font-bold tracking-tight">松开即可导入</p>
                    <p className="mt-1.5 text-sm text-muted-foreground/80">支持 EPUB, PDF, MOBI, AZW3</p>
                  </div>
                </div>
              )}
            </section>

            {selectionMode && !isLoadingBooks && filteredBooks.length > 0 && (
              <div
                className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-50 mx-auto max-w-[52rem] sm:inset-x-8 lg:left-auto lg:right-10 lg:max-w-[42rem]"
              >
                <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-primary/20 bg-card/90 px-4 py-3 shadow-lg  sm:px-6 sm:py-3.5">
                  <div className="flex min-w-0 items-center gap-3.5 border-r border-border/15 pr-4 sm:pr-6">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <CheckSquare className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground/60 uppercase">已选中</span>
                      <span className="truncate text-sm font-bold text-foreground">
                        {selectedCount} <span className="text-[11px] font-medium text-muted-foreground ml-0.5">本书籍</span>
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2.5 sm:flex sm:flex-1 sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9.5 min-w-0 rounded-xl px-2.5 text-xs font-medium border-border/35 hover:bg-muted/50 transition-all active:scale-95 sm:px-4 sm:text-sm"
                      onClick={toggleVisibleSelection}
                    >
                      {allVisibleSelected ? '取消全选' : '选择本页'}
                    </Button>
                    
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9.5 min-w-0 rounded-xl px-2.5 text-xs font-medium border-primary/18 bg-primary/5 text-primary hover:bg-primary/10 transition-all active:scale-95 sm:px-4 sm:text-sm"
                      disabled={selectedCount === 0 || isUpdatingManyCategories}
                      onClick={() => setBatchCategoryOpen(true)}
                    >
                      <Tag className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline ml-2">批量分类</span>
                      <span className="sm:hidden ml-1.5">分类</span>
                    </Button>
                    
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-9.5 min-w-0 rounded-xl px-2.5 text-xs font-medium shadow-sm transition-all active:scale-95 sm:px-4 sm:text-sm"
                      disabled={selectedCount === 0 || isDeletingMany}
                      onClick={() => setBatchDeleteOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline ml-2">批量删除</span>
                      <span className="sm:hidden ml-1.5">删除</span>
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="hidden sm:flex h-9 w-9 ml-2 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
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
        <ConfirmDialog
          open={batchDeleteOpen}
          onOpenChange={setBatchDeleteOpen}
          title="删除所选图书"
          description={`确定删除选中的 ${selectedCount} 本图书吗？删除后将无法恢复。`}
          confirmLabel={isDeletingMany ? '删除中' : '确认删除'}
          confirmDisabled={selectedCount === 0 || isDeletingMany}
          onConfirm={confirmBatchDelete}
        />
        <BatchCategorySheet
          open={batchCategoryOpen}
          onOpenChange={setBatchCategoryOpen}
          selectedCount={selectedCount}
          categories={categories}
          bookCounts={bookCounts}
          loading={isUpdatingManyCategories}
          onSave={saveBatchCategory}
        />
        <CategoryManagerSheet
          open={categoryManagerOpen}
          onOpenChange={setCategoryManagerOpen}
          categories={categories}
          bookCounts={bookCounts}
          loading={isUpdatingManyCategories}
          onRenameCategory={saveManagedCategory}
        />
      </main>
    </AppScreen>
  );
}
