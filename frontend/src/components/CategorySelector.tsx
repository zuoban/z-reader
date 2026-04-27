'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[400px] gap-0 overflow-hidden rounded-[1.75rem] border-border/50 bg-card p-0 shadow-2xl [&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:bg-muted/45 [&_[data-slot=dialog-close]]:shadow-none"
        style={{
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-border/45 bg-white px-6 py-7 pr-16">
          <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-primary/10" />
          <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-accent/10" />
          <DialogHeader className="relative space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Tag className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-bold tracking-tight">
                  设置分类
                </DialogTitle>
                <DialogDescription className="mt-1 text-[13px] leading-6 text-muted-foreground/80">
                  为这本书选择已有分类，或输入一个新的分类名称。
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form className="space-y-5 bg-card p-6" onSubmit={handleSubmit}>
          <div className="space-y-2.5">
            <p className="pl-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
              分类名称
            </p>
            <Input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              maxLength={50}
              placeholder="输入分类"
              disabled={loading}
              className="h-11 rounded-[1.25rem] border-border/60 bg-background transition-all focus:bg-background focus:ring-4 focus:ring-primary/5"
            />
          </div>

          <button
            type="button"
            onClick={() => saveCategory(null)}
            disabled={loading}
            className={cn(
              'flex w-full cursor-pointer items-center justify-between rounded-[1.25rem] border p-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
              !currentCategory?.trim()
                ? 'border-foreground/20 bg-muted/45 text-foreground'
                : 'border-border/50 bg-background hover:bg-muted/45'
            )}
          >
            <span>无分类</span>
            {!currentCategory?.trim() && <Check className="h-4 w-4" />}
          </button>

          {categories.length > 0 && (
            <div className="space-y-2.5">
              <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                已有分类
              </p>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => saveCategory(cat)}
                  disabled={loading}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between gap-3 rounded-[1.25rem] border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                    currentCategory?.trim() === cat
                      ? 'border-foreground/20 bg-muted/45 text-foreground'
                      : 'border-border/50 bg-background hover:bg-muted/45'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {currentCategory?.trim() === cat && (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate font-medium">{cat}</span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {bookCounts[cat] || 0}
                  </span>
                </button>
              ))}
            </div>
          )}

          <DialogFooter className="-mx-6 -mb-6 flex-row items-center justify-end border-t border-border/45 bg-background px-6 py-4">
            <Button
              type="submit"
              disabled={loading}
              className="h-9 rounded-xl px-5 text-[13px] font-semibold shadow-[0_8px_18px_-14px_var(--paper-shadow)] transition-all active:scale-[0.98]"
            >
              {loading ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
