'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Check, Plus, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  const [categoryName, setCategoryName] = useState('');
  const trimmedCategoryName = categoryName.trim();
  const selectedCategory = trimmedCategoryName || null;
  const normalizedCategories = categories
    .map((category) => category.trim())
    .filter(Boolean);
  const isNewCategory = Boolean(
    trimmedCategoryName && !normalizedCategories.includes(trimmedCategoryName)
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(selectedCategory);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCategoryName('');
    }
    onOpenChange(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        finalFocus={false}
        className="app-sheet-shell reader-bottom-sheet-centered mx-auto bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] left-3 right-3 flex max-h-[min(86svh,38rem)] flex-col rounded-2xl border p-0 sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
      >
        <div className="flex justify-center pb-0.5 pt-2.5">
          <div className="h-1 w-9 rounded-full bg-border" />
        </div>
        <SheetHeader className="app-sheet-header relative shrink-0 border-b border-border/60 bg-transparent px-5 pb-4 pt-2 pr-16 shadow-none sm:px-6">
          <div className="flex items-center gap-3">
            <div className="app-sheet-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Tag className="h-4.5 w-4.5" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-heading text-lg font-medium">
                批量设置分类
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-xs leading-5 text-muted-foreground">
                将对已选择的 {selectedCount} 本图书生效
              </SheetDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="dialog-close-btn absolute right-4 top-3 border border-border bg-card"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <form className="flex min-h-0 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="app-sheet-body min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="app-surface-panel rounded-xl p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  新标签
                </p>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
                  {categoryName.length}/50
                </span>
              </div>
              <div className="relative">
                <Input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  maxLength={50}
                  placeholder="输入标签名称"
                  disabled={loading}
                  className="category-input h-10 rounded-lg pr-10 text-sm shadow-none"
                />
                {categoryName && (
                  <button
                    type="button"
                    onClick={() => setCategoryName('')}
                    className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="清空输入"
                    aria-label="清空输入"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isNewCategory && (
                <div className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{trimmedCategoryName}</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2.5 flex items-center justify-between px-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  已有标签
                </p>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
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
                      onClick={() => setCategoryName(cat)}
                      disabled={loading}
                      data-active={isSelected}
                      className={cn(
                        'category-chip-pill disabled:cursor-not-allowed disabled:opacity-50',
                        isSelected && 'category-chip-pill-active'
                      )}
                      title={cat}
                    >
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Tag className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={1.5} />
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
          </div>

          <div className="app-sheet-footer flex shrink-0 flex-col gap-2 px-5 py-3.5 sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => void onSave(null)}
              disabled={loading}
              className="h-10 rounded-lg px-4 text-sm font-medium"
            >
              清空分类
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="h-10 rounded-lg px-4 text-sm font-medium text-muted-foreground sm:order-2"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-10 rounded-lg px-5 text-sm font-medium sm:order-3"
            >
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
