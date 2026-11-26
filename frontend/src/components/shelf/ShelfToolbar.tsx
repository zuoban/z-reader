'use client';

import { useEffect, useRef } from 'react';
import { ActionIcon, TextInput } from '@mantine/core';
import { Loader2, Search, X } from 'lucide-react';
import { SortSelector } from '@/components/SortSelector';
import type { SortOption } from '@/hooks/useShelfData';

const OPEN_DIALOG_SELECTOR = [
  '[role="dialog"]:not([aria-hidden="true"]):not([hidden])',
  '[role="alertdialog"]:not([aria-hidden="true"]):not([hidden])',
].join(', ');

function hasOpenDialog(): boolean {
  const dialogs = document.querySelectorAll<HTMLElement>(OPEN_DIALOG_SELECTOR);
  for (const dialog of dialogs) {
    if (dialog.closest('[aria-hidden="true"], [hidden], [data-hidden="true"]')) {
      continue;
    }
    return true;
  }
  return false;
}

export interface ShelfToolbarProps {
  isOffline: boolean;
  isLoadingBooks: boolean;
  loadError: string | null;
  totalBookCount: number;
  filteredBookCount: number;
  selectedCategoryId: string | null;
  hasSearchQuery: boolean;
  showCategoryFilters: boolean;
  showShelfControlsSkeleton: boolean;
  searchQuery: string;
  isSearching: boolean;
  onSearchQueryChange: (value: string) => void;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
}

export function ShelfToolbar({
  isOffline,
  isLoadingBooks,
  loadError,
  totalBookCount,
  filteredBookCount,
  selectedCategoryId,
  hasSearchQuery,
  showCategoryFilters,
  showShelfControlsSkeleton,
  searchQuery,
  isSearching,
  onSearchQueryChange,
  sortBy,
  onSortChange,
}: ShelfToolbarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showCategoryFilters) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;

      const isSlashShortcut =
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
      const isCommandKShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === 'k' || event.key === 'K');

      if (!isSlashShortcut && !isCommandKShortcut) return;

      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.matches('input, textarea, select') ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (hasOpenDialog()) return;

      const input = searchInputRef.current;
      if (!input) return;

      event.preventDefault();
      input.focus();
      input.select();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCategoryFilters]);

  return (
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-heading text-2xl font-normal leading-tight tracking-[-0.02em] text-foreground sm:text-[28px]">
          我的书库
        </h1>
        {!isOffline && !isLoadingBooks && !loadError && (
          <p
            className="inline-flex shrink-0 items-baseline gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground shadow-2xs"
            aria-label={`藏书共 ${totalBookCount} 本`}
          >
            <span>{totalBookCount} 本</span>
            {(selectedCategoryId !== null || hasSearchQuery) && (
              <span className="text-primary font-medium">· 显示 {filteredBookCount} 本</span>
            )}
          </p>
        )}
      </div>

      {showCategoryFilters ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1 sm:w-56 lg:w-72">
            <TextInput
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !event.nativeEvent.isComposing && searchQuery) {
                  event.preventDefault();
                  onSearchQueryChange('');
                }
              }}
              placeholder="搜索书名或作者"
              aria-label="搜索书库"
              leftSection={
                isSearching ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ) : (
                  <Search
                    className="h-4 w-4 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )
              }
              leftSectionPointerEvents="none"
              leftSectionWidth={36}
              rightSection={
                searchQuery ? (
                  <ActionIcon
                    type="button"
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={() => {
                      onSearchQueryChange('');
                      searchInputRef.current?.focus();
                    }}
                    aria-label="清除搜索"
                    title="清除搜索"
                    className="size-9 min-h-0 min-w-0 cursor-pointer rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary/70 hover:text-foreground active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:size-7"
                  >
                    <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  </ActionIcon>
                ) : (
                  <kbd
                    aria-hidden="true"
                    className="pointer-events-none hidden size-5 items-center justify-center rounded border border-border bg-surface-subtle font-mono text-[11px] font-medium text-muted-foreground sm:inline-flex"
                  >
                    /
                  </kbd>
                )
              }
              rightSectionPointerEvents={searchQuery ? 'all' : 'none'}
              rightSectionWidth={36}
              classNames={{
                input: 'shelf-search app-field pl-9 pr-9 sm:h-9 sm:text-sm',
              }}
            />
          </div>

          <div className="w-11 shrink-0 sm:w-36">
            <SortSelector value={sortBy} onChange={onSortChange} className="sm:h-9" />
          </div>
        </div>
      ) : showShelfControlsSkeleton ? (
        <div
          className="flex min-w-0 items-center gap-2"
          aria-hidden="true"
          data-testid="shelf-controls-skeleton"
        >
          <div className="skeleton-shimmer h-11 min-w-0 flex-1 rounded-lg bg-secondary/70 sm:h-9 sm:w-56 lg:w-72" />
          <div className="skeleton-shimmer h-11 w-11 shrink-0 rounded-lg bg-secondary/70 sm:h-9 sm:w-36" />
        </div>
      ) : null}
    </div>
  );
}
