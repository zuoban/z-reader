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
      {/* 统一头部面板：标题 + 操作 */}
      <div
        className="paper-reveal shelf-header"
        style={delay(0)}
      >
        {/* 标题 + 操作按钮行 */}
        <div className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <ShelfTitle />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {user?.role === 'admin' && (
              <>
                <span className="shelf-tooltip" data-tooltip="用户管理">
                  <UserManager currentUser={user} buttonClassName="shelf-icon-btn" />
                </span>
                <span className="shelf-btn-divider" />
              </>
            )}
            <FileUploadAction
              accept={SUPPORTED_FORMATS_ACCEPT}
              onChange={handleUpload}
              disabled={isUploading}
              title="上传书籍"
              statusLabel={isUploading ? '上传中' : undefined}
              wrapperClassName="shelf-tooltip overflow-visible"
              buttonVariant="ghost"
              buttonSize="sm"
              buttonClassName={cn(
                'shelf-icon-btn',
                isUploading && 'bg-primary/10 text-primary opacity-100 hover:bg-primary/12'
              )}
            >
              {isUploading ? (
                <LoadingSpinner className="h-4 w-4 border-primary/25 shadow-none" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </FileUploadAction>

            <span className="shelf-btn-divider" />

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={isDark ? '切换亮色模式' : '切换暗色模式'}
              data-tooltip={isDark ? '切换亮色模式' : '切换暗色模式'}
              className="shelf-icon-btn shelf-tooltip cursor-pointer"
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            <span className="shelf-btn-divider" />

            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              aria-label="退出"
              data-tooltip="退出"
              className="shelf-icon-btn shelf-tooltip cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

      </div>

      <main className="flex-1 mt-6 sm:mt-8">
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
            <div className="relative z-10 border-b border-border/45 px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
              {categories.length > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 justify-start">
                    <CategoryFilter
                      categories={categories}
                      selectedCategoryId={selectedCategoryId}
                      onSelectCategory={setSelectedCategoryId}
                      bookCounts={bookCounts}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 justify-end">
                    <SortSelector value={sortBy} onChange={setSortBy} />
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <SortSelector value={sortBy} onChange={setSortBy} />
                </div>
              )}
            </div>

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
    </AppScreen>
  );
}
