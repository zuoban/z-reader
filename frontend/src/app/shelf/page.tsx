'use client';

import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  LogOut,
  Moon,
  Plus,
  Sun,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useShelfData } from '@/hooks/useShelfData';
import { useShelfTheme } from '@/hooks/useShelfTheme';
import { AppScreen, LoadingSpinner } from '@/components/AppShell';
import { BookCard } from '@/components/BookCard';
import { BookCardSkeletonGrid } from '@/components/BookCardSkeleton';
import { CategoryFilter } from '@/components/CategoryFilter';
import { EmptyState } from '@/components/EmptyState';
import { FileUploadAction } from '@/components/FileUploadAction';
import { SortSelector } from '@/components/SortSelector';
import { UserManager } from '@/components/UserManager';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SUPPORTED_FORMATS_ACCEPT = '.epub,.mobi,.azw3,.pdf,application/pdf';
const SHELF_TITLE = '我的书架';

function delay(ms: number): CSSProperties {
  return { '--paper-delay': `${ms}ms` } as CSSProperties;
}

function ShelfTitle() {
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_55%,transparent)] sm:h-12 sm:w-12">
        <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
      </div>
      <h1 className="truncate font-heading text-2xl font-semibold text-foreground sm:text-3xl lg:text-2xl">
        {SHELF_TITLE}
      </h1>
    </div>
  );
}

export default function ShelfPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, user, logout } = useAuth();
  const { toggleTheme, isDark } = useShelfTheme();
  const {
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
  } = useShelfData(isAuthenticated);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

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
          className="paper-reveal shelf-header lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:w-[18rem] lg:shrink-0 lg:self-start lg:overflow-y-auto"
          style={delay(0)}
        >
          <div className="relative z-10 flex flex-col px-3.5 py-3.5 sm:px-5 sm:py-5 lg:px-4 lg:py-5">
            <div className="flex items-center justify-between gap-3 border-b border-border/25 pb-3.5 sm:pb-4 lg:block lg:border-border/35">
              <ShelfTitle />
              <p className="hidden text-sm leading-6 text-muted-foreground sm:mt-3 sm:block lg:text-xs lg:leading-5">
                管理藏书、分类和阅读偏好
              </p>
            </div>

            <nav
              className="mt-3 lg:mt-4"
              aria-label="书架菜单"
            >
              <div className="hidden px-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground/70 uppercase mb-1 lg:block">
                操作
              </div>
              {/* Mobile: compact icon row */}
              <div className="grid grid-cols-4 gap-2 lg:hidden">
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
                  statusLabel={isUploading ? '上传中' : undefined}
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
                  <span className="hidden">{isUploading ? '上传中' : '上传书籍'}</span>
                </FileUploadAction>

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
              <div className="hidden grid-cols-2 gap-2 sm:grid sm:grid-cols-4 lg:flex lg:flex-col lg:gap-1.5">
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
                  statusLabel={isUploading ? '上传中' : undefined}
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
                  <span>{isUploading ? '上传中' : '上传书籍'}</span>
                </FileUploadAction>

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

      <main className="min-w-0 flex-1">
        {!isLoadingBooks && books.length === 0 ? (
          <div className="paper-reveal" style={delay(120)}>
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
                  wrapperClassName="w-full sm:w-auto"
                  buttonClassName="h-12 w-full rounded-2xl border border-primary/15 bg-primary px-8 text-sm font-semibold tracking-[0.04em] text-primary-foreground transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-primary/92 active:scale-[0.985] sm:w-auto sm:px-10"
                >
                  {isUploading ? (
                    <>
                      <LoadingSpinner inverted className="mr-2.5 h-4 w-4 border-background/30" />
                      添加中...
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
                  {/* Mobile: compact labeled controls */}
                  {categories.length > 0 && (
                    <div className="flex w-full min-w-0 items-center gap-2 sm:hidden">
                      <CategoryFilter
                        categories={categories}
                        selectedCategoryId={selectedCategoryId}
                        onSelectCategory={setSelectedCategoryId}
                        bookCounts={bookCounts}
                        className="h-11 min-w-0 flex-1 rounded-full"
                      />
                      <SortSelector
                        value={sortBy}
                        onChange={setSortBy}
                        className="h-11 min-w-0 flex-1 rounded-full"
                      />
                    </div>
                  )}
                  {categories.length === 0 && (
                    <div className="flex w-full min-w-0 items-center gap-2 sm:hidden">
                      <SortSelector
                        value={sortBy}
                        onChange={setSortBy}
                        className="h-11 min-w-0 flex-1 rounded-full"
                      />
                    </div>
                  )}
                  {/* Desktop: full dropdowns */}
                  <div className="hidden w-full flex-row items-center gap-2 sm:flex">
                    {categories.length > 0 && (
                      <CategoryFilter
                        categories={categories}
                        selectedCategoryId={selectedCategoryId}
                        onSelectCategory={setSelectedCategoryId}
                        bookCounts={bookCounts}
                        className="sm:w-[13rem]"
                      />
                    )}
                    <SortSelector value={sortBy} onChange={setSortBy} className="sm:w-[13rem]" />
                  </div>
                </div>
              </div>
            )}
            <section
              className="paper-reveal shelf-container relative rounded-2xl"
              style={delay(150)}
            >
              {isLoadingBooks ? (
                <div className="px-3 py-5 sm:px-6 sm:py-8 lg:px-7 lg:py-9">
                  <BookCardSkeletonGrid count={6} />
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
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      </div>
    </AppScreen>
  );
}
