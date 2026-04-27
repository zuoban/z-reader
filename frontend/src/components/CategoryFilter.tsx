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
}

export function CategoryFilter({
  categories,
  selectedCategoryId,
  onSelectCategory,
  bookCounts,
  className,
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
          'grid h-11 w-full sm:w-[13.75rem] max-w-full grid-cols-[1.25rem_1fr_1.25rem] items-center gap-2 rounded-full border border-primary/14 bg-[var(--shelf-surface-raised)] px-4 text-[13px] font-semibold text-foreground shadow-[0_10px_24px_-20px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_80%,transparent)]',
          'hover:border-primary/24 hover:bg-[var(--shelf-surface-raised)]',
          'focus:ring-2 focus:ring-primary/15 [&>span]:justify-self-center [&>span]:text-center [&>svg:last-child]:h-4 [&>svg:last-child]:w-4 [&>svg:last-child]:justify-self-end [&>svg:last-child]:opacity-55',
          className
        )}
        style={{ backgroundColor: 'var(--shelf-surface-raised)' }}
      >
        <Tag className="h-4 w-4 shrink-0 opacity-65" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="start"
        className="min-w-[12rem] rounded-[1.25rem] border border-primary/12 bg-[var(--shelf-surface-raised)] p-1.5 shadow-[0_22px_54px_-34px_var(--paper-shadow),0_8px_24px_-22px_var(--paper-shadow-soft),inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_78%,transparent)] ring-1 ring-primary/8"
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
              'cursor-pointer rounded-[1.15rem] py-2 pl-3 pr-8 text-sm focus:bg-[var(--shelf-surface-selected)] focus:text-foreground',
              value === item.id
                ? 'bg-[var(--shelf-surface-selected)] font-semibold text-foreground'
                : 'text-foreground/62 hover:bg-[var(--shelf-surface-hover)] hover:text-foreground'
            )}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="min-w-0 truncate">{truncateLabel(item.label)}</span>
              {item.count > 0 && (
                <span
                  className={cn(
                    'ml-auto inline-flex min-w-[1.45rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
                    value === item.id
                      ? 'bg-foreground text-background'
                      : 'bg-primary/10 text-primary/78'
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
