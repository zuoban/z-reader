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
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full justify-between rounded-xl border border-primary/16 bg-card/92 px-4 text-sm font-semibold text-foreground/82 shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_70%,transparent)_inset,0_8px_18px_-16px_var(--paper-shadow-soft)] transition-all duration-200 hover:border-primary/30 hover:bg-card hover:text-foreground hover:shadow-[0_1px_0_color-mix(in_srgb,var(--paper-edge)_76%,transparent)_inset,0_12px_24px_-18px_var(--paper-shadow)] focus-visible:border-primary/38 focus-visible:ring-2 focus-visible:ring-primary/18 focus-visible:ring-offset-0 sm:hidden"
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

      <SheetContent side="bottom" className="sm:hidden">
        <SheetHeader>
          <SheetTitle>筛选与排序</SheetTitle>
          <SheetDescription>调整当前书架视图</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
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
                      'flex h-12 items-center gap-3 rounded-xl border px-3 text-left text-sm transition-colors',
                      active
                        ? 'border-primary/24 bg-[var(--shelf-surface-selected)] text-foreground'
                        : 'border-border/55 bg-card/70 text-foreground/72 hover:bg-[var(--shelf-surface-hover)]'
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
                    onClick={() => onSortChange(option.value)}
                    className={cn(
                      'flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary/24 bg-[var(--shelf-surface-selected)] text-foreground'
                        : 'border-border/55 bg-card/70 text-foreground/72 hover:bg-[var(--shelf-surface-hover)]'
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
