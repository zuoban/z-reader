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
        showCloseButton={false}
        className="mx-auto bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] left-3 right-3 flex max-h-[min(86svh,38rem)] flex-col rounded-3xl border border-border/65 bg-popover/98 p-0 shadow-[0_24px_70px_-40px_var(--paper-shadow),0_10px_32px_-28px_var(--paper-shadow-soft)] ring-1 ring-white/45 backdrop-blur-md dark:ring-white/10 sm:hidden"
      >
        <SheetHeader className="relative shrink-0 border-b border-border/55 bg-transparent px-5 pb-4 pt-5 pr-16 shadow-none">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/14 bg-primary/8 text-primary">
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-[19px] font-semibold tracking-tight">筛选与排序</SheetTitle>
              <SheetDescription className="mt-1 text-xs font-medium leading-5 text-muted-foreground">
                调整当前书架视图
              </SheetDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/62 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
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
                      'flex h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/56 px-3 text-left text-sm text-foreground/82 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_34%,transparent)] transition-colors hover:bg-muted/55',
                      active && 'border-primary/42 bg-primary/10 text-primary'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
                    <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/62">
                      {item.count}
                    </span>
                    <Check className={cn('h-4 w-4 text-primary', active ? 'opacity-100' : 'opacity-0')} />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
              <ArrowUpDown className="h-3.5 w-3.5" />
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
                      'flex h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/56 px-3 text-sm font-semibold text-foreground/78 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_34%,transparent)] transition-colors hover:bg-muted/55',
                      active && 'border-primary/42 bg-primary/10 text-primary'
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
