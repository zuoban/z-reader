'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CategorySelectorProps {
  bookId: string;
  currentCategory?: string;
  categories: string[];
  bookCounts: Record<string, number>;
  onUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategorySelector({
  bookId,
  currentCategory,
  categories,
  bookCounts,
  onUpdate,
  open,
  onOpenChange,
}: CategorySelectorProps) {
  const [loading, setLoading] = useState(false);
  const [categoryName, setCategoryName] = useState(currentCategory ?? '');
  const trimmedCategoryName = categoryName.trim();
  const selectedCategory = trimmedCategoryName || null;
  const normalizedCategories = categories
    .map((category) => category.trim())
    .filter(Boolean);
  const isNewCategory = Boolean(
    trimmedCategoryName && !normalizedCategories.includes(trimmedCategoryName)
  );

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setCategoryName(currentCategory ?? '');
    });
  }, [currentCategory, open]);

  async function saveCategory(nextCategory: string | null) {
    setLoading(true);
    try {
      if (nextCategory !== null && nextCategory.length > 50) {
        toast.error('Category name exceeds 50 characters');
        return;
      }

      await api.updateBook(bookId, { category: nextCategory });
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set category');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCategory(selectedCategory);
  }

  const filteredCategories = normalizedCategories
    .filter((cat) => (bookCounts[cat] || 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[420px] rounded-2xl border border-border/50 bg-white p-0 shadow-lg"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <DialogTitle className="text-[1.25rem] font-bold tracking-tight text-[#111111]">
              设置分类
            </DialogTitle>
            <DialogDescription className="mt-1 text-[14px] leading-5 text-muted-foreground">
              将此书归入分类，便于管理
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[18rem] overflow-y-auto px-6 pb-6">
            {/* New category input */}
            <div className="rounded-xl border border-border/50 bg-white px-4 py-3">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[12px] font-semibold text-muted-foreground/70">
                  新建分类
                </p>
                <span className="text-[11px] text-muted-foreground/40">
                  {categoryName.length}/50
                </span>
              </div>
              <div className="relative">
                <Input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  maxLength={50}
                  placeholder="输入分类名称"
                  disabled={loading}
                  className="h-10 rounded-lg border-border/50 bg-secondary/40 px-3 text-[14px] shadow-none focus-visible:border-primary/45 focus-visible:ring-1 focus-visible:ring-primary/12"
                />
                {categoryName && (
                  <button
                    type="button"
                    onClick={() => setCategoryName('')}
                    className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
                    aria-label="Clear input"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isNewCategory && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#f0f0f0] px-3 py-1.5 text-[13px] font-medium text-[#111111]">
                  <Plus className="h-3.5 w-3.5" />
                  {trimmedCategoryName}
                </div>
              )}
            </div>

            {/* Existing categories */}
            {filteredCategories.length > 0 && (
              <div className="mt-3">
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <p className="text-[12px] font-semibold text-muted-foreground/70">
                    已有分类
                  </p>
                  <span className="text-[11px] text-muted-foreground/40">
                    {filteredCategories.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <div
                        key={cat}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border border-border/50 bg-white px-3.5 py-2.5 cursor-pointer transition-all',
                          isSelected && 'border-primary/30 ring-1 ring-primary/10 bg-primary/[0.03]'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setCategoryName(cat)}
                          disabled={loading}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-50"
                          title={cat}
                        >
                          <div className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
                            isSelected
                              ? 'border-[#111111] bg-[#111111]'
                              : 'border-border/60'
                          )}>
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="truncate text-[14px] font-medium text-[#111111]">
                            {cat}
                          </span>
                          <span className="ml-auto shrink-0 text-[12px] text-muted-foreground/60">
                            {bookCounts[cat] || 0} 本书
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border/50 bg-white px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-lg px-4 text-[14px] font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-10 rounded-lg bg-[#111111] px-6 text-[14px] font-semibold text-white shadow-none hover:opacity-85 transition-all active:scale-[0.98] disabled:opacity-40"
            >
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
