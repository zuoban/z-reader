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
        className="app-dialog-shell paper-texture max-w-[420px] rounded-2xl border p-0"
        showCloseButton={false}
      >
        <div className="flex items-start justify-between border-b border-border/45 px-6 pb-4 pt-6">
          <div>
            <DialogTitle className="font-heading text-[1.2rem] font-semibold tracking-[-0.02em] text-foreground">
              设置分类
            </DialogTitle>
            <DialogDescription className="mt-1 text-[14px] leading-5 text-muted-foreground">
              将此书归入分类，便于管理
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="dialog-close-btn"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[18rem] overflow-y-auto px-6 py-5">
            <div className="app-surface-panel rounded-xl px-4 py-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                  新建分类
                </p>
                <span className="text-[11px] tabular-nums text-muted-foreground/45">
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
                  className="category-input h-10 rounded-lg px-3 text-[14px] shadow-none"
                />
                {categoryName && (
                  <button
                    type="button"
                    onClick={() => setCategoryName('')}
                    className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
                    aria-label="清空输入"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isNewCategory && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[13px] font-medium text-primary">
                  <Plus className="h-3.5 w-3.5" />
                  {trimmedCategoryName}
                </div>
              )}
            </div>

            {filteredCategories.length > 0 && (
              <div className="mt-4">
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                    已有分类
                  </p>
                  <span className="text-[11px] tabular-nums text-muted-foreground/45">
                    {filteredCategories.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryName(cat)}
                        disabled={loading}
                        title={cat}
                        className={cn(
                          'app-surface-panel flex w-full min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-all disabled:opacity-50',
                          isSelected && 'border-primary/35 bg-primary/[0.06] ring-2 ring-primary/12'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
                            isSelected
                              ? 'border-primary bg-primary'
                              : 'border-border/65 bg-card'
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
                          {cat}
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground/65">
                          {bookCounts[cat] || 0} 本
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="app-dialog-footer flex items-center justify-end gap-2 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl px-4 text-[14px] font-medium text-muted-foreground"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-10 rounded-xl px-6 text-[14px] font-semibold"
            >
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
