'use client';

import Link from 'next/link';
import type { CSSProperties, DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  CheckSquare,
  Library,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sun,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
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

const SUPPORTED_FORMATS_ACCEPT = '.epub,.mobi,.azw3,.pdf,application/pdf';
const SHELF_TITLE = '我的书架';
const SHELF_SIDEBAR_COLLAPSED_KEY = 'z-reader:shelf-sidebar-collapsed';

function delay(ms: number): CSSProperties {
  return { '--paper-delay': `${ms}ms` } as CSSProperties;
}

function ShelfTitle({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="返回 Z Reader 落地页"
      className={cn(
        'group flex min-w-0 items-center gap-3.5 rounded-lg outline-none transition-opacity hover:opacity-88 focus-visible:ring-2 focus-visible:ring-primary/30',
        collapsed && 'lg:justify-center lg:gap-0'
      )}
    >
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_55%,transparent)] sm:h-12 sm:w-12',
          collapsed && 'lg:h-10 lg:w-10 lg:rounded-[1rem]'
        )}
      >
        <Library className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
      </div>
      <h1
        className={cn(
          'truncate font-heading text-2xl font-semibold text-foreground sm:text-3xl lg:text-2xl',
          collapsed && 'lg:sr-only'
        )}
      >
        {SHELF_TITLE}
      </h1>
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;

    return window.localStorage.getItem(SHELF_SIDEBAR_COLLAPSED_KEY) === 'true';
  });
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

  useEffect(() => {
    window.localStorage.setItem(
      SHELF_SIDEBAR_COLLAPSED_KEY,
      String(isSidebarCollapsed)
    );
  }, [isSidebarCollapsed]);

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
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner />
            <p className="text-sm font-medium text-muted-foreground">加载中...</p>
          </div>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      ambient="shelf"
      contentClassName="mx-auto flex min-h-screen w-full max-w-[1520px] flex-col px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
    >
      <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
        <aside
          className={cn(
            'paper-reveal shelf-header transition-[width] duration-300 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:shrink-0 lg:self-start lg:overflow-y-auto',
            isSidebarCollapsed ? 'lg:w-[6.5rem]' : 'lg:w-[18rem]',
            isSidebarCollapsed && 'shelf-sidebar-collapsed'
          )}
          style={delay(0)}
        >
          <div
            className={cn(
              'relative z-10 flex flex-col px-3.5 py-3.5 sm:px-5 sm:py-5 lg:px-4 lg:py-5',
              isSidebarCollapsed && 'lg:px-3 lg:py-4'
            )}
          >
            <div
              className={cn(
                'flex flex-col gap-3 border-b border-border/25 pb-3.5 sm:pb-4 lg:border-border/35',
                isSidebarCollapsed && 'lg:items-center lg:gap-2 lg:pb-3'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-between gap-2',
                  isSidebarCollapsed && 'lg:flex-col lg:justify-center'
                )}
              >
                <ShelfTitle collapsed={isSidebarCollapsed} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
                  aria-pressed={isSidebarCollapsed}
                  title={isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
                  onClick={() => setIsSidebarCollapsed((value) => !value)}
                  className={cn(
                    'shelf-collapse-toggle relative z-20 hidden h-11 w-11 cursor-pointer rounded-2xl border border-primary/12 bg-card/88 text-muted-foreground shadow-[0_8px_18px_-16px_var(--paper-shadow-soft),inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_60%,transparent)] transition-all hover:border-primary/24 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 lg:flex',
                    isSidebarCollapsed && 'lg:h-9 lg:w-9 lg:rounded-xl'
                  )}
                >
                  {isSidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p
                className={cn(
                  'hidden text-sm leading-6 text-muted-foreground sm:block lg:text-xs lg:leading-5',
                  isSidebarCollapsed && 'lg:hidden'
                )}
              >
                管理藏书、分类和阅读偏好
              </p>
            </div>

            <nav
              className={cn('mt-3 lg:mt-4', isSidebarCollapsed && 'lg:mt-3')}
              aria-label="书架菜单"
            >
              <div
                className={cn(
                  'hidden px-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground/70 uppercase mb-1 lg:block',
                  isSidebarCollapsed && 'lg:sr-only'
                )}
              >
                操作
              </div>
              {/* Mobile: compact icon row */}
              <div
                className={cn(
                  'grid gap-2 sm:hidden',
                  user?.role === 'admin' ? 'grid-cols-5' : 'grid-cols-4'
                )}
              >
                {user?.role === 'admin' && (
                  <UserManager
                    currentUser={user}
                    triggerLabel="用户管理"
                    buttonClassName="shelf-mobile-action"
                  />
                )}

                <FileUploadAction
                  accept={SUPPORTED_FORMATS_ACCEPT}
                  onChange={handleUpload}
                  disabled={isUploading}
                  title="上传书籍"
                  multiple
                  statusLabel={uploadStatusLabel}
                  wrapperClassName="flex justify-center overflow-visible"
                  buttonVariant="ghost"
                  buttonSize="icon"
                  buttonClassName={cn(
                    'shelf-mobile-action',
                    isUploading && 'text-primary'
                  )}
                >
                  {isUploading ? (
                    <LoadingSpinner className="h-4 w-4 border-primary/25 shadow-none" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span className="hidden">{uploadStatusLabel ?? '上传书籍'}</span>
                </FileUploadAction>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCategoryManagerOpen(true)}
                  aria-label="分类管理"
                  className="shelf-mobile-action cursor-pointer"
                >
                  <Tag className="h-4 w-4" />
                  <span className="hidden">分类管理</span>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  aria-label={isDark ? '切换亮色模式' : '切换暗色模式'}
                  className="shelf-mobile-action cursor-pointer"
                >
                  {isDark ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  <span className="hidden">{isDark ? '亮色模式' : '暗色模式'}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  aria-label="退出"
                  className="shelf-mobile-action cursor-pointer hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden">退出登录</span>
                </Button>
              </div>

              {/* Desktop: sidebar menu items */}
              <div
                className={cn(
                  'hidden grid-cols-2 gap-2 sm:grid lg:flex lg:flex-col lg:gap-1.5',
                  user?.role === 'admin' ? 'sm:grid-cols-5' : 'sm:grid-cols-4',
                  isSidebarCollapsed && 'lg:items-center lg:gap-2.5'
                )}
              >
                {user?.role === 'admin' && (
                  <UserManager
                    currentUser={user}
                    triggerLabel="用户管理"
                    buttonClassName="shelf-menu-item"
                  />
                )}

                <FileUploadAction
                  accept={SUPPORTED_FORMATS_ACCEPT}
                  onChange={handleUpload}
                  disabled={isUploading}
                  title="上传书籍"
                  multiple
                  statusLabel={uploadStatusLabel}
                  wrapperClassName="overflow-visible"
                  buttonVariant="ghost"
                  buttonSize="sm"
                  buttonClassName={cn(
                    'shelf-menu-item',
                    isUploading && 'bg-primary/10 text-primary opacity-100 hover:bg-primary/12'
                  )}
                >
                  {isUploading ? (
                    <LoadingSpinner className="h-4 w-4 border-primary/25 shadow-none" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span>{uploadStatusLabel ?? '上传书籍'}</span>
                </FileUploadAction>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCategoryManagerOpen(true)}
                  aria-label="分类管理"
                  className="shelf-menu-item cursor-pointer"
                >
                  <Tag className="h-4 w-4" />
                  <span>分类管理</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  aria-label={isDark ? '切换亮色模式' : '切换暗色模式'}
                  className="shelf-menu-item cursor-pointer"
                >
                  {isDark ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  <span>{isDark ? '亮色模式' : '暗色模式'}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  aria-label="退出"
                  className="shelf-menu-item cursor-pointer text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>退出登录</span>
                </Button>
              </div>
            </nav>

          </div>
        </aside>

      <main
        className="min-w-0 flex-1"
        onDragEnter={handleShelfDragEnter}
        onDragOver={handleShelfDragOver}
        onDragLeave={handleShelfDragLeave}
        onDrop={handleShelfDrop}
      >
        {!isLoadingBooks && loadError ? (
          <div className="paper-reveal" style={delay(120)}>
            <div className="shelf-container flex min-h-[28rem] flex-col items-center justify-center rounded-2xl px-6 py-12 text-center">
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
          <div className="paper-reveal relative" style={delay(120)}>
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
                  buttonClassName="h-12 w-full rounded-2xl border border-primary/15 bg-primary px-8 text-sm font-semibold tracking-[0.04em] text-primary-foreground transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-primary/92 active:scale-[0.985] sm:w-auto sm:px-10"
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
              <div className="pointer-events-none absolute inset-0 z-20 hidden items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-background/78 text-center shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--paper-edge)_70%,transparent)] backdrop-blur-sm sm:flex">
                <div className="rounded-2xl bg-card/92 px-8 py-6 shadow-[0_18px_48px_-34px_var(--paper-shadow)]">
                  <Upload className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-3 font-heading text-xl font-semibold">松开以批量导入</p>
                  <p className="mt-1 text-sm text-muted-foreground">支持 EPUB、MOBI、AZW3、PDF</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
            {!isLoadingBooks && books.length > 0 && (
              <div className="paper-reveal shelf-toolbar" style={delay(90)}>
                <div
                  className={cn(
                    'flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
                    categories.length === 0 && 'sm:min-w-[13rem]'
                  )}
                >
                  <div className="relative w-full sm:max-w-[22rem]">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/55" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => changeSearchQuery(event.target.value)}
                      placeholder="搜索书名、作者、文件名"
                      aria-label="搜索书架"
                      className="h-11 rounded-xl border-primary/16 bg-card/92 pl-10 pr-10 text-sm shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_70%,transparent)_inset,0_8px_18px_-16px_var(--paper-shadow-soft)]"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => changeSearchQuery('')}
                        aria-label="清空搜索"
                        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {hasActiveShelfFilter && (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground sm:ml-auto sm:mr-2">
                      <span className="rounded-md bg-foreground/8 px-2 py-1 text-foreground/70">
                        找到 {filteredBooks.length} 本
                      </span>
                      {activeCategoryLabel && (
                        <span className="rounded-md bg-primary/10 px-2 py-1 text-primary/80">
                          {activeCategoryLabel}
                        </span>
                      )}
                      {searchQuery.trim() && (
                        <span className="max-w-[12rem] truncate rounded-md bg-foreground/8 px-2 py-1 text-foreground/70">
                          {searchQuery.trim()}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:order-last sm:flex sm:w-auto">
                    <ShelfFilterSheet
                      categories={categories}
                      selectedCategoryId={selectedCategoryId}
                      onSelectCategory={changeSelectedCategory}
                      bookCounts={bookCounts}
                      sortBy={sortBy}
                      onSortChange={setSortBy}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        'group h-11 min-w-[6.25rem] rounded-xl border border-primary/16 bg-card/92 px-3 text-sm font-semibold text-foreground/82 shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_70%,transparent)_inset,0_8px_18px_-16px_var(--paper-shadow-soft)] transition-all duration-200 hover:border-primary/30 hover:bg-card hover:text-foreground hover:shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_76%,transparent)_inset,0_12px_24px_-18px_var(--paper-shadow)] focus-visible:border-primary/38 focus-visible:ring-2 focus-visible:ring-primary/18 focus-visible:ring-offset-0 sm:px-4',
                        selectionMode && 'border-primary/28 bg-[var(--shelf-surface-selected)] text-foreground shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_80%,transparent)_inset,0_14px_28px_-20px_var(--paper-shadow)]'
                      )}
                      onClick={toggleSelectionMode}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 text-primary/64 transition-colors group-hover:bg-primary/10 group-hover:text-primary/80',
                          selectionMode && 'bg-primary/12 text-primary'
                        )}
                        aria-hidden="true"
                      >
                        <CheckSquare className="h-4 w-4" />
                      </span>
                      <span>{selectionMode ? '退出选择' : '选择'}</span>
                    </Button>
                  </div>
                  {/* Desktop: full dropdowns */}
                  <div className="hidden w-full flex-row items-center gap-2 sm:flex sm:w-auto sm:shrink-0">
                    {categories.length > 0 && (
                      <CategoryFilter
                        categories={categories}
                        selectedCategoryId={selectedCategoryId}
                        onSelectCategory={changeSelectedCategory}
                        bookCounts={bookCounts}
                        className="sm:w-[13rem]"
                      />
                    )}
                    <SortSelector
                      value={sortBy}
                      onChange={setSortBy}
                      className="sm:ml-auto sm:w-[13rem]"
                    />
                  </div>
                </div>
              </div>
            )}
            <section
              className={cn(
                'paper-reveal shelf-container relative rounded-2xl',
                selectionMode && filteredBooks.length > 0 && 'mb-28 sm:mb-24'
              )}
              style={delay(150)}
            >
              {isLoadingBooks ? (
                <div className="px-3 py-5 sm:px-6 sm:py-8 lg:px-7 lg:py-9">
                  <BookCardSkeletonGrid count={6} />
                </div>
              ) : filteredBooks.length === 0 ? (
                <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 py-12 text-center">
                  <Search className="h-10 w-10 text-primary/55" />
                  <h2 className="mt-4 font-heading text-2xl font-semibold text-foreground">
                    没找到匹配的书
                  </h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                    换个关键词，或清空搜索和分类筛选后再看看。
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5 h-10 rounded-lg px-4"
                    onClick={() => {
                      changeSearchQuery('');
                      changeSelectedCategory(null);
                    }}
                  >
                    清空筛选
                  </Button>
                </div>
              ) : (
                <div className="relative z-0 grid grid-cols-2 gap-x-3 gap-y-6 px-3 py-5 sm:grid-cols-[repeat(auto-fill,minmax(184px,1fr))] sm:gap-x-6 sm:gap-y-10 sm:px-6 sm:py-8 lg:grid-cols-[repeat(auto-fill,minmax(196px,1fr))] lg:gap-x-8 lg:gap-y-12 lg:px-8 lg:py-9">
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
                <div className="pointer-events-none absolute inset-0 z-30 hidden items-center justify-center rounded-2xl border-2 border-dashed border-primary/45 bg-background/78 text-center shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--paper-edge)_70%,transparent)] backdrop-blur-sm sm:flex">
                  <div className="rounded-2xl bg-card/92 px-8 py-6 shadow-[0_18px_48px_-34px_var(--paper-shadow)]">
                    <Upload className="mx-auto h-8 w-8 text-primary" />
                    <p className="mt-3 font-heading text-xl font-semibold">松开以批量导入</p>
                    <p className="mt-1 text-sm text-muted-foreground">支持 EPUB、MOBI、AZW3、PDF</p>
                  </div>
                </div>
              )}
            </section>
            {selectionMode && !isLoadingBooks && filteredBooks.length > 0 && (
              <div
                className="paper-reveal pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-40 mx-auto max-w-[46rem] sm:inset-x-6 lg:left-auto lg:right-8 lg:max-w-[48rem]"
                style={delay(105)}
              >
                <div className="shelf-toolbar pointer-events-auto gap-2 rounded-2xl border-primary/18 bg-card/96 shadow-[0_18px_52px_-30px_var(--paper-shadow),0_6px_18px_-14px_var(--paper-shadow-soft),inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_70%,transparent)]">
                  <div className="flex min-w-0 items-center justify-between gap-3 sm:min-w-[8rem]">
                    <div className="min-w-0 text-sm font-medium text-muted-foreground">
                      已选择 <span className="font-bold text-foreground">{selectedCount}</span> 本
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground sm:hidden"
                      onClick={toggleSelectionMode}
                      aria-label="退出选择模式"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-1 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 min-w-0 rounded-lg px-2 text-xs sm:px-4 sm:text-sm"
                      onClick={toggleVisibleSelection}
                    >
                      <span className="truncate">
                        {allVisibleSelected ? '取消当前' : '选当前'}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 min-w-0 rounded-lg px-2 text-xs sm:px-4 sm:text-sm"
                      disabled={selectedCount === 0 || isUpdatingManyCategories}
                      onClick={() => setBatchCategoryOpen(true)}
                    >
                      <Tag className="h-4 w-4 shrink-0" />
                      <span className="truncate">分类</span>
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-10 min-w-0 rounded-lg px-2 text-xs sm:px-4 sm:text-sm"
                      disabled={selectedCount === 0 || isDeletingMany}
                      onClick={() => setBatchDeleteOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">删除</span>
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
      </div>
    </AppScreen>
  );
}
