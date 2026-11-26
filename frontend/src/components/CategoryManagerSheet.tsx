'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, TextInput } from '@mantine/core';
import { Check, Loader2, Pencil, Tag, Tags, Trash2, X } from 'lucide-react';
import { AppModal } from '@/components/AppModal';
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
  const [pendingAction, setPendingAction] = useState<'rename' | 'delete' | null>(null);
  const renameButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const restoreFocusFrameRef = useRef<number | null>(null);
  const isBusy = loading || pendingAction !== null;
  const normalizedCategories = categories.map((category) => category.trim()).filter(Boolean);
  const totalCategorizedBooks = normalizedCategories.reduce(
    (sum, category) => sum + (bookCounts[category] || 0),
    0
  );
  const trimmedEditValue = editValue.trim();

  const focusRenameButton = useCallback((category: string) => {
    if (typeof window === 'undefined') return;
    if (restoreFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFocusFrameRef.current);
    }
    restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
      restoreFocusFrameRef.current = null;
      renameButtonRefs.current.get(category)?.focus();
    });
  }, []);

  useEffect(() => {
    return () => {
      if (restoreFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFocusFrameRef.current);
      }
    };
  }, []);

  function reset() {
    setEditingCategory('');
    setEditValue('');
    setDeleteConfirmCategory('');
  }

  useEffect(() => {
    if (open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setEditingCategory('');
      setEditValue('');
      setDeleteConfirmCategory('');
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !editingCategory || deleteConfirmCategory || isBusy) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      const targetCategory = editingCategory;
      setEditingCategory('');
      setEditValue('');
      focusRenameButton(targetCategory);
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [deleteConfirmCategory, editingCategory, focusRenameButton, isBusy, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isBusy) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function startEdit(category: string) {
    if (isBusy) return;
    setEditingCategory(category);
    setEditValue(category);
  }

  function cancelEdit() {
    if (isBusy) return;
    const targetCategory = editingCategory;
    setEditingCategory('');
    setEditValue('');
    if (targetCategory) {
      focusRenameButton(targetCategory);
    }
  }

  async function saveRename() {
    if (
      isBusy ||
      !trimmedEditValue ||
      trimmedEditValue === editingCategory ||
      trimmedEditValue.length > 50
    ) {
      return;
    }
    const nextCategory = trimmedEditValue;
    setPendingAction('rename');
    try {
      await onRenameCategory(editingCategory, nextCategory);
      setEditingCategory('');
      setEditValue('');
      focusRenameButton(nextCategory);
    } finally {
      setPendingAction(null);
    }
  }

  async function clearCategory(category: string) {
    if (isBusy) return;
    setPendingAction('delete');
    try {
      await onRenameCategory(category, null);
      setDeleteConfirmCategory('');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <AppModal
        open={open}
        onClose={() => handleOpenChange(false)}
        title="管理分类"
        subtitle={
          normalizedCategories.length > 0
            ? `共 ${normalizedCategories.length} 个分类 · ${totalCategorizedBooks} 本已归类`
            : '重命名或移除已有图书分类'
        }
        subtitleClassName="tabular-nums"
        icon={<Tags className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />}
        returnFocus={false}
        closeDisabled={isBusy}
        closeOnEscape={!isBusy && !editingCategory && !deleteConfirmCategory}
      >
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {normalizedCategories.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/35 px-5 py-9 text-center">
                <div className="app-sheet-icon flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15">
                  <Tags className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">暂无图书分类</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  在图书菜单或批量操作中设置分类后，将在这里显示
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-surface-subtle/55">
                {normalizedCategories.map((category) => {
                  const count = bookCounts[category] || 0;
                  const isEditing = editingCategory === category;
                  const isRenaming = pendingAction === 'rename' && isEditing;
                  const willMerge =
                    isEditing &&
                    Boolean(trimmedEditValue) &&
                    trimmedEditValue !== category &&
                    normalizedCategories.includes(trimmedEditValue);

                  return (
                    <li
                      key={category}
                      className={cn(
                        'group transition-colors',
                        isEditing
                          ? 'bg-card px-3.5 py-3'
                          : 'px-3.5 py-2.5 hover:bg-secondary/60'
                      )}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <TextInput
                              value={editValue}
                              onChange={(e) => setEditValue(e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  void saveRename();
                                }
                                if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  cancelEdit();
                                }
                              }}
                              disabled={isBusy}
                              maxLength={50}
                              autoFocus
                              placeholder="输入新分类名称"
                              aria-label="新分类名称"
                              className="min-w-0 flex-1"
                              classNames={{
                                input:
                                  'category-input h-10 rounded-lg px-3 text-base font-medium text-foreground shadow-none sm:h-9 sm:text-sm',
                              }}
                            />
                            <ActionIcon
                              variant="filled"
                              size={36}
                              radius="md"
                              onClick={() => void saveRename()}
                              disabled={
                                isBusy ||
                                !trimmedEditValue ||
                                trimmedEditValue === category ||
                                trimmedEditValue.length > 50
                              }
                              aria-busy={isRenaming || undefined}
                              className="h-9 w-9 shrink-0 cursor-pointer rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.96] motion-reduce:active:scale-100 disabled:cursor-not-allowed"
                              aria-label="保存"
                              title="保存 (Enter)"
                            >
                              {isRenaming ? (
                                <Loader2
                                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                                  strokeWidth={1.8}
                                  aria-hidden="true"
                                />
                              ) : (
                                <Check className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                              )}
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size={36}
                              radius="md"
                              onClick={cancelEdit}
                              disabled={isBusy}
                              className="dialog-close-btn h-9 w-9 shrink-0 cursor-pointer transition-[background-color,color,transform] duration-150 active:scale-[0.96] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="取消"
                              title="取消 (Esc)"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </ActionIcon>
                          </div>
                          <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] text-muted-foreground">
                            <span
                              role="status"
                              aria-live="polite"
                              className={cn('truncate', willMerge && 'font-medium text-primary')}
                            >
                              {isRenaming
                                ? '正在保存…'
                                : willMerge
                                  ? `保存后将与已有分类「${trimmedEditValue}」合并`
                                  : `正在重命名「${category}」· Enter 保存`}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 font-mono tabular-nums transition-colors',
                                editValue.length >= 45
                                  ? 'font-medium text-primary'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {editValue.length}/50
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-accent/60 text-accent-foreground transition-colors group-hover:border-primary/30 group-hover:bg-accent">
                            <Tag className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                          </div>

                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className="min-w-0 truncate text-sm font-medium text-foreground"
                              title={category}
                            >
                              {category}
                            </span>
                            <span className="shrink-0 rounded-full border border-border/75 bg-card px-2 py-0.5 font-mono text-[11px] font-medium leading-4 tabular-nums text-muted-foreground">
                              {count} 本
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-0.5">
                            <ActionIcon
                              ref={(node) => {
                                if (node) {
                                  renameButtonRefs.current.set(category, node);
                                } else {
                                  renameButtonRefs.current.delete(category);
                                }
                              }}
                              variant="subtle"
                              color="gray"
                              size={34}
                              radius="md"
                              onClick={() => startEdit(category)}
                              disabled={isBusy}
                              className="h-9 w-9 cursor-pointer text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-card hover:text-foreground active:scale-[0.96] motion-reduce:active:scale-100 disabled:cursor-not-allowed sm:h-8 sm:w-8"
                              aria-label={`重命名 ${category}`}
                              title={`重命名 ${category}`}
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                            </ActionIcon>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size={34}
                              radius="md"
                              onClick={() => setDeleteConfirmCategory(category)}
                              disabled={isBusy}
                              className="h-9 w-9 cursor-pointer text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.96] motion-reduce:active:scale-100 disabled:cursor-not-allowed sm:h-8 sm:w-8"
                              aria-label={`删除 ${category}`}
                              title={`删除 ${category}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                            </ActionIcon>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {normalizedCategories.length > 0 && (
            <div className="app-dialog-footer flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-6">
              <p className="text-xs leading-5 text-muted-foreground">
                删除分类不会删除图书
              </p>
              <Button
                type="button"
                variant="default"
                size="xs"
                disabled={isBusy}
                onClick={() => handleOpenChange(false)}
                className="h-9 shrink-0 cursor-pointer rounded-lg px-3.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed sm:h-8"
              >
                完成
              </Button>
            </div>
          )}
      </AppModal>

      <ConfirmDialog
        open={!!deleteConfirmCategory}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isBusy) {
            setDeleteConfirmCategory('');
          }
        }}
        title="删除分类"
        description={`确认将分类 "${deleteConfirmCategory}" 从 ${bookCounts[deleteConfirmCategory] || 0} 本书中移除？这些图书将变为未分类。`}
        confirmLabel={pendingAction === 'delete' || loading ? '删除中…' : '确认删除'}
        confirmDisabled={isBusy}
        loading={isBusy}
        onConfirm={() => clearCategory(deleteConfirmCategory)}
      />
    </>
  );
}
