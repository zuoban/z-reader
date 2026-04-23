'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Category } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CategorySelectorProps {
  bookId: string;
  currentCategory?: string;
  categories: Category[];
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
        className="max-w-sm border-border bg-background shadow-md"
        style={{
          backgroundColor: 'var(--background)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>设置分类</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <Input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              maxLength={50}
              placeholder="输入分类"
              disabled={loading}
              className="h-10 rounded-xl"
            />
            <Button type="submit" disabled={loading} className="h-10 shrink-0 rounded-xl px-4">
              保存
            </Button>
          </div>

          <button
            type="button"
            onClick={() => saveCategory(null)}
            disabled={loading}
            className={cn(
              'paper-field w-full cursor-pointer rounded-xl p-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
              !currentCategory?.trim()
                ? 'border-foreground/20 text-foreground'
                : 'border-border/70 hover:bg-muted/70'
            )}
          >
            无分类
          </button>

          {categories.length > 0 && (
            <div className="space-y-2.5">
              <p className="px-1 text-xs font-medium text-muted-foreground">已有分类</p>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => saveCategory(cat.name)}
                  disabled={loading}
                  className={cn(
                    'paper-field flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                    currentCategory?.trim() === cat.name
                      ? 'border-foreground/20 text-foreground'
                      : 'border-border/70 hover:bg-muted/70'
                  )}
                >
                  <div className="flex min-w-0 items-center">
                    <span className="truncate font-medium">{cat.name}</span>
                  </div>
                  <span className="paper-chip rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {bookCounts[cat.id] || 0}
                  </span>
                </button>
              ))}
            </div>
          )}

          {loading && (
            <Button variant="ghost" className="w-full justify-center rounded-xl" disabled>
              处理中...
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
