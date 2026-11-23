'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
        className="app-dialog-shell max-w-[420px] rounded-2xl border p-0"
        showCloseButton={false}
      >
        <div className="flex items-start justify-between border-b border-border/60 px-6 pb-4 pt-5">
          <div>
            <DialogTitle className="font-heading text-lg font-medium text-foreground">
              管理分类
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-5 text-muted-foreground">
              重命名或删除图书分类
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="dialog-close-btn"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[20rem] overflow-y-auto px-6 py-5">
          {normalizedCategories.length === 0 ? (
            <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40 px-6 text-center">
              <p className="text-sm font-medium text-muted-foreground">暂无分类</p>
              <p className="mt-1 text-xs text-muted-foreground/80">
                在图书上设置分类后，将在这里显示
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {normalizedCategories.map((category) => {
                const count = bookCounts[category] || 0;
                const isEditing = editingCategory === category;

                return (
                  <div
                    key={category}
                    className={cn(
                      'app-surface-panel flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors',
                      isEditing && 'border-primary/40 ring-2 ring-primary/12'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="shrink-0 rounded-md bg-secondary px-2.5 py-1 text-[13px] font-medium text-foreground">
                        {category}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {count} 本
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
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
                            className="category-input h-9 w-28 rounded-lg px-2 text-[13px] shadow-none"
                          />
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="dialog-close-btn h-9 w-9"
                            aria-label="取消"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveRename()}
                            disabled={
                              loading ||
                              !editValue.trim() ||
                              editValue.trim() === category ||
                              editValue.trim().length > 50
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/92 disabled:opacity-30"
                            aria-label="保存"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(category)}
                            disabled={loading}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                            aria-label={`重命名 ${category}`}
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmCategory(category)}
                            disabled={loading}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-destructive/20 text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                            aria-label={`删除 ${category}`}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
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
