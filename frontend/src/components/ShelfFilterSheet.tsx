'use client';

import { Check, SlidersHorizontal, Tag } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SORT_OPTIONS, SortOption } from '@/hooks/useShelfData';
import { cn } from '@/lib/utils';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const ALL_FILTER_ID = 'all';

interface ShelfFilterSheetProps {
  categories: string[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  bookCounts: Record<string, number>;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
}

export function ShelfFilterSheet({
  categories,
  selectedCategoryId,
  onSelectCategory,
  bookCounts,
  sortBy,
  onSortChange,
}: ShelfFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const categoryItems = [
    { id: ALL_FILTER_ID, label: '全部', count: bookCounts.all ?? 0 },
    {
      id: UNCATEGORIZED_FILTER_ID,
      label: '未分类',
      count: bookCounts[UNCATEGORIZED_FILTER_ID] ?? 0,
    },
    ...categories
      .map((category) => ({
        id: category,
        label: category,
        count: bookCounts[category] || 0,
      }))
      .filter((item) => item.count > 0),
  ];
  const currentCategoryId = selectedCategoryId ?? ALL_FILTER_ID;
  const currentCategory =
    categoryItems.find((item) => item.id === currentCategoryId) ?? categoryItems[0];
  const currentSort = SORT_OPTIONS.find((option) => option.value === sortBy);

  function selectCategory(id: string) {
    onSelectCategory(id === ALL_FILTER_ID ? null : id);
    setOpen(false);
  }

  function selectSort(value: SortOption) {
    onSortChange(value);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="shelf-filter-trigger h-11 w-full justify-between rounded-xl px-4 text-sm font-semibold sm:hidden"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary/70" />
          <span className="truncate">
            {currentCategory.label} · {currentSort?.label ?? '排序'}
          </span>
        </span>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="app-sheet-shell mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 max-h-[min(90svh,38rem)] rounded-[1.75rem] border p-0 sm:hidden"
      >
        <SheetHeader className="app-sheet-header px-6 pb-5 pt-7 pr-20">
          <div className="flex items-center gap-4">
            <div className="app-sheet-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-xl font-semibold tracking-tight">筛选与排序</SheetTitle>
              <SheetDescription className="mt-1 text-xs font-medium text-muted-foreground">
                调整当前书架视图
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="app-sheet-body space-y-6 px-6 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              分类
            </div>
            <div className="grid gap-2">
              {categoryItems.map((item) => {
                const active = currentCategoryId === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectCategory(item.id)}
                    className={cn(
                      'category-chip flex h-12 items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors',
                      active && 'category-chip-active'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                    <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/70">
                      {item.count}
                    </span>
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              排序
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SORT_OPTIONS.map((option) => {
                const active = sortBy === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectSort(option.value)}
                    className={cn(
                      'category-chip flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors',
                      active && 'category-chip-active'
                    )}
                  >
                    {option.label}
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
