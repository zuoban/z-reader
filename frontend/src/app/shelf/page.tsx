'use client';

import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Filter,
  LogOut,
  Moon,
  Plus,
  SlidersHorizontal,
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
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_55%,transparent)] sm:h-11 sm:w-11">
        <BookOpen className="h-5 w-5 sm:h-5.5 sm:w-5.5" aria-hidden="true" />
      </div>
      <h1 className="truncate font-heading text-xl font-semibold text-foreground sm:text-2xl">
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
          className="paper-reveal shelf-header lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:w-[16.5rem] lg:shrink-0 lg:self-start lg:overflow-y-auto"
          style={delay(0)}
        >
          <div className="relative z-10 flex flex-col px-3 py-3 sm:px-5 sm:py-4 lg:px-4 lg:py-5">
            <div className="flex items-center justify-between gap-3 border-b border-border/25 pb-2.5 sm:pb-4 lg:block lg:border-border/35">
              <ShelfTitle />
              <p className="hidden text-xs leading-5 text-muted-foreground sm:mt-3 sm:block">
                管理藏书、分类和阅读偏好
              </p>
            </div>

            <nav
              className="mt-2 grid grid-cols-4 gap-1.5 sm:mt-4 sm:gap-2 lg:flex lg:flex-col lg:gap-1.5"
              aria-label="书架菜单"
            >
              <div className="hidden px-1 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground/70 uppercase lg:mb-1 lg:block">
                操作
              </div>
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
            </nav>

            {(!isLoadingBooks && books.length > 0) && (
              <div className="mt-2.5 border-t border-border/25 pt-2.5 lg:mt-5 lg:border-border/35 lg:pt-5">
                <div className="mb-3 hidden items-center gap-2 px-1 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground/70 uppercase lg:flex">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  浏览
                </div>
                <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:gap-3">
                  {categories.length > 0 && (
                    <div className="min-w-0 space-y-1.5">
                      <div className="hidden items-center gap-2 px-1 text-xs font-medium text-muted-foreground sm:flex">
                        <Filter className="h-3.5 w-3.5" />
                        分类
                      </div>
                      <CategoryFilter
                        categories={categories}
                        selectedCategoryId={selectedCategoryId}
                        onSelectCategory={setSelectedCategoryId}
                        bookCounts={bookCounts}
                        className="sm:w-full lg:w-full"
                      />
                    </div>
                  )}
                  <div className="min-w-0 space-y-1.5">
                    <div className="hidden items-center gap-2 px-1 text-xs font-medium text-muted-foreground sm:flex">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      排序
                    </div>
                    <SortSelector value={sortBy} onChange={setSortBy} className="sm:w-full lg:w-full" />
                  </div>
                </div>
              </div>
            )}
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
        )}
      </main>
      </div>
    </AppScreen>
  );
}
