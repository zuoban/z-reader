'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Plus, Tag, X } from 'lucide-react';
import { api } from '@/lib/api';
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
    if (open) {
      setCategoryName(currentCategory ?? '');
    }
  }, [currentCategory, open]);

  async function saveCategory(nextCategory: string | null) {
    setLoading(true);
    try {
      if (nextCategory !== null && nextCategory.length > 50) {
        toast.error('分类不能超过 50 个字符');
        return;
      }

      await api.updateBook(bookId, { category: nextCategory });
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置失败');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCategory(selectedCategory);
  }

  function handleRemoveCategory(category: string) {
    if (selectedCategory === category) {
      setCategoryName('');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        finalFocus={false}
        className="mx-auto bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] left-3 right-3 flex max-h-[min(86svh,38rem)] flex-col rounded-3xl border border-border/65 bg-popover/98 p-0 shadow-[0_24px_70px_-40px_var(--paper-shadow),0_10px_32px_-28px_var(--paper-shadow-soft)] ring-1 ring-white/45 backdrop-blur-md dark:ring-white/10 sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
      >
        <SheetHeader className="relative shrink-0 border-b border-border/55 bg-transparent px-5 pb-4 pt-5 pr-16 shadow-none sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/14 bg-primary/8 text-primary">
              <Tag className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-[19px] font-semibold tracking-tight">
                设置分类
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs font-medium leading-5 text-muted-foreground">
                用标签整理书架，也可以新建一个标签
              </SheetDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/62 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <form className="flex min-h-0 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="rounded-2xl border border-border/55 bg-muted/28 p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
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
                  className="h-11 rounded-xl border-border/70 bg-background/72 pr-10 text-sm shadow-none focus-visible:border-primary/45 focus-visible:ring-primary/12"
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

            <div className="mt-4">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                  已有标签
                </p>
                <span className="text-[10px] font-medium text-muted-foreground/45">
                  {normalizedCategories.length} 个
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {normalizedCategories
                  .filter((cat) => (bookCounts[cat] || 0) > 0)
                  .map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <span
                        key={cat}
                        className={cn(
                          'group inline-flex min-h-9 max-w-full items-center overflow-hidden rounded-full border border-border/65 bg-background/58 text-[13px] font-semibold text-muted-foreground shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_35%,transparent)] transition-colors',
                          isSelected && 'border-primary/45 bg-primary/10 text-primary'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setCategoryName(cat)}
                          disabled={loading}
                          className="inline-flex min-w-0 items-center gap-2 px-3 py-1.5 text-left disabled:cursor-not-allowed"
                          title={cat}
                        >
                          {isSelected ? (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Tag className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="truncate">{cat}</span>
                          <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/8 px-1 text-[9px] font-bold tabular-nums opacity-70">
                            {bookCounts[cat] || 0}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCategory(cat)}
                          disabled={loading || !isSelected}
                          className={cn(
                            'mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
                            isSelected
                              ? 'text-primary/70 hover:text-primary'
                              : 'pointer-events-none text-transparent'
                          )}
                          title="删除此书标签"
                          aria-label="删除此书标签"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/55 bg-background/40 px-5 py-3.5 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
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
