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
    ...[
      {
        id: UNCATEGORIZED_FILTER_ID,
        label: '未分类',
        count: uncategorizedBooks,
      },
      ...categories.map((category) => ({
        id: category,
        label: category,
        count: bookCounts[category] || 0,
      })),
    ].filter((item) => item.count > 0),
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
          'group relative flex h-9 w-full max-w-full items-center justify-center gap-2 rounded-md border border-border/40 bg-background px-9 text-sm transition-all hover:border-border/60 hover:bg-background/80 focus:ring-0 [&>svg:last-child]:absolute [&>svg:last-child]:right-3',
          mobileIconOnly && 'sm:hidden w-9 justify-center px-0 [&>span]:hidden [&>svg:last-child]:hidden',
          !mobileIconOnly && '[&>span]:min-w-0 [&>span]:truncate [&>span]:text-center [&>span]:font-medium',
          className
        )}
      >
        <Tag className="absolute left-3 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
        className="min-w-[12rem] rounded-md border border-border/40 bg-background p-1 shadow-sm"
      >
        {filterItems.map((item) => (
          <SelectItem
            key={item.id}
            value={item.id}
            className={cn(
              'cursor-pointer rounded-sm px-3 py-2 text-sm focus:bg-secondary focus:text-foreground',
              value === item.id
                ? 'bg-secondary font-medium text-foreground'
                : 'text-foreground/80 hover:bg-secondary hover:text-foreground'
            )}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              {item.count > 0 && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold leading-none tabular-nums',
                    value === item.id
                      ? 'bg-foreground/15 text-foreground'
                      : 'bg-primary/8 text-primary/70'
                  )}
                >
                  {item.count}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{truncateLabel(item.label)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
