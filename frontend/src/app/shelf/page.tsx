'use client';

import type { DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  CheckSquare,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings2,
  Sun,
  Tag,
  Trash2,
  Upload,
  UserRound,
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
import { CategoryManagerSheet } from '@/components/CategoryManagerSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { FileUploadAction } from '@/components/FileUploadAction';
import { ShelfFilterSheet } from '@/components/ShelfFilterSheet';
import { SortSelector } from '@/components/SortSelector';
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

function ShelfBrand() {
  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a1a1a] text-white">
        <BookOpen className="h-4.5 w-4.5 stroke-[2.2]" />
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground sm:text-[1.3rem]">
        ZReader
      </span>
    </div>
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
  const { isLoading, isAuthenticated, logout } = useAuth();
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
      className="bg-background [font-family:ui-sans-serif,system-ui,sans-serif]"
      contentClassName="flex min-h-screen w-full flex-col"
    >
      <header className="sticky top-0 z-50 w-full border-b border-border/55 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1920px] items-center justify-between px-5 sm:px-7 lg:px-10">
          <ShelfBrand />

          <div className="flex items-center gap-1.5">
            <FileUploadAction
              accept={SUPPORTED_FORMATS_ACCEPT}
              onChange={handleUpload}
              disabled={isUploading}
              title="上传书籍"
              multiple
              buttonSize="icon-sm"
              buttonClassName="!min-h-0 !h-9 !w-9 sm:!h-10 sm:!w-auto rounded-lg bg-primary text-primary-foreground px-0 sm:px-5 text-[14px] font-bold shadow-none hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center border border-primary"
            >
              {isUploading ? (
                <LoadingSpinner className="h-4 w-4 border-primary-foreground/35 border-t-primary-foreground" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{uploadStatusLabel ?? '上传'}</span>
            </FileUploadAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg border border-border bg-card text-foreground shadow-none hover:bg-secondary/50"
                  style={{ minHeight: 'auto', minWidth: 'auto' }}
                  aria-label="账户与设置"
                  title="账户与设置"
                >
                  <UserRound className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className="w-48 rounded-xl border-border/40 p-1.5 shadow-lg backdrop-blur-md"
              >
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
      </header>

      <main
        className="relative z-10 mx-auto w-full max-w-[1920px] flex-1 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9"
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
                      <LoadingSpinner className="mr-2.5 h-4 w-4" />
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
          <div className="flex min-w-0 flex-col gap-4">
            {!isLoadingBooks && books.length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="group relative w-full flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 transition-colors" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => changeSearchQuery(event.target.value)}
                      placeholder="搜索书名或作者..."
                      aria-label="搜索书库"
                      className="h-11 rounded-xl border-0 bg-[#f5f5f5] pl-11 pr-10 text-[14px] font-medium text-foreground shadow-none transition-all placeholder:text-[#999] hover:bg-[#f0f0f0] focus:bg-[#f5f5f5] focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => changeSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-all"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="w-full sm:w-[10.5rem]">
                    <SortSelector
                      value={sortBy}
                      onChange={setSortBy}
                    />
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-muted-foreground/70 mr-1">分类：</span>
                  <button
                    type="button"
                    onClick={() => changeSelectedCategory(null)}
                    style={{ minHeight: '28px', minWidth: 'auto' }}
                    className={cn(
                      'flex h-7 items-center justify-center rounded-full px-3 sm:h-7 sm:rounded-full sm:px-3.5 text-[12px] sm:text-[13px] font-medium transition-all active:scale-[0.97]',
                      selectedCategoryId === null
                        ? 'bg-[#111111] text-white'
                        : 'bg-white border border-border text-foreground hover:bg-secondary/50'
                    )}
                  >
                    全部
                  </button>
                  {bookCounts[UNCATEGORIZED_FILTER_ID] > 0 && (
                    <button
                      type="button"
                      onClick={() => changeSelectedCategory(UNCATEGORIZED_FILTER_ID)}
                      style={{ minHeight: '28px', minWidth: 'auto' }}
                      className={cn(
                        'flex h-7 items-center justify-center rounded-full px-3 sm:h-7 sm:rounded-full sm:px-3.5 text-[12px] sm:text-[13px] font-medium transition-all active:scale-[0.97]',
                        selectedCategoryId === UNCATEGORIZED_FILTER_ID
                          ? 'bg-[#111111] text-white'
                          : 'bg-white border border-border text-foreground hover:bg-secondary/50'
                      )}
                    >
                      未分类
                    </button>
                  )}
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => changeSelectedCategory(category)}
                      style={{ minHeight: '28px', minWidth: 'auto' }}
                      className={cn(
                        'flex h-7 items-center justify-center max-w-[8rem] sm:max-w-[10rem] truncate rounded-full px-3 sm:h-7 sm:rounded-full sm:px-3.5 text-[12px] sm:text-[13px] font-medium transition-all active:scale-[0.97]',
                        selectedCategoryId === category
                          ? 'bg-[#111111] text-white'
                          : 'bg-white border border-border text-foreground hover:bg-secondary/50'
                      )}
                      title={category}
                    >
                      {category}
                    </button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    style={{ minHeight: '28px', minWidth: 'auto' }}
                    className="!h-7 rounded-full px-2.5 sm:!h-7 sm:rounded-full sm:px-2.5 gap-1 sm:gap-1.5 text-[12px] sm:text-[13px] font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    onClick={() => setCategoryManagerOpen(true)}
                  >
                    <Settings2 className="h-3.5 w-3.5 sm:h-3.5 sm:w-3.5" />
                    管理
                  </Button>
                </div>
              </div>
            )}

            <section
              className={cn(
                'shelf-container relative rounded-3xl transition-all duration-500 bg-transparent',
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
                <div className="relative z-0 grid grid-cols-2 gap-3 sm:gap-3 py-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
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
                      className="min-h-[44px] min-w-0 rounded-xl px-2.5 text-xs font-medium border-border/35 hover:bg-muted/50 transition-all active:scale-95 sm:px-4 sm:text-sm"
                      onClick={toggleVisibleSelection}
                    >
                      {allVisibleSelected ? '取消全选' : '选择本页'}
                    </Button>
                    
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px] min-w-0 rounded-xl px-2.5 text-xs font-medium border-primary/18 bg-primary/5 text-primary hover:bg-primary/10 transition-all active:scale-95 sm:px-4 sm:text-sm"
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
                      className="min-h-[44px] min-w-0 rounded-xl px-2.5 text-xs font-medium shadow-sm transition-all active:scale-95 sm:px-4 sm:text-sm"
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
                      className="hidden sm:flex min-h-[44px] w-9 ml-2 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
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
