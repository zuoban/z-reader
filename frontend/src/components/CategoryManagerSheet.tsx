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
        showCloseButton={false}
        finalFocus={false}
        className="mx-auto bottom-[max(env(safe-area-inset-bottom,0px),0.75rem)] left-3 right-3 flex max-h-[min(86svh,38rem)] flex-col rounded-3xl border border-border/65 bg-popover/98 p-0 shadow-[0_24px_70px_-40px_var(--paper-shadow),0_10px_32px_-28px_var(--paper-shadow-soft)] ring-1 ring-white/45 backdrop-blur-md dark:ring-white/10 sm:bottom-10 sm:left-1/2 sm:right-auto sm:max-w-[420px] sm:-translate-x-1/2"
      >
        <SheetHeader className="relative shrink-0 border-b border-border/55 bg-transparent px-5 pb-4 pt-5 pr-16 shadow-none sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/14 bg-primary/8 text-primary">
              <Tag className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-[19px] font-semibold tracking-tight">
                管理分类
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs font-medium leading-5 text-muted-foreground">
                重命名分类，或从图书中清空某个分类
              </SheetDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/62 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </SheetHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
          {normalizedCategories.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-border/55 bg-muted/28 px-6 text-center">
              <Tag className="h-9 w-9 text-primary/55" />
              <p className="mt-3 font-heading text-xl font-semibold">还没有分类</p>
              <p className="mt-1 text-sm text-muted-foreground">给图书设置分类后，这里会显示管理入口。</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                    选择分类
                  </p>
                  <span className="text-[10px] font-medium text-muted-foreground/45">
                    {normalizedCategories.length} 个
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {normalizedCategories.map((category) => {
                    const active = selectedCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => chooseCategory(category)}
                        disabled={loading}
                        className={cn(
                          'inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-border/65 bg-background/58 px-3 py-1.5 text-left text-[13px] font-semibold text-muted-foreground shadow-[inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_35%,transparent)] transition-colors disabled:cursor-not-allowed disabled:opacity-55',
                          active && 'border-primary/45 bg-primary/10 text-primary'
                        )}
                        title={category}
                      >
                        {active ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Tag className="h-3.5 w-3.5 shrink-0 opacity-55" />
                        )}
                        <span className="truncate">{category}</span>
                        <span className="rounded-full bg-foreground/8 px-1.5 py-0.5 text-[10px] font-bold tabular-nums opacity-65">
                          {bookCounts[category] || 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-border/55 bg-muted/28 p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
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
                    className="h-11 rounded-xl border-border/70 bg-background/72 pr-10 text-sm shadow-none focus-visible:border-primary/45 focus-visible:ring-primary/12 disabled:opacity-60"
                  />
                  {nextCategory && (
                    <button
                      type="button"
                      onClick={() => setNextCategory('')}
                      className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/45 transition-colors hover:bg-card/70 hover:text-muted-foreground"
                      title="清空输入"
                      aria-label="清空输入"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {selectedCategory && (
                  <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
                    将影响 {selectedCount} 本图书。
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border/55 bg-background/40 px-5 py-3.5 sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6">
          <Button
            type="button"
            variant="destructive"
            onClick={() => void clearCategory()}
            disabled={loading || !selectedCategory}
            className="h-10 rounded-xl bg-destructive/8 px-4 text-[13px] font-medium text-destructive hover:bg-destructive/12"
          >
            <Trash2 className="h-4 w-4" />
            清空分类
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="h-10 rounded-xl px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground sm:order-2"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void renameCategory()}
            disabled={loading || !canRename}
            className="h-10 rounded-xl px-6 text-[13px] font-semibold shadow-[0_8px_18px_-14px_var(--paper-shadow)] transition-all active:scale-[0.98] sm:order-3"
          >
            <Pencil className="h-4 w-4" />
            {loading ? '保存中...' : '重命名'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
