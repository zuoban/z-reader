'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Tag, X } from 'lucide-react';
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
    const trimmedName = categoryName.trim();
    void saveCategory(trimmedName || null);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton
        className="flex w-[380px] flex-col border-l border-border/60 p-0 sm:max-w-[380px]"
        style={{
          backgroundColor: 'var(--shelf-surface)',
        }}
      >
        {/* 头部区域 */}
        <SheetHeader className="relative overflow-hidden border-b border-border/40 bg-[var(--shelf-surface-raised)] px-6 py-8 pr-28">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
          <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-accent/10" />

          <div className="relative min-w-0">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
                <Tag className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-xl font-bold tracking-tight">
                  设置分类
                </SheetTitle>
                <SheetDescription className="mt-1 text-[11px] font-medium opacity-60">
                  为这本书选择已有分类，或输入新的分类名称
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col overflow-hidden p-6"
          onSubmit={handleSubmit}
        >
          {/* 输入区域 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pl-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                分类名称
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
                placeholder="输入或选择分类"
                disabled={loading}
                className="h-11 rounded-[1.25rem] border-border/60 bg-background pr-10 transition-all focus:border-primary/30 focus:ring-4 focus:ring-primary/5"
              />
              {categoryName && (
                <button
                  type="button"
                  onClick={() => setCategoryName('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* 无分类选项 */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => saveCategory(null)}
              disabled={loading}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between rounded-[1.25rem] border p-4 text-left text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                !currentCategory?.trim()
                  ? 'border-primary/30 bg-primary/5 text-foreground'
                  : 'border-border/50 bg-background hover:border-border/80 hover:bg-muted/30'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                  —
                </span>
                <span>无分类</span>
              </div>
              {!currentCategory?.trim() && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          </div>

          {/* 已有分类列表 */}
          {categories.length > 0 && (
            <div className="mt-6 flex flex-col overflow-hidden">
              <p className="mb-3 pl-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                已有分类
              </p>
              <div className="flex-1 space-y-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categories.map((cat, index) => {
                  const isSelected = currentCategory?.trim() === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => saveCategory(cat)}
                      disabled={loading}
                      className={cn(
                        'group flex w-full cursor-pointer items-center justify-between gap-3 rounded-[1.25rem] border p-4 text-left text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                        isSelected
                          ? 'border-primary/30 bg-primary/5 text-foreground'
                          : 'border-border/50 bg-background hover:border-border/80 hover:bg-muted/30'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {isSelected ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border/30 bg-muted/50 text-[10px] text-muted-foreground/60">
                            {index + 1}
                          </span>
                        )}
                        <span className="truncate font-medium">{cat}</span>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {bookCounts[cat] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 底部操作栏 */}
          <div className="mt-auto flex items-center justify-end gap-3 border-t border-border/40 pt-6">
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
