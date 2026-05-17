'use client';

import { useState } from 'react';
import { Check, Pencil, Tag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface CategoryManagerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  bookCounts: Record<string, number>;
  loading?: boolean;
  onRenameCategory: (category: string, nextCategory: string | null) => void | Promise<void>;
}

export function CategoryManagerSheet({
  open,
  onOpenChange,
  categories,
  bookCounts,
  loading = false,
  onRenameCategory,
}: CategoryManagerSheetProps) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [nextCategory, setNextCategory] = useState('');
  const normalizedCategories = categories.map((category) => category.trim()).filter(Boolean);
  const selectedCount = selectedCategory ? bookCounts[selectedCategory] || 0 : 0;
  const trimmedNextCategory = nextCategory.trim();
  const canRename =
    Boolean(selectedCategory) &&
    Boolean(trimmedNextCategory) &&
    trimmedNextCategory !== selectedCategory &&
    trimmedNextCategory.length <= 50;

  function reset() {
    setSelectedCategory('');
    setNextCategory('');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function chooseCategory(category: string) {
    setSelectedCategory(category);
    setNextCategory(category);
  }

  async function renameCategory() {
    if (!canRename) return;
    await onRenameCategory(selectedCategory, trimmedNextCategory);
    reset();
    onOpenChange(false);
  }

  async function clearCategory() {
    if (!selectedCategory) return;
    await onRenameCategory(selectedCategory, null);
    reset();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        finalFocus={false}
        className="category-sheet-shell mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex max-h-[min(90svh,42rem)] flex-col rounded-[1.75rem] border p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[440px] sm:-translate-x-1/2"
      >
        <SheetHeader className="category-sheet-header shrink-0 px-6 pb-5 pt-7 pr-20 sm:px-7 sm:pt-8">
          <div className="flex items-center gap-4">
            <div className="category-sheet-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <Tag className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-xl font-semibold tracking-tight">
                管理分类
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs font-medium text-muted-foreground">
                重命名分类，或从图书中清空某个分类
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="category-sheet-body min-h-0 px-6 py-5 sm:px-7">
          {normalizedCategories.length === 0 ? (
            <div className="category-form-panel flex min-h-52 flex-col items-center justify-center rounded-2xl px-6 text-center">
              <Tag className="h-9 w-9 text-primary/55" />
              <p className="mt-3 font-heading text-xl font-semibold">还没有分类</p>
              <p className="mt-1 text-sm text-muted-foreground">给图书设置分类后，这里会显示管理入口。</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2.5">
                {normalizedCategories.map((category) => {
                  const active = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => chooseCategory(category)}
                      disabled={loading}
                      className={cn(
                        'category-chip inline-flex min-h-10 max-w-full items-center gap-2 rounded-full px-4 py-2 text-left text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-55',
                        active && 'category-chip-active'
                      )}
                      title={category}
                    >
                      {active ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Tag className="h-3.5 w-3.5 shrink-0 opacity-55" />
                      )}
                      <span className="truncate">{category}</span>
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold tabular-nums opacity-65">
                        {bookCounts[category] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="category-form-panel rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    重命名
                  </p>
                  <span className="text-[10px] text-muted-foreground/40">
                    {nextCategory.length}/50
                  </span>
                </div>
                <div className="relative">
                  <Input
                    value={nextCategory}
                    onChange={(event) => setNextCategory(event.target.value)}
                    maxLength={50}
                    placeholder="先选择一个分类"
                    disabled={loading || !selectedCategory}
                    className="category-input h-11 rounded-xl pr-10 text-sm disabled:opacity-60"
                  />
                  {nextCategory && (
                    <button
                      type="button"
                      onClick={() => setNextCategory('')}
                      className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/45 transition-colors hover:bg-card/70 hover:text-muted-foreground"
                      title="清空输入"
                      aria-label="清空输入"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {selectedCategory && (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    将影响 {selectedCount} 本图书。
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="category-sheet-footer flex shrink-0 flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <Button
            type="button"
            variant="destructive"
            onClick={() => void clearCategory()}
            disabled={loading || !selectedCategory}
            className="h-10 rounded-xl px-5 text-[13px] font-medium"
          >
            <Trash2 className="h-4 w-4" />
            清空分类
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="h-10 rounded-xl px-5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void renameCategory()}
            disabled={loading || !canRename}
            className="h-10 rounded-xl px-6 text-[13px] font-semibold shadow-[0_8px_18px_-14px_var(--paper-shadow)] transition-all active:scale-[0.98]"
          >
            <Pencil className="h-4 w-4" />
            {loading ? '保存中...' : '重命名'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
