'use client';

import { useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';

interface CategoryManagerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  bookCounts: Record<string, number>;
  loading?: boolean;
  onRenameCategory: (category: string, nextCategory: string | null) => void | Promise<void>;
}

export function CategoryManagerSheet({
  open,
  onOpenChange,
  categories,
  bookCounts,
  loading = false,
  onRenameCategory,
}: CategoryManagerSheetProps) {
  const [editingCategory, setEditingCategory] = useState('');
  const [editValue, setEditValue] = useState('');
  const [deleteConfirmCategory, setDeleteConfirmCategory] = useState('');
  const normalizedCategories = categories.map((category) => category.trim()).filter(Boolean);

  function reset() {
    setEditingCategory('');
    setEditValue('');
    setDeleteConfirmCategory('');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function startEdit(category: string) {
    setEditingCategory(category);
    setEditValue(category);
  }

  function cancelEdit() {
    setEditingCategory('');
    setEditValue('');
  }

  async function saveRename() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === editingCategory || trimmed.length > 50) return;
    await onRenameCategory(editingCategory, trimmed);
    cancelEdit();
  }

  async function clearCategory(category: string) {
    await onRenameCategory(category, null);
    setDeleteConfirmCategory('');
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-[420px] rounded-2xl border border-border/50 bg-white p-0 shadow-lg"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <DialogTitle className="text-[1.25rem] font-bold tracking-tight text-[#111111]">
              管理分类
            </DialogTitle>
            <DialogDescription className="mt-1 text-[14px] leading-5 text-muted-foreground">
              重命名或删除您的图书分类
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Category List */}
        <div className="max-h-[20rem] overflow-y-auto px-6 pb-6">
          {normalizedCategories.length === 0 ? (
            <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-secondary/30 px-6 text-center">
              <p className="text-sm font-medium text-muted-foreground">暂无分类</p>
              <p className="mt-1 text-xs text-muted-foreground/70">在图书上设置分类，分类将会在这里显示。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {normalizedCategories.map((category) => {
                const count = bookCounts[category] || 0;
                const isEditing = editingCategory === category;
                const isDeleting = deleteConfirmCategory === category;

                return (
                  <div
                    key={category}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border border-border/50 bg-white px-4 py-3 transition-all',
                      isEditing && 'border-primary/30 ring-1 ring-primary/10'
                    )}
                  >
                    {/* Category pill + count */}
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="shrink-0 rounded-full bg-[#f0f0f0] px-3 py-1 text-[14px] font-semibold text-[#111111]">
                        {category}
                      </span>
                      <span className="shrink-0 text-[13px] font-medium text-muted-foreground/70">
                        {count} 本书
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveRename();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            maxLength={50}
                            autoFocus
                            className="h-8 w-28 rounded-lg border-border/50 bg-secondary/50 px-2 text-[13px] shadow-none focus-visible:border-primary/45 focus-visible:ring-1 focus-visible:ring-primary/12"
                          />
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveRename()}
                            disabled={loading || !editValue.trim() || editValue.trim() === category || editValue.trim().length > 50}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111111] text-white hover:opacity-85 disabled:opacity-30 transition-all"
                            aria-label="Save"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(category)}
                            disabled={loading}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-all"
                            aria-label={`Rename ${category}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmCategory(category)}
                            disabled={loading}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200/60 text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-all"
                            aria-label={`Delete ${category}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>

      <ConfirmDialog
        open={!!deleteConfirmCategory}
        onOpenChange={(open) => !open && setDeleteConfirmCategory('')}
        title="删除分类"
        description={`确认将分类 "${deleteConfirmCategory}" 从 ${bookCounts[deleteConfirmCategory] || 0} 本书中移除？这些图书将变为未分类。`}
        confirmLabel="删除"
        confirmDisabled={loading}
        onConfirm={() => void clearCategory(deleteConfirmCategory)}
      />
    </Dialog>
  );
}
