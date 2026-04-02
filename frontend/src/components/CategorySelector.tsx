'use client';

import { useState } from 'react';
import { api, Category } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CategorySelectorProps {
  bookId: string;
  currentCategoryId?: string;
  categories: Category[];
  onUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategorySelector({ bookId, currentCategoryId, categories, onUpdate, open, onOpenChange }: CategorySelectorProps) {
  const [loading, setLoading] = useState(false);

  async function handleSelect(categoryId: string | null) {
    setLoading(true);
    try {
      await api.updateBook(bookId, { category_id: categoryId });
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '设置失败');
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>设置分类</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <button
            onClick={() => handleSelect(null)}
            disabled={loading}
            className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
              !currentCategoryId ? 'border-foreground bg-muted' : 'border-border hover:bg-muted'
            }`}
          >
            无分类
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleSelect(cat.id)}
              disabled={loading}
              className={`flex w-full items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                currentCategoryId === cat.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted'
              }`}
            >
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
              {cat.name}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

