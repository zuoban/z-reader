'use client';

import { useEffect, useRef } from 'react';
import { ActionIcon, Button, Menu } from '@mantine/core';
import { CheckSquare, MoreHorizontal, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UNCATEGORIZED_FILTER_ID } from './constants';

export interface ShelfCategoryBarProps {
  showCategoryFilters: boolean;
  showShelfControlsSkeleton: boolean;
  categories: string[];
  bookCounts: Record<string, number>;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  selectionMode: boolean;
  isBatchBusy: boolean;
  onOpenCategoryManager: () => void;
  onToggleSelectionMode: () => void;
}

export function ShelfCategoryBar({
  showCategoryFilters,
  showShelfControlsSkeleton,
  categories,
  bookCounts,
  selectedCategoryId,
  onSelectCategory,
  selectionMode,
  isBatchBusy,
  onOpenCategoryManager,
  onToggleSelectionMode,
}: ShelfCategoryBarProps) {
  const categoryStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = categoryStripRef.current;
    if (!showCategoryFilters || !strip) return;

    const updateOverflowHint = () => {
      strip.parentElement?.toggleAttribute('data-prev-categories', strip.scrollLeft > 1);
      strip.parentElement?.toggleAttribute(
        'data-more-categories',
        strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1
      );
    };

    const resizeObserver = new ResizeObserver(updateOverflowHint);
    resizeObserver.observe(strip);
    for (const chip of strip.children) resizeObserver.observe(chip);
    strip.addEventListener('scroll', updateOverflowHint, { passive: true });
    updateOverflowHint();

    return () => {
      resizeObserver.disconnect();
      strip.removeEventListener('scroll', updateOverflowHint);
    };
  }, [showCategoryFilters, categories, bookCounts]);

  if (showCategoryFilters) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-2 border-y border-border/80 py-2 sm:gap-3">
        <div className="shelf-category-strip relative min-w-0 flex-1">
          <div
            ref={categoryStripRef}
            role="group"
            aria-label="书籍分类筛选"
            className="scrollbar-none flex min-w-0 snap-x items-center gap-1 overflow-x-auto sm:flex-wrap sm:overflow-visible"
          >
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              aria-pressed={selectedCategoryId === null}
              data-active={selectedCategoryId === null}
              className="shelf-filter-chip snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              全部
            </button>
            {bookCounts[UNCATEGORIZED_FILTER_ID] > 0 && (
              <button
                type="button"
                onClick={() => onSelectCategory(UNCATEGORIZED_FILTER_ID)}
                aria-pressed={selectedCategoryId === UNCATEGORIZED_FILTER_ID}
                data-active={selectedCategoryId === UNCATEGORIZED_FILTER_ID}
                className="shelf-filter-chip snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                未分类
              </button>
            )}
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onSelectCategory(category)}
                aria-pressed={selectedCategoryId === category}
                data-active={selectedCategoryId === category}
                className="shelf-filter-chip max-w-[9rem] snap-start truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:max-w-[10rem]"
                title={category}
              >
                <span className="truncate">{category}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-1 border-l border-border pl-2 sm:flex">
          <Button
            type="button"
            variant="subtle"
            color="gray"
            size="xs"
            disabled={isBatchBusy}
            leftSection={<Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
            className="min-h-8 shrink-0 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-[0.98] motion-reduce:active:scale-100"
            onClick={onOpenCategoryManager}
          >
            管理
          </Button>
          <Button
            type="button"
            variant={selectionMode ? 'filled' : 'subtle'}
            color={selectionMode ? undefined : 'gray'}
            size="xs"
            disabled={isBatchBusy}
            leftSection={<CheckSquare className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />}
            className={cn(
              'min-h-8 shrink-0 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100',
              selectionMode
                ? 'bg-primary text-primary-foreground hover:bg-primary/92'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
            onClick={onToggleSelectionMode}
          >
            {selectionMode ? '取消选择' : '批量操作'}
          </Button>
        </div>
        <div className="shrink-0 sm:hidden">
          <Menu
            position="bottom-end"
            offset={6}
            width={184}
            radius="lg"
            shadow="md"
            zIndex={60}
            withinPortal
            classNames={{ item: 'shelf-settings-item' }}
          >
            <Menu.Target>
              <ActionIcon
                variant={selectionMode ? 'filled' : 'default'}
                size="md"
                disabled={isBatchBusy}
                aria-label="更多书库操作"
                title="更多书库操作"
                className={cn(
                  'flex h-11 w-11 min-h-0 min-w-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground transition-[background-color,color,border-color,transform] duration-150 hover:bg-secondary data-[expanded]:bg-secondary active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50',
                  selectionMode &&
                    'border-primary bg-primary text-primary-foreground hover:bg-primary/92 data-[expanded]:bg-primary'
                )}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown className="paper-menu max-w-[calc(100vw-1.5rem)] rounded-xl p-1.5">
              <Menu.Label className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground">
                书库操作
              </Menu.Label>
              <Menu.Item
                disabled={isBatchBusy}
                leftSection={<Settings2 strokeWidth={1.5} aria-hidden="true" />}
                onClick={onOpenCategoryManager}
              >
                管理分类
              </Menu.Item>
              <Menu.Item
                disabled={isBatchBusy}
                leftSection={<CheckSquare strokeWidth={1.5} aria-hidden="true" />}
                onClick={onToggleSelectionMode}
              >
                {selectionMode ? '取消选择' : '批量操作'}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
    );
  }

  if (showShelfControlsSkeleton) {
    return (
      <div
        className="flex min-w-0 items-center justify-between gap-2 border-y border-border/80 py-2 sm:gap-3"
        aria-hidden="true"
        data-testid="shelf-category-skeleton"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <div className="skeleton-shimmer h-11 w-14 shrink-0 rounded-lg bg-secondary/70 sm:h-8" />
          <div className="skeleton-shimmer h-11 w-16 shrink-0 rounded-lg bg-secondary/70 sm:h-8" />
          <div className="skeleton-shimmer h-11 w-20 shrink-0 rounded-lg bg-secondary/70 sm:h-8" />
        </div>
        <div className="hidden shrink-0 items-center gap-1 border-l border-border pl-2 sm:flex">
          <div className="skeleton-shimmer h-8 w-16 rounded-lg bg-secondary/70" />
          <div className="skeleton-shimmer h-8 w-20 rounded-lg bg-secondary/70" />
        </div>
        <div className="shrink-0 sm:hidden">
          <div className="skeleton-shimmer h-11 w-11 rounded-lg bg-secondary/70" />
        </div>
      </div>
    );
  }

  return null;
}
