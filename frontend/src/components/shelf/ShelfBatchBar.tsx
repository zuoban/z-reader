'use client';

import { ActionIcon, Button } from '@mantine/core';
import { CheckSquare, Loader2, Tag, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ShelfBatchBarProps {
  selectedCount: number;
  allVisibleSelected: boolean;
  hasMoreBooks: boolean;
  isBatchBusy: boolean;
  isDeletingMany: boolean;
  isUpdatingManyCategories: boolean;
  onToggleSelectionMode: () => void;
  onToggleVisibleSelection: () => void;
  onOpenBatchCategory: () => void;
  onOpenBatchDelete: () => void;
}

export function ShelfBatchBar({
  selectedCount,
  allVisibleSelected,
  hasMoreBooks,
  isBatchBusy,
  isDeletingMany,
  isUpdatingManyCategories,
  onToggleSelectionMode,
  onToggleVisibleSelection,
  onOpenBatchCategory,
  onOpenBatchDelete,
}: ShelfBatchBarProps) {
  return (
    <div className="pointer-events-none fixed left-[max(1rem,env(safe-area-inset-left,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-50 mx-auto max-w-[52rem] sm:left-[max(2rem,env(safe-area-inset-left,0px))] sm:right-[max(2rem,env(safe-area-inset-right,0px))] lg:left-auto lg:right-[max(2.5rem,env(safe-area-inset-right,0px))] lg:max-w-[44rem]">
      <div
        role="region"
        aria-label="书籍批量操作"
        className="shelf-batch-bar paper-reveal-soft pointer-events-auto flex flex-col gap-2.5 rounded-2xl px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
      >
        <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto">
          <div className="flex items-center gap-2 whitespace-nowrap text-sm">
            <CheckSquare
              className="h-4 w-4 shrink-0 text-primary"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">已选中</span>
            <span
              className={cn(
                'inline-flex min-w-[3.25rem] items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors',
                selectedCount > 0
                  ? 'bg-primary/10 text-primary'
                  : 'bg-secondary text-muted-foreground'
              )}
              aria-live="polite"
            >
              {selectedCount} 本
            </span>
          </div>
          <ActionIcon
            type="button"
            variant="subtle"
            color="gray"
            size="md"
            disabled={isBatchBusy}
            className="h-11 w-11 min-h-0 min-w-0 cursor-pointer rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-95 motion-reduce:active:scale-100 sm:hidden"
            onClick={onToggleSelectionMode}
            aria-label="退出选择"
            title="退出选择"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        </div>

        <div className="grid w-full min-w-0 grid-cols-3 gap-2 border-t border-border/70 pt-2.5 sm:flex sm:w-auto sm:flex-1 sm:items-center sm:justify-end sm:border-t-0 sm:pt-0">
          <Button
            type="button"
            variant="default"
            size="xs"
            disabled={isBatchBusy}
            className="min-h-11 min-w-0 cursor-pointer rounded-lg border-border px-2 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 hover:bg-secondary active:scale-[0.98] motion-reduce:active:scale-100 sm:min-h-9 sm:px-3 sm:text-[13px]"
            onClick={onToggleVisibleSelection}
          >
            {allVisibleSelected ? '取消全选' : hasMoreBooks ? '选择已加载' : '全选'}
          </Button>

          <Button
            type="button"
            variant="default"
            size="xs"
            aria-label="批量分类"
            aria-busy={isUpdatingManyCategories || undefined}
            leftSection={
              isUpdatingManyCategories ? (
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : (
                <Tag className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
              )
            }
            className="min-h-11 min-w-0 cursor-pointer rounded-lg border-primary/25 bg-primary/8 px-2 text-xs font-medium text-primary transition-[background-color,border-color,color,transform] duration-150 hover:bg-primary/14 active:scale-[0.98] motion-reduce:active:scale-100 sm:min-h-9 sm:px-3 sm:text-[13px]"
            disabled={selectedCount === 0 || isBatchBusy}
            onClick={onOpenBatchCategory}
          >
            <span className="hidden sm:inline">
              {isUpdatingManyCategories ? '更新中…' : '批量分类'}
            </span>
            <span className="sm:hidden">{isUpdatingManyCategories ? '更新中' : '分类'}</span>
          </Button>

          <Button
            type="button"
            variant="default"
            size="xs"
            aria-label="批量删除"
            aria-busy={isDeletingMany || undefined}
            leftSection={
              isDeletingMany ? (
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : (
                <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
              )
            }
            className="min-h-11 min-w-0 cursor-pointer rounded-lg border-border px-2 text-xs font-medium text-destructive transition-[background-color,border-color,color,transform] duration-150 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98] motion-reduce:active:scale-100 sm:min-h-9 sm:px-3 sm:text-[13px]"
            disabled={selectedCount === 0 || isBatchBusy}
            onClick={onOpenBatchDelete}
          >
            <span className="hidden sm:inline">{isDeletingMany ? '删除中…' : '批量删除'}</span>
            <span className="sm:hidden">{isDeletingMany ? '删除中' : '删除'}</span>
          </Button>

          <ActionIcon
            type="button"
            variant="subtle"
            color="gray"
            size="md"
            disabled={isBatchBusy}
            className="ml-0.5 hidden min-h-0 min-w-0 cursor-pointer rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-95 motion-reduce:active:scale-100 sm:flex sm:size-9"
            onClick={onToggleSelectionMode}
            aria-label="退出选择"
            title="退出选择（Esc）"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        </div>
      </div>
    </div>
  );
}
