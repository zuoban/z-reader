'use client';

import { Tag } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const ALL_FILTER_ID = 'all';
const MAX_CATEGORY_LABEL_LENGTH = 12;

function truncateLabel(label: string) {
  return label.length > MAX_CATEGORY_LABEL_LENGTH
    ? `${label.slice(0, MAX_CATEGORY_LABEL_LENGTH)}...`
    : label;
}

interface CategoryFilterProps {
  categories: string[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  bookCounts: Record<string, number>;
  className?: string;
  mobileIconOnly?: boolean;
}

export function CategoryFilter({
  categories,
  selectedCategoryId,
  onSelectCategory,
  bookCounts,
  className,
  mobileIconOnly,
}: CategoryFilterProps) {
  const totalBooks = bookCounts.all ?? 0;
  const uncategorizedBooks = bookCounts[UNCATEGORIZED_FILTER_ID] ?? 0;

  const filterItems = [
    {
      id: ALL_FILTER_ID,
      label: '全部',
      count: totalBooks,
    },
    {
      id: UNCATEGORIZED_FILTER_ID,
      label: '未分类',
      count: uncategorizedBooks,
    },
    ...categories
      .map((category) => ({
        id: category,
        label: category,
        count: bookCounts[category] || 0,
      }))
      .filter((item) => item.count > 0),
  ];
  const value = selectedCategoryId ?? ALL_FILTER_ID;

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        onSelectCategory(nextValue === ALL_FILTER_ID ? null : nextValue);
      }}
    >
      <SelectTrigger
        aria-label="书籍分类筛选"
        className={cn(
          'group relative flex h-9 w-full max-w-full items-center gap-2 rounded-xl border border-primary/12 bg-shelf-surface-soft px-3 text-sm text-foreground/80 transition-all duration-200 hover:border-primary/22 hover:bg-shelf-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 sm:w-[11rem]',
          mobileIconOnly && 'sm:hidden w-9 justify-center px-0 [&>span]:hidden [&>svg:last-child]:hidden',
          !mobileIconOnly && '[&>span]:truncate [&>span]:text-left [&>span]:font-medium',
          className
        )}
      >
        <Tag className="h-4 w-4 shrink-0 text-primary/60 transition-colors group-hover:text-primary/80" />
        {!mobileIconOnly && <SelectValue />}
      </SelectTrigger>
      <SelectContent
        align="start"
        className="min-w-[12rem] rounded-xl border border-primary/14 bg-[var(--shelf-surface-raised)] p-1.5 shadow-[0_10px_30px_-16px_var(--paper-shadow),0_4px_12px_-8px_var(--paper-shadow-soft)] ring-1 ring-primary/6"
        style={{
          backgroundColor: 'var(--shelf-surface-raised)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
      >
        {filterItems.map((item) => (
          <SelectItem
            key={item.id}
            value={item.id}
            className={cn(
              'cursor-pointer rounded-lg px-3 py-2 text-sm focus:bg-[var(--shelf-surface-selected)] focus:text-foreground',
              value === item.id
                ? 'bg-[var(--shelf-surface-selected)] font-medium text-foreground'
                : 'text-foreground/62 hover:bg-[var(--shelf-surface-hover)] hover:text-foreground'
            )}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="min-w-0 truncate">{truncateLabel(item.label)}</span>
              {item.count > 0 && (
                <span
                  className={cn(
                    'ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold leading-none tabular-nums',
                    value === item.id
                      ? 'bg-foreground/15 text-foreground'
                      : 'bg-primary/8 text-primary/70'
                  )}
                >
                  {item.count}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
