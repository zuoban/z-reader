'use client';

import type { ReactNode } from 'react';
import { Button } from '@mantine/core';
import { AlertCircle, Search } from 'lucide-react';
import { LoadingSpinner } from '@/components/AppShell';
import { BookCardSkeletonGrid } from '@/components/BookCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { VirtualBookGrid } from '@/components/VirtualBookGrid';
import type { Book } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ShelfBookGridProps {
  books: Book[];
  filteredBooks: Book[];
  totalBookCount: number;
  selectedCategoryId: string | null;
  searchQuery: string;
  sortBy: string;
  resultsLabel: string;
  isFiltered: boolean;
  hasSearchQuery: boolean;
  isLoadingBooks: boolean;
  isSearching: boolean;
  searchError: string | null;
  hasMoreBooks: boolean;
  isLoadingMoreBooks: boolean;
  selectionMode: boolean;
  onRetrySearch: () => void;
  onClearFilters: () => void;
  onLoadMore: () => void | Promise<void>;
  onEndReached: () => void;
  getBookItemKey: (book: Book) => string;
  renderBookCard: (book: Book, index: number) => ReactNode;
}

export function ShelfBookGrid({
  books,
  filteredBooks,
  totalBookCount,
  selectedCategoryId,
  searchQuery,
  sortBy,
  resultsLabel,
  isFiltered,
  hasSearchQuery,
  isLoadingBooks,
  isSearching,
  searchError,
  hasMoreBooks,
  isLoadingMoreBooks,
  selectionMode,
  onRetrySearch,
  onClearFilters,
  onLoadMore,
  onEndReached,
  getBookItemKey,
  renderBookCard,
}: ShelfBookGridProps) {
  return (
    <section
      className={cn(
        'relative border-t border-border pt-4 sm:pt-5',
        selectionMode && filteredBooks.length > 0 && 'mb-44 sm:mb-28'
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
          action={
            <>
              <Button
                type="button"
                variant="filled"
                className="min-h-11 cursor-pointer rounded-lg"
                onClick={onRetrySearch}
              >
                重试搜索
              </Button>
              <Button
                type="button"
                variant="default"
                className="min-h-11 cursor-pointer rounded-lg"
                onClick={onClearFilters}
              >
                重置所有筛选
              </Button>
            </>
          }
        />
      ) : filteredBooks.length === 0 ? (
        <EmptyState
          icon={Search}
          title="未找到相关书籍"
          description={hasSearchQuery ? '换个关键词试试，或重置当前筛选。' : '当前分类没有书籍。'}
          action={
            <Button
              type="button"
              variant="default"
              className="min-h-11 cursor-pointer rounded-lg"
              onClick={onClearFilters}
            >
              重置所有筛选
            </Button>
          }
        />
      ) : (
        <div className="relative z-0">
          <VirtualBookGrid
            items={filteredBooks}
            resetKey={`${selectedCategoryId ?? 'all'}:${searchQuery}:${sortBy}`}
            canLoadMore={hasMoreBooks}
            isLoadingMore={isLoadingMoreBooks}
            onEndReached={onEndReached}
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
              onClick={() => void onLoadMore()}
            >
              加载更多图书
            </Button>
          )}
          {!isFiltered && (
            <p className="text-xs tabular-nums text-muted-foreground">
              已载入 {books.length}
              {totalBookCount > 0 ? ` / ${totalBookCount}` : ''} 本
            </p>
          )}
        </div>
      )}
    </section>
  );
}
