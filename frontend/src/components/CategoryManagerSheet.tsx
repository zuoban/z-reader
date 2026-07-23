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
        className="app-dialog-shell paper-texture max-w-[420px] rounded-2xl border p-0"
        showCloseButton={false}
      >
        <div className="flex items-start justify-between border-b border-border/45 px-6 pb-4 pt-6">
          <div>
            <DialogTitle className="font-heading text-[1.2rem] font-semibold tracking-[-0.02em] text-foreground">
              管理分类
            </DialogTitle>
            <DialogDescription className="mt-1 text-[14px] leading-5 text-muted-foreground">
              重命名或删除您的图书分类
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
            <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-border/55 bg-surface-subtle/80 px-6 text-center">
              <p className="text-sm font-medium text-muted-foreground">暂无分类</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                在图书上设置分类，分类将会在这里显示。
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
                      'app-surface-panel flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all',
                      isEditing && 'border-primary/30 ring-2 ring-primary/12'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-[13px] font-semibold text-foreground">
                        {category}
                      </span>
                      <span className="shrink-0 text-[12px] font-medium tabular-nums text-muted-foreground/75">
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
                            className="category-input h-10 w-28 rounded-lg px-2 text-[13px] shadow-none"
                          />
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="dialog-close-btn h-10 w-10"
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
                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:opacity-92 disabled:opacity-30"
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
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/55 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40"
                            aria-label={`重命名 ${category}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmCategory(category)}
                            disabled={loading}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-destructive/20 text-destructive/75 transition-all hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                            aria-label={`删除 ${category}`}
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
