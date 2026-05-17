'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Check, Plus, Tag, X } from 'lucide-react';
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

interface BatchCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  categories: string[];
  bookCounts: Record<string, number>;
  loading?: boolean;
  onSave: (category: string | null) => void | Promise<void>;
}

export function BatchCategorySheet({
  open,
  onOpenChange,
  selectedCount,
  categories,
  bookCounts,
  loading = false,
  onSave,
}: BatchCategorySheetProps) {
  const [categoryName, setCategoryName] = useState('');
  const trimmedCategoryName = categoryName.trim();
  const selectedCategory = trimmedCategoryName || null;
  const normalizedCategories = categories
    .map((category) => category.trim())
    .filter(Boolean);
  const isNewCategory = Boolean(
    trimmedCategoryName && !normalizedCategories.includes(trimmedCategoryName)
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(selectedCategory);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCategoryName('');
    }
    onOpenChange(nextOpen);
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
                批量设置分类
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs font-medium text-muted-foreground">
                将对已选择的 {selectedCount} 本图书生效
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form className="flex min-h-0 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="category-sheet-body min-h-0 px-6 py-5 sm:px-7">
            <div className="category-form-panel rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                  新标签
                </p>
                <span className="text-[10px] text-muted-foreground/40">
                  {categoryName.length}/50
                </span>
              </div>
              <div className="relative">
                <Input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  maxLength={50}
                  placeholder="输入标签名称"
                  disabled={loading}
                  className="category-input h-11 rounded-xl pr-10 text-sm"
                />
                {categoryName && (
                  <button
                    type="button"
                    onClick={() => setCategoryName('')}
                    className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/45 transition-colors hover:bg-card/70 hover:text-muted-foreground"
                    title="清空输入"
                    aria-label="清空输入"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isNewCategory && (
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{trimmedCategoryName}</span>
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between pl-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                  已有标签
                </p>
                <span className="text-[10px] font-medium text-muted-foreground/45">
                  {normalizedCategories.length} 个
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {normalizedCategories.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryName(cat)}
                      disabled={loading}
                      className={cn(
                        'category-chip inline-flex min-h-10 max-w-full items-center gap-2 rounded-full px-4 py-2 text-left text-sm font-semibold transition-all disabled:cursor-not-allowed',
                        isSelected && 'category-chip-active'
                      )}
                      title={cat}
                    >
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Tag className="h-3.5 w-3.5 shrink-0 opacity-55" />
                      )}
                      <span className="truncate">{cat}</span>
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold tabular-nums opacity-70">
                        {bookCounts[cat] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="category-sheet-footer flex shrink-0 flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={() => void onSave(null)}
              disabled={loading}
              className="h-10 rounded-xl px-5 text-[13px] font-medium"
            >
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
              type="submit"
              disabled={loading}
              className="h-10 rounded-xl px-6 text-[13px] font-semibold shadow-[0_8px_18px_-14px_var(--paper-shadow)] transition-all active:scale-[0.98]"
            >
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
