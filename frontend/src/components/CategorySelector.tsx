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
        showCloseButton
        finalFocus={false}
        className="mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex !h-[min(92svh,48rem)] flex-col rounded-[2.5rem] border p-0 shadow-2xl sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
        style={{
          backgroundColor: 'var(--shelf-surface)',
          borderColor: 'color-mix(in srgb, var(--border), transparent 40%)',
          boxShadow: '0 -12px 48px -12px var(--paper-shadow)',
        }}
      >
        <SheetHeader className="relative shrink-0 overflow-hidden border-b-0 px-8 pb-4 pt-10 pr-24">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
          <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-accent/10" />

          <div className="relative min-w-0">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
                <Tag className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-2xl font-bold tracking-tight">
                  设置分类
                </SheetTitle>
                <SheetDescription className="mt-1 text-xs font-medium opacity-60">
                  用标签整理书架，也可以新建一个标签
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-5 pt-4 [-webkit-overflow-scrolling:touch]">
            <div className="rounded-[1.75rem] border border-border/45 bg-background/70 p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_60%,transparent)]">
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
                  className="h-11 rounded-[1.2rem] border-border/60 bg-muted/35 pr-10 text-sm transition-all focus:border-primary/30 focus:ring-4 focus:ring-primary/5"
                />
                {categoryName && (
                  <button
                    type="button"
                    onClick={() => setCategoryName('')}
                    className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/45 transition-colors hover:bg-background hover:text-muted-foreground"
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
                    <span
                      key={cat}
                      className={cn(
                        'group inline-flex min-h-10 max-w-full items-center overflow-hidden rounded-full border text-sm font-semibold transition-all',
                        isSelected
                          ? 'border-primary/35 bg-primary/10 text-primary shadow-sm shadow-primary/10'
                          : 'border-border/55 bg-background/80 text-muted-foreground hover:border-primary/25 hover:bg-primary/5 hover:text-foreground'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setCategoryName(cat)}
                        disabled={loading}
                        className="inline-flex min-w-0 items-center gap-2 px-4 py-2 text-left disabled:cursor-not-allowed"
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
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(cat)}
                        disabled={loading || !isSelected}
                        className={cn(
                          'mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                          isSelected
                            ? 'text-primary/70 hover:bg-primary/10 hover:text-primary'
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

          {/* 底部操作栏 */}
          <div className="mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-border/40 px-8 py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
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
