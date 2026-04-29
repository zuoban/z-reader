'use client';

import { Tag } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
  const selectedItem = filterItems.find((item) => item.id === value) ?? filterItems[0];

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
          'group relative flex h-11 w-full max-w-full items-center justify-center gap-2 rounded-xl border border-primary/16 bg-card/92 px-11 text-sm text-foreground/82 shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_70%,transparent)_inset,0_8px_18px_-16px_var(--paper-shadow-soft)] transition-all duration-200 hover:border-primary/30 hover:bg-card hover:text-foreground hover:shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_76%,transparent)_inset,0_12px_24px_-18px_var(--paper-shadow)] focus:outline-none focus-visible:border-primary/38 focus-visible:ring-2 focus-visible:ring-primary/18 focus-visible:ring-offset-0 data-[state=open]:border-primary/34 data-[state=open]:bg-[var(--shelf-surface-selected)] data-[state=open]:text-foreground data-[state=open]:shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_80%,transparent)_inset,0_14px_28px_-20px_var(--paper-shadow)] data-[state=open]:[&>svg:last-child]:rotate-180 data-[state=open]:[&>svg:last-child]:text-primary/70 sm:w-[11rem] [&>svg:last-child]:absolute [&>svg:last-child]:right-4 [&>svg:last-child]:shrink-0 [&>svg:last-child]:text-primary/40 [&>svg:last-child]:opacity-100 [&>svg:last-child]:transition-all [&>svg:last-child]:duration-200 [&>svg:last-child]:group-hover:text-primary/60',
          mobileIconOnly && 'sm:hidden w-11 justify-center px-0 [&>span]:hidden [&>svg:last-child]:hidden',
          !mobileIconOnly && '[&>span]:min-w-0 [&>span]:truncate [&>span]:text-center [&>span]:font-medium',
          className
        )}
      >
        <Tag className="absolute left-4 h-4 w-4 shrink-0 text-primary/60 transition-colors group-hover:text-primary/80" />
        {!mobileIconOnly && (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="truncate">{selectedItem.label}</span>
            {selectedItem.count > 0 && (
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-foreground/10 px-1.5 text-[11px] font-semibold leading-none text-foreground/78 tabular-nums">
                {selectedItem.count}
              </span>
            )}
          </span>
        )}
      </SelectTrigger>
      <SelectContent
        align="start"
        className="min-w-[12rem] rounded-lg border border-primary/16 bg-[var(--shelf-surface-raised)] p-1.5 shadow-[0_18px_44px_-24px_var(--paper-shadow),0_6px_16px_-10px_var(--paper-shadow-soft)] ring-1 ring-white/50 dark:ring-white/10"
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
              'cursor-pointer rounded-md px-3 py-2 text-sm focus:bg-[var(--shelf-surface-selected)] focus:text-foreground',
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
