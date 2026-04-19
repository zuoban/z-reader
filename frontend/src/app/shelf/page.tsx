'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  ChevronDown,
  Library,
  LogOut,
  Moon,
  Plus,
  Sun,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useShelfData } from '@/hooks/useShelfData';
import { useShelfTheme } from '@/hooks/useShelfTheme';
import { Category } from '@/lib/api';
import { AppScreen, BrandMark, LoadingSpinner } from '@/components/AppShell';
import { BookCard } from '@/components/BookCard';
import { BookCardSkeletonGrid } from '@/components/BookCardSkeleton';
import { CategoryManager } from '@/components/CategoryManager';
import { EmptyState } from '@/components/EmptyState';
import { FileUploadAction } from '@/components/FileUploadAction';
import { SortSelector } from '@/components/SortSelector';
import { UserManager } from '@/components/UserManager';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SUPPORTED_FORMATS_ACCEPT = '.epub,.mobi,.azw3,.pdf,application/pdf';
const HEADER_ICON_BUTTON_CLASS =
  'h-8 w-8 shrink-0 rounded-none border-transparent bg-transparent p-0 text-foreground ' +
  'shadow-none hover:bg-transparent hover:opacity-70 sm:h-9 sm:w-9';
const HEADER_FILTER_TRIGGER_CLASS =
  'group relative flex h-8 items-center gap-1.5 whitespace-nowrap rounded-none px-1 ' +
  'text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function CategoryDropdown({
  categories,
  selectedCategoryId,
  onSelectCategory,
  bookCounts,
}: {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  bookCounts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)
    : null;

  const getDisplayText = () => {
    if (!selectedCategoryId) return '全部';
    if (selectedCategory) return selectedCategory.name;
    return '未分类';
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          HEADER_FILTER_TRIGGER_CLASS,
          open
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={cn(
            'h-2 w-2 rounded-full bg-muted-foreground/60 transition-colors',
            open && 'bg-foreground'
          )}
        />
        <span className={cn(open && 'font-semibold')}>{getDisplayText()}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 opacity-60 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px] p-1">
        <DropdownMenuItem
          onClick={() => {
            onSelectCategory(null);
            setOpen(false);
          }}
          className={cn(
            'cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors',
            selectedCategoryId === null
              ? 'bg-muted/80 font-semibold text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          <span className="flex-1">全部</span>
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
            {bookCounts.all}
          </span>
        </DropdownMenuItem>
        {categories
          .filter((category) => (bookCounts[category.id] || 0) > 0)
          .map((category) => (
            <DropdownMenuItem
              key={category.id}
              onClick={() => {
                onSelectCategory(category.id);
                setOpen(false);
              }}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors',
                selectedCategoryId === category.id
                  ? 'bg-muted/80 font-semibold text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <span
                className="mr-2 h-2 w-2 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="flex-1">{category.name}</span>
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                {bookCounts[category.id] || 0}
              </span>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ShelfPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, user, logout } = useAuth();
  const { toggleTheme, isDark } = useShelfTheme();
  const {
    books,
    categories,
    isLoadingBooks,
    selectedCategoryId,
    setSelectedCategoryId,
    isUploading,
    deletingId,
    filteredBooks,
    bookCounts,
    loadBooks,
    loadCategories,
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
      contentClassName="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-2.5 sm:px-7 sm:py-6 lg:px-10 lg:py-8"
    >
      <header className="rounded-[20px] border border-border/35 bg-background/68 px-4 py-3.5 shadow-[0_14px_32px_-34px_rgba(15,23,42,0.26)] backdrop-blur-lg sm:rounded-[24px] sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <BrandMark size="md" className="hidden sm:block" priority />
            <BrandMark size="sm" className="sm:hidden" priority />
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <CategoryManager onCategoryChange={loadCategories} />
            {user?.role === 'admin' && (
              <UserManager currentUser={user} buttonClassName={HEADER_ICON_BUTTON_CLASS} />
            )}
            <FileUploadAction
              accept={SUPPORTED_FORMATS_ACCEPT}
              onChange={handleUpload}
              disabled={isUploading}
              title="上传书籍"
              buttonVariant="ghost"
              buttonSize="sm"
              buttonClassName={HEADER_ICON_BUTTON_CLASS}
            >
              {isUploading ? (
                <LoadingSpinner className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              )}
            </FileUploadAction>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              title={isDark ? '切换亮色模式' : '切换暗色模式'}
              className={cn(HEADER_ICON_BUTTON_CLASS, 'cursor-pointer')}
            >
              {isDark ? (
                <Sun className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              ) : (
                <Moon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              title="退出"
              className={cn(HEADER_ICON_BUTTON_CLASS, 'cursor-pointer')}
            >
              <LogOut className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </Button>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 text-[12px] leading-5 text-muted-foreground sm:mt-3 sm:text-[13px]">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-1 py-0.5 text-[12px] font-semibold leading-5 text-foreground sm:text-[13px]">
              <Library className="h-3.5 w-3.5" />
              我的书架
            </span>
            <span className="font-medium tabular-nums text-muted-foreground/80">
              共 {books.length} 本书
            </span>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <SortSelector value={sortBy} onChange={setSortBy} />
              <CategoryDropdown
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={setSelectedCategoryId}
                bookCounts={bookCounts}
              />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 py-4 sm:py-8">
        {!isLoadingBooks && books.length === 0 ? (
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
                buttonClassName="h-12 w-full rounded-xl bg-foreground px-8 text-sm font-medium text-background shadow-[0_12px_32px_-16px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-foreground/92 hover:shadow-[0_16px_40px_-20px_rgba(15,23,42,0.5)] active:scale-[0.98] sm:w-auto sm:px-10"
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
        ) : (
          <section className="relative isolate">
            {isLoadingBooks ? (
              <BookCardSkeletonGrid count={6} />
            ) : (
              <div className="relative z-0 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-x-5 sm:gap-y-6 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] lg:gap-x-6 lg:gap-y-7">
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
