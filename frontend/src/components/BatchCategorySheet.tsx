'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Modal, TextInput } from '@mantine/core';
import { Check, Loader2, Plus, Tag, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BatchCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  categories: string[];
  bookCounts: Record<string, number>;
  loading?: boolean;
  onSave: (category: string | null) => void | Promise<void>;
}

export function BatchCategorySheet({
  open,
  onOpenChange,
  selectedCount,
  categories,
  bookCounts,
  loading = false,
  onSave,
}: BatchCategorySheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [categoryName, setCategoryName] = useState('');
  const [pendingAction, setPendingAction] = useState<'save' | 'clear' | null>(null);
  const isBusy = loading || pendingAction !== null;
  const trimmedCategoryName = categoryName.trim();
  const selectedCategory = trimmedCategoryName || null;
  const normalizedCategories = Array.from(
    new Set(categories.map((category) => category.trim()).filter(Boolean))
  );
  const isNewCategory = Boolean(
    trimmedCategoryName && !normalizedCategories.includes(trimmedCategoryName)
  );
  const isSaving = isBusy && pendingAction !== 'clear';
  const isClearing = pendingAction === 'clear';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCategoryName('');
      setPendingAction(null);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy || !trimmedCategoryName) return;
    setPendingAction('save');
    try {
      await onSave(trimmedCategoryName);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleClear() {
    if (isBusy) return;
    setPendingAction('clear');
    try {
      await onSave(null);
    } finally {
      setPendingAction(null);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isBusy) return;
    if (!nextOpen) {
      setCategoryName('');
    }
    onOpenChange(nextOpen);
  }

  return (
    <Modal.Root
      opened={open}
      onClose={() => handleOpenChange(false)}
      centered
      size={440}
      radius="lg"
      padding={0}
      zIndex={90}
      returnFocus={false}
      closeOnClickOutside={!isBusy}
      closeOnEscape={!isBusy}
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
                批量设置分类
              </Modal.Title>
              <p className="mt-0.5 truncate text-xs leading-5 tabular-nums text-muted-foreground">
                将对已选择的 {selectedCount} 本图书生效
              </p>
            </div>
          </div>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={36}
            radius="md"
            disabled={isBusy}
            onClick={() => handleOpenChange(false)}
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
                maxLength={50}
                placeholder="输入或新建分类名称"
                aria-label="分类名称"
                disabled={isBusy}
                rightSection={
                  categoryName ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size={32}
                      radius="sm"
                      disabled={isBusy}
                      onClick={() => {
                        setCategoryName('');
                        inputRef.current?.focus();
                      }}
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
            </div>

            {normalizedCategories.length > 0 && (
              <div className="mt-4">
                <div className="mb-2.5 flex items-center justify-between px-0.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    已有分类
                  </p>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/75">
                    {normalizedCategories.length} 个
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {normalizedCategories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryName(isSelected ? '' : cat)}
                        disabled={isBusy}
                        aria-pressed={isSelected}
                        data-active={isSelected}
                        className={cn(
                          'category-chip-pill',
                          isSelected && 'category-chip-pill-active'
                        )}
                        title={cat}
                      >
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <Tag className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={1.5} aria-hidden="true" />
                        )}
                        <span className="truncate">{cat}</span>
                        <span className="rounded bg-foreground/8 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums opacity-75">
                          {bookCounts[cat] || 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="app-dialog-footer flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
            <Button
              type="button"
              variant="subtle"
              color="red"
              size="xs"
              onClick={() => void handleClear()}
              disabled={isBusy}
              aria-busy={isClearing || undefined}
              leftSection={
                isClearing ? (
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
              {isClearing ? '清空中…' : '清空分类'}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="subtle"
                color="gray"
                disabled={isBusy}
                onClick={() => handleOpenChange(false)}
                className="h-9 rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={isBusy || !trimmedCategoryName}
                aria-busy={isSaving || undefined}
                leftSection={
                  isSaving ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  ) : undefined
                }
                className="h-9 rounded-lg px-4 text-sm font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
              >
                {isSaving ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}
