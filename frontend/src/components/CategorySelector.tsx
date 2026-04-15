'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api, Category } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CategorySelectorProps {
  bookId: string;
  currentCategoryId?: string;
  categories: Category[];
  bookCounts: Record<string, number>;
  onUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategorySelector({ bookId, currentCategoryId, categories, bookCounts, onUpdate, open, onOpenChange }: CategorySelectorProps) {
  const [loading, setLoading] = useState(false);

  async function handleSelect(categoryId: string | null) {
    setLoading(true);
    try {
      if (categoryId === null) {
        await api.removeBookCategory(bookId);
      } else {
        await api.updateBook(bookId, { category_id: categoryId });
      }
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置失败');
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>设置分类</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <button
            onClick={() => handleSelect(null)}
            disabled={loading}
            className={`w-full rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 ${
              !currentCategoryId ? 'border-foreground bg-muted' : 'border-border/70 hover:bg-muted'
            }`}
          >
            无分类
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleSelect(cat.id)}
              disabled={loading}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 ${
                currentCategoryId === cat.id ? 'border-foreground bg-muted' : 'border-border/70 hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
                {cat.name}
              </div>
              <span className="rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {bookCounts[cat.id] || 0}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
