'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Modal, TextInput } from '@mantine/core';
import { toast } from 'sonner';
import { Check, Loader2, Plus, Tag, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'clear' | null>(null);
  const normalizedCurrentCategory = currentCategory?.trim() || null;
  const [categoryName, setCategoryName] = useState(normalizedCurrentCategory ?? '');
  const loading = pendingAction !== null;
  const trimmedCategoryName = categoryName.trim();
  const selectedCategory = trimmedCategoryName || null;
  const normalizedCategories = Array.from(
    new Set(categories.map((category) => category.trim()).filter(Boolean))
  );
  const isNewCategory = Boolean(
    trimmedCategoryName && !normalizedCategories.includes(trimmedCategoryName)
  );
  const willClearCategory = Boolean(normalizedCurrentCategory && !selectedCategory);
  const isUnchanged = selectedCategory === normalizedCurrentCategory;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCategoryName(normalizedCurrentCategory ?? '');
      setPendingAction(null);
    });
    return () => {
      cancelled = true;
    };
  }, [normalizedCurrentCategory, open]);

  useEffect(() => {
    if (!open) return;

    function handleComposingEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && event.isComposing) {
        event.stopPropagation();
      }
    }

    window.addEventListener('keydown', handleComposingEscape, true);
    return () => window.removeEventListener('keydown', handleComposingEscape, true);
  }, [open]);

  async function saveCategory(
    nextCategory: string | null,
    action: 'save' | 'clear'
  ) {
    if (loading) return;
    if (nextCategory !== null && nextCategory.length > 50) {
      toast.error('分类名称不能超过 50 个字符');
      return;
    }

    setPendingAction(action);
    try {
      await api.updateBook(bookId, { category: nextCategory });
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置分类失败');
    } finally {
      setPendingAction(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUnchanged) return;
    void saveCategory(selectedCategory, 'save');
  }

  function handleClose() {
    if (loading) return;
    onOpenChange(false);
  }

  const filteredCategories = normalizedCategories.filter(
    (cat) => (bookCounts[cat] || 0) > 0 || cat === normalizedCurrentCategory
  );

  return (
    <Modal.Root
      opened={open}
      onClose={handleClose}
      centered
      size={440}
      radius="lg"
      padding={0}
      zIndex={80}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      classNames={{
        inner:
          'pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
        content:
          'app-dialog-shell flex max-h-[min(82svh,34rem)] flex-col overflow-hidden overscroll-contain rounded-2xl border p-0',
      }}
    >
      <Modal.Overlay backgroundOpacity={0.42} blur={3} />
      <Modal.Content>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="app-sheet-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15">
              <Tag className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <Modal.Title className="font-heading text-[17px] font-medium leading-tight text-foreground">
                设置分类
              </Modal.Title>
              <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
                {normalizedCurrentCategory
                  ? `当前分类：${normalizedCurrentCategory}`
                  : '将此书归入分类，便于整理查找'}
              </p>
            </div>
          </div>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={36}
            radius="md"
            onClick={handleClose}
            disabled={loading}
            className="dialog-close-btn -mr-1 h-9 w-9"
            aria-label="关闭"
            title="关闭 (Esc)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        </div>

        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="app-surface-panel rounded-xl px-4 py-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  分类名称
                </p>
                <span
                  className={cn(
                    'font-mono text-[11px] tabular-nums transition-colors',
                    categoryName.length >= 45
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground/75'
                  )}
                >
                  {categoryName.length}/50
                </span>
              </div>
              <TextInput
                ref={inputRef}
                value={categoryName}
                onChange={(event) => setCategoryName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing && event.key === 'Enter') {
                    event.preventDefault();
                  }
                }}
                maxLength={50}
                placeholder="输入或新建分类名称"
                aria-label="分类名称"
                disabled={loading}
                rightSection={
                  categoryName ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size={32}
                      radius="sm"
                      disabled={loading}
                      onClick={() => {
                        setCategoryName('');
                        inputRef.current?.focus();
                      }}
                      className="cursor-pointer text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
                      title="清空输入"
                      aria-label="清空输入"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </ActionIcon>
                  ) : null
                }
                rightSectionWidth={40}
                classNames={{
                  input: 'category-input h-10 rounded-lg px-3 text-base shadow-none sm:text-sm',
                }}
              />
              {isNewCategory && (
                <div className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">将新建分类「{trimmedCategoryName}」</span>
                </div>
              )}
              {willClearCategory && (
                <div className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/8 px-2.5 py-1 text-xs font-medium text-destructive">
                  <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">保存后将移除当前分类「{normalizedCurrentCategory}」</span>
                </div>
              )}
            </div>

            {filteredCategories.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between px-0.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    已有分类
                  </p>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/75">
                    {filteredCategories.length} 个
                  </span>
                </div>
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-surface-subtle/55">
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <li key={cat}>
                        <button
                          type="button"
                          onClick={() => setCategoryName(isSelected ? '' : cat)}
                          disabled={loading}
                          aria-pressed={isSelected}
                          title={cat}
                          className={cn(
                            'flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
                            isSelected
                              ? 'bg-primary/[0.08] text-foreground'
                              : 'hover:bg-secondary/65'
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border transition-colors',
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" strokeWidth={2.2} />}
                          </span>
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-sm font-medium',
                              isSelected ? 'text-primary' : 'text-foreground'
                            )}
                          >
                            {cat}
                          </span>
                          <span className="shrink-0 rounded-full border border-border/75 bg-card px-2 py-0.5 font-mono text-[11px] font-medium leading-4 tabular-nums text-muted-foreground">
                            {bookCounts[cat] || 0} 本
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="app-dialog-footer flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
            <div>
              {normalizedCurrentCategory && (
                <Button
                  type="button"
                  variant="subtle"
                  color="red"
                  size="xs"
                  disabled={loading}
                  aria-busy={pendingAction === 'clear' || undefined}
                  onClick={() => void saveCategory(null, 'clear')}
                  leftSection={
                    pendingAction === 'clear' ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                    )
                  }
                  className="h-9 rounded-lg px-2.5 text-xs font-medium text-destructive transition-[background-color,color,transform] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  {pendingAction === 'clear' ? '移除中…' : '移除分类'}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="subtle"
                color="gray"
                disabled={loading}
                onClick={handleClose}
                className="h-9 rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={loading || isUnchanged}
                aria-busy={pendingAction === 'save' || undefined}
                leftSection={
                  pendingAction === 'save' ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : undefined
                }
                className="h-9 rounded-lg px-4 text-sm font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
              >
                {pendingAction === 'save' ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}
