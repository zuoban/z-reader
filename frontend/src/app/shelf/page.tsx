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
import { AppScreen, BrandMark, LoadingSpinner } from '@/components/AppShell';
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

function delay(ms: number): CSSProperties {
  return { '--paper-delay': `${ms}ms` } as CSSProperties;
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
      {/* 统一头部面板：品牌 + 操作 */}
      <div
        className="paper-reveal shelf-header rounded-2xl overflow-hidden"
        style={delay(0)}
      >
        {/* 品牌 + 操作按钮行 */}
        <div className="flex items-center justify-between px-3 py-2.5 sm:px-5 sm:py-3.5">
          <div className="min-w-0 flex-1">
            <BrandMark size="sm" className="hidden sm:block" priority />
            <BrandMark size="sm" className="w-[120px] sm:hidden" priority />
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {user?.role === 'admin' && (
              <UserManager currentUser={user} buttonClassName="shelf-icon-btn h-8 w-8 sm:h-9 sm:w-9" />
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
                'shelf-icon-btn h-8 w-8 sm:h-9 sm:w-9',
                isUploading && 'bg-primary/10 text-primary opacity-100 hover:bg-primary/12'
              )}
            >
              {isUploading ? (
                <LoadingSpinner className="h-4 w-4 border-primary/25 shadow-none" />
              ) : (
                <Upload className="h-[16px] w-[16px] sm:h-[18px] sm:w-[18px]" />
              )}
            </FileUploadAction>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              title={isDark ? '切换亮色模式' : '切换暗色模式'}
              className="shelf-icon-btn h-8 w-8 sm:h-9 sm:w-9 cursor-pointer"
            >
              {isDark ? (
                <Sun className="h-[16px] w-[16px] sm:h-[18px] sm:w-[18px]" />
              ) : (
                <Moon className="h-[16px] w-[16px] sm:h-[18px] sm:w-[18px]" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              title="退出"
              className="shelf-icon-btn h-8 w-8 sm:h-9 sm:w-9 cursor-pointer"
            >
              <LogOut className="h-[16px] w-[16px] sm:h-[18px] sm:w-[18px]" />
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
            <div className="relative z-10 border-b border-border/45 px-3 py-3 sm:px-6 sm:py-4 lg:px-7">
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
              <div className="relative z-0 grid grid-cols-2 gap-x-3 gap-y-6 px-3 py-5 sm:grid-cols-[repeat(auto-fill,minmax(186px,1fr))] sm:gap-x-7 sm:gap-y-10 sm:px-6 sm:py-8 lg:grid-cols-[repeat(auto-fill,minmax(204px,1fr))] lg:gap-x-8 lg:gap-y-12 lg:px-7 lg:py-9">
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
