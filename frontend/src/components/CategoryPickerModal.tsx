'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, TextInput } from '@mantine/core';
import { Check, Loader2, Plus, Tag, Trash2, X } from 'lucide-react';
import { AppModal } from '@/components/AppModal';
import { cn } from '@/lib/utils';

export interface CategoryPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  initialCategory?: string | null;
  categories: string[];
  bookCounts: Record<string, number>;
  listVariant: 'chips' | 'list';
  loading?: boolean;
  zIndex?: number;
  returnFocus?: boolean;
  showClearButton: boolean;
  clearLabel: string;
  clearingLabel: string;
  willClearMessage?: (trimmedCategoryName: string, selectedCategory: string | null) => string | null;
  isSaveDisabled: (selectedCategory: string | null) => boolean;
  onSave: (category: string | null) => Promise<boolean | void> | boolean | void;
}

export function CategoryPickerModal({
  open,
  onOpenChange,
  title,
  subtitle,
  initialCategory = null,
  categories,
  bookCounts,
  listVariant,
  loading = false,
  zIndex,
  returnFocus,
  showClearButton,
  clearLabel,
  clearingLabel,
  willClearMessage,
  isSaveDisabled,
  onSave,
}: CategoryPickerModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [categoryName, setCategoryName] = useState(initialCategory ?? '');
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
  const clearBanner = willClearMessage?.(trimmedCategoryName, selectedCategory) ?? null;
  const isSaving = (loading && pendingAction !== 'clear') || pendingAction === 'save';
  const isClearing = pendingAction === 'clear';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCategoryName(initialCategory ?? '');
      setPendingAction(null);
    });
    return () => {
      cancelled = true;
    };
  }, [initialCategory, open]);

  async function runSave(nextCategory: string | null, action: 'save' | 'clear') {
    if (isBusy) return;
    setPendingAction(action);
    try {
      await onSave(nextCategory);
    } finally {
      setPendingAction(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy || isSaveDisabled(selectedCategory)) return;
    void runSave(selectedCategory, 'save');
  }

  function handleClose() {
    if (isBusy) return;
    if (initialCategory === null) {
      setCategoryName('');
    }
    onOpenChange(false);
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      subtitleClassName={listVariant === 'chips' ? 'tabular-nums' : undefined}
      icon={<Tag className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />}
      zIndex={zIndex}
      returnFocus={returnFocus}
      closeDisabled={isBusy}
    >
      <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="app-surface-panel rounded-xl px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">分类名称</p>
              <span
                className={cn(
                  'font-mono text-[11px] tabular-nums transition-colors',
                  categoryName.length >= 45
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground'
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
            {clearBanner && (
              <div className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/8 px-2.5 py-1 text-xs font-medium text-destructive">
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{clearBanner}</span>
              </div>
            )}
          </div>

          {normalizedCategories.length > 0 && (
            <div className="mt-4">
              <div className="mb-2.5 flex items-center justify-between px-0.5">
                <p className="text-xs font-medium text-muted-foreground">已有分类</p>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {normalizedCategories.length} 个
                </span>
              </div>
              {listVariant === 'chips' ? (
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
              ) : (
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-surface-subtle/55">
                  {normalizedCategories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <li key={cat}>
                        <button
                          type="button"
                          onClick={() => setCategoryName(isSelected ? '' : cat)}
                          disabled={isBusy}
                          aria-pressed={isSelected}
                          title={cat}
                          className={cn(
                            'flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
                            isSelected ? 'bg-primary/[0.08] text-foreground' : 'hover:bg-secondary/65'
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
              )}
            </div>
          )}
        </div>

        <div className="app-dialog-footer flex shrink-0 items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <div>
            {showClearButton && (
              <Button
                type="button"
                variant="subtle"
                color="red"
                size="xs"
                onClick={() => void runSave(null, 'clear')}
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
                {isClearing ? clearingLabel : clearLabel}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="subtle"
              color="gray"
              disabled={isBusy}
              onClick={handleClose}
              className="h-9 rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={isBusy || isSaveDisabled(selectedCategory)}
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
    </AppModal>
  );
}
