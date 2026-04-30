'use client';

import { useState } from 'react';
import { Check, Pencil, Tag, Trash2, X } from 'lucide-react';
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
  const [selectedCategory, setSelectedCategory] = useState('');
  const [nextCategory, setNextCategory] = useState('');
  const normalizedCategories = categories.map((category) => category.trim()).filter(Boolean);
  const selectedCount = selectedCategory ? bookCounts[selectedCategory] || 0 : 0;
  const trimmedNextCategory = nextCategory.trim();
  const canRename =
    Boolean(selectedCategory) &&
    Boolean(trimmedNextCategory) &&
    trimmedNextCategory !== selectedCategory &&
    trimmedNextCategory.length <= 50;

  function reset() {
    setSelectedCategory('');
    setNextCategory('');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function chooseCategory(category: string) {
    setSelectedCategory(category);
    setNextCategory(category);
  }

  async function renameCategory() {
    if (!canRename) return;
    await onRenameCategory(selectedCategory, trimmedNextCategory);
    reset();
    onOpenChange(false);
  }

  async function clearCategory() {
    if (!selectedCategory) return;
    await onRenameCategory(selectedCategory, null);
    reset();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        finalFocus={false}
        className="mx-auto bottom-[max(env(safe-area-inset-bottom,0px),1rem)] left-4 right-4 flex !h-[min(92svh,48rem)] flex-col rounded-[2.5rem] border p-0 shadow-2xl sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
        style={{
          backgroundColor: 'var(--shelf-surface)',
          borderColor: 'color-mix(in srgb, var(--border), transparent 40%)',
          boxShadow: '0 -12px 48px -12px var(--paper-shadow)',
        }}
      >
        <SheetHeader className="relative shrink-0 overflow-hidden border-b-0 px-8 pb-4 pt-10 pr-24">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
          <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-accent/10" />

          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
              <Tag className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-2xl font-bold tracking-tight">
                管理分类
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs font-medium opacity-60">
                重命名分类，或从图书中清空某个分类
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-5 pt-4 [-webkit-overflow-scrolling:touch]">
          {normalizedCategories.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-[1.75rem] border border-border/45 bg-background/60 px-6 text-center">
              <Tag className="h-9 w-9 text-primary/55" />
              <p className="mt-3 font-heading text-xl font-semibold">还没有分类</p>
              <p className="mt-1 text-sm text-muted-foreground">给图书设置分类后，这里会显示管理入口。</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2.5">
                {normalizedCategories.map((category) => {
                  const active = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => chooseCategory(category)}
                      disabled={loading}
                      className={cn(
                        'inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border px-4 py-2 text-left text-sm font-semibold transition-all disabled:cursor-not-allowed',
                        active
                          ? 'border-primary/35 bg-primary/10 text-primary shadow-sm shadow-primary/10'
                          : 'border-border/55 bg-background/80 text-muted-foreground hover:border-primary/25 hover:bg-primary/5 hover:text-foreground'
                      )}
                      title={category}
                    >
                      {active ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Tag className="h-3.5 w-3.5 shrink-0 opacity-55" />
                      )}
                      <span className="truncate">{category}</span>
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold tabular-nums opacity-70">
                        {bookCounts[category] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-[1.75rem] border border-border/45 bg-background/70 p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_60%,transparent)]">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    重命名
                  </p>
                  <span className="text-[10px] text-muted-foreground/40">
                    {nextCategory.length}/50
                  </span>
                </div>
                <div className="relative">
                  <Input
                    value={nextCategory}
                    onChange={(event) => setNextCategory(event.target.value)}
                    maxLength={50}
                    placeholder="先选择一个分类"
                    disabled={loading || !selectedCategory}
                    className="h-11 rounded-[1.2rem] border-border/60 bg-muted/35 pr-10 text-sm transition-all focus:border-primary/30 focus:ring-4 focus:ring-primary/5"
                  />
                  {nextCategory && (
                    <button
                      type="button"
                      onClick={() => setNextCategory('')}
                      className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/45 transition-colors hover:bg-background hover:text-muted-foreground"
                      title="清空输入"
                      aria-label="清空输入"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {selectedCategory && (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    将影响 {selectedCount} 本图书。
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border/40 px-8 py-5 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="destructive"
            onClick={() => void clearCategory()}
            disabled={loading || !selectedCategory}
            className="h-10 rounded-xl px-5 text-[13px] font-medium"
          >
            <Trash2 className="h-4 w-4" />
            清空分类
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="h-10 rounded-xl px-5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void renameCategory()}
            disabled={loading || !canRename}
            className="h-10 rounded-xl px-6 text-[13px] font-semibold shadow-[0_8px_18px_-14px_var(--paper-shadow)] transition-all active:scale-[0.98]"
          >
            <Pencil className="h-4 w-4" />
            {loading ? '保存中...' : '重命名'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
