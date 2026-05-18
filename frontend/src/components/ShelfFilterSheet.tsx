'use client';

import { ArrowUpDown, Check, SlidersHorizontal, Tag, X } from 'lucide-react';
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
            variant="outline"
            className="h-11 w-full justify-between rounded-xl px-4 text-sm font-semibold sm:hidden"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <span className="truncate">
            {currentCategory.label} · {currentSort?.label ?? '排序'}
          </span>
        </span>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex max-h-[min(86svh,38rem)] flex-col rounded-[2.25rem] border border-border/40 bg-popover/80 p-0 shadow-2xl backdrop-blur-xl sm:hidden"
      >
        <SheetHeader className="relative shrink-0 border-b border-border/10 px-6 pb-5 pt-7">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-xl font-bold tracking-tight">筛选与排序</SheetTitle>
              <SheetDescription className="mt-0.5 text-[13px] font-medium opacity-60">
                调整当前书架视图
              </SheetDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </SheetHeader>

        <div className="min-h-0 space-y-6 overflow-y-auto px-6 py-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
              <Tag className="h-4 w-4" />
              分类
            </div>
            <div className="grid gap-2.5">
              {categoryItems.map((item) => {
                const active = currentCategoryId === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectCategory(item.id)}
                    className={cn(
                      'flex h-13 items-center gap-4 rounded-2xl border border-border/40 bg-background/40 px-4 text-left text-[15px] transition-all active:scale-[0.98]',
                      active && 'border-primary/20 bg-primary/5 text-primary'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
                    <span className="rounded-lg bg-secondary px-2 py-1 text-[12px] font-bold tabular-nums text-muted-foreground">
                      {item.count}
                    </span>
                    <Check className={cn('h-5 w-5 text-primary', active ? 'opacity-100' : 'opacity-0')} />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
              <ArrowUpDown className="h-4 w-4" />
              排序方式
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {SORT_OPTIONS.map((option) => {
                const active = sortBy === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectSort(option.value)}
                    className={cn(
                      'flex h-13 items-center justify-center gap-2 rounded-2xl border border-border/40 bg-background/40 px-4 text-[14px] font-semibold transition-all active:scale-[0.98]',
                      active && 'border-primary/20 bg-primary/5 text-primary'
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
