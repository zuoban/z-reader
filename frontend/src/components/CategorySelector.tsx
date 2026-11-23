'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { ActionIcon, Button, Modal, TextInput } from '@mantine/core';
import { toast } from 'sonner';
import { Check, Plus, X } from 'lucide-react';
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
  const [loading, setLoading] = useState(false);
  const [categoryName, setCategoryName] = useState(currentCategory ?? '');
  const trimmedCategoryName = categoryName.trim();
  const selectedCategory = trimmedCategoryName || null;
  const normalizedCategories = categories
    .map((category) => category.trim())
    .filter(Boolean);
  const isNewCategory = Boolean(
    trimmedCategoryName && !normalizedCategories.includes(trimmedCategoryName)
  );

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setCategoryName(currentCategory ?? '');
    });
  }, [currentCategory, open]);

  async function saveCategory(nextCategory: string | null) {
    setLoading(true);
    try {
      if (nextCategory !== null && nextCategory.length > 50) {
        toast.error('分类名称不能超过 50 个字符');
        return;
      }

      await api.updateBook(bookId, { category: nextCategory });
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置分类失败');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveCategory(selectedCategory);
  }

  const filteredCategories = normalizedCategories
    .filter((cat) => (bookCounts[cat] || 0) > 0);

  return (
    <Modal.Root
      opened={open}
      onClose={() => onOpenChange(false)}
      centered
      size={420}
      radius="lg"
      padding={0}
      zIndex={80}
    >
      <Modal.Overlay backgroundOpacity={0.42} blur={3} />
      <Modal.Content className="app-dialog-shell overflow-hidden rounded-2xl border p-0">
        <div className="flex items-start justify-between border-b border-border/60 px-6 pb-4 pt-5">
          <div>
            <Modal.Title className="font-heading text-lg font-medium text-foreground">
              设置分类
            </Modal.Title>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              将此书归入分类，便于管理
            </p>
          </div>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={40}
            radius="md"
            onClick={() => onOpenChange(false)}
            className="dialog-close-btn"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </ActionIcon>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[18rem] overflow-y-auto px-6 py-5">
            <div className="app-surface-panel rounded-xl px-4 py-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  新建分类
                </p>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
                  {categoryName.length}/50
                </span>
              </div>
              <TextInput
                value={categoryName}
                onChange={(event) => setCategoryName(event.currentTarget.value)}
                maxLength={50}
                placeholder="输入分类名称"
                aria-label="分类名称"
                disabled={loading}
                rightSection={
                  categoryName ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size={32}
                      radius="sm"
                      onClick={() => setCategoryName('')}
                      aria-label="清空输入"
                    >
                      <X className="h-3.5 w-3.5" />
                    </ActionIcon>
                  ) : null
                }
                rightSectionWidth={40}
                classNames={{
                  input: 'category-input h-10 rounded-lg px-3 text-sm shadow-none',
                }}
              />
              {isNewCategory && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Plus className="h-3.5 w-3.5" />
                  {trimmedCategoryName}
                </div>
              )}
            </div>

            {filteredCategories.length > 0 && (
              <div className="mt-4">
                <div className="mb-2.5 flex items-center justify-between px-0.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    已有分类
                  </p>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
                    {filteredCategories.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryName(cat)}
                        disabled={loading}
                        title={cat}
                        className={cn(
                          'app-surface-panel flex w-full min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-colors disabled:opacity-50',
                          isSelected && 'border-primary/40 bg-primary/[0.06] ring-1 ring-primary/15'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors',
                            isSelected
                              ? 'border-primary bg-primary'
                              : 'border-border bg-card'
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {cat}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {bookCounts[cat] || 0} 本
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="app-dialog-footer flex items-center justify-end gap-2 px-6 py-4">
            <Button
              type="button"
              variant="subtle"
              color="gray"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-lg px-4 text-sm font-medium text-muted-foreground"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-10 rounded-lg px-5 text-sm font-medium"
            >
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}
