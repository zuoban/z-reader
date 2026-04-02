'use client';

import { Sparkles } from 'lucide-react';
import { Category } from '@/lib/api';

interface CategoryFilterProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  onDropBook: (bookId: string, categoryId: string | null) => void;
  onDragTargetChange: (categoryId: string | null) => void;
  draggedBookOriginalCategoryId?: string | null;
  bookCounts: Record<string, number>;
  dragOverCategoryId?: string | null;
}

export function CategoryFilter({
  categories,
  selectedCategoryId,
  onSelectCategory,
  onDropBook,
  onDragTargetChange,
  draggedBookOriginalCategoryId,
  bookCounts,
  dragOverCategoryId,
}: CategoryFilterProps) {
  function isLightColor(color: string) {
    const hex = color.replace('#', '');
    if (hex.length !== 6) return false;

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.68;
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>, categoryId: string | null) {
    e.preventDefault();
    const bookId = e.dataTransfer.getData('application/x-z-reader-book-id') || e.dataTransfer.getData('text/plain');
    if (!bookId) return;
    onDropBook(bookId, categoryId);
  }

  function getCategoryClassName(
    isSelected: boolean,
    isTarget: boolean,
    isAll: boolean = false
  ) {
    if (isSelected) {
      return 'text-white shadow-sm';
    }

    if (isTarget) {
      return isAll
        ? 'border border-foreground/35 bg-foreground/12 ring-2 ring-foreground/20 shadow-[0_10px_24px_-18px_rgba(23,23,23,0.35)] translate-y-[-1px] scale-[1.01]'
        : 'border border-foreground/35 bg-foreground/12 ring-2 ring-foreground/20 shadow-[0_10px_24px_-18px_rgba(23,23,23,0.35)] translate-y-[-1px] scale-[1.01]';
    }

    return 'bg-background border border-border/70 hover:bg-muted hover:border-border hover:shadow-[0_8px_18px_-18px_rgba(15,23,42,0.16)]';
  }

  function isBlockedCategory(categoryId: string) {
    return draggedBookOriginalCategoryId !== null && draggedBookOriginalCategoryId === categoryId;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelectCategory(null)}
        onDragEnter={() => onDragTargetChange('all')}
        onDragLeave={() => onDragTargetChange(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          handleDrop(e, null);
          onDragTargetChange(null);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
          selectedCategoryId === null
            ? 'bg-foreground text-background'
            : getCategoryClassName(false, dragOverCategoryId === 'all', true)
        }`}
      >
        {dragOverCategoryId === 'all' && selectedCategoryId !== null && (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        全部 ({bookCounts['all'] || 0})
        {dragOverCategoryId === 'all' && selectedCategoryId !== null && (
          <span className="ml-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
            松开归类
          </span>
        )}
      </button>
      {categories.map((cat) => (
        (() => {
          const blocked = isBlockedCategory(cat.id);
          const isTarget = dragOverCategoryId === cat.id && !blocked;

          return (
        <button
          key={cat.id}
          onClick={() => onSelectCategory(cat.id)}
          onDragEnter={() => {
            if (!blocked) onDragTargetChange(cat.id);
          }}
          onDragLeave={() => onDragTargetChange(null)}
          onDragOver={(e) => {
            if (!blocked) e.preventDefault();
          }}
          onDrop={(e) => {
            if (blocked) {
              onDragTargetChange(null);
              return;
            }
            handleDrop(e, cat.id);
            onDragTargetChange(null);
          }}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
            selectedCategoryId === cat.id
              ? isLightColor(cat.color)
                ? 'text-foreground'
                : 'text-white'
              : blocked
                ? 'cursor-not-allowed border border-dashed border-border/70 bg-muted/40 text-muted-foreground opacity-55'
                : getCategoryClassName(false, isTarget)
          }`}
          style={{
            backgroundColor: selectedCategoryId === cat.id ? cat.color : undefined,
            boxShadow:
              isTarget && selectedCategoryId !== cat.id
                ? `0 0 0 1px ${cat.color}66, 0 10px 24px -18px ${cat.color}66`
                : undefined,
          }}
          aria-disabled={blocked}
        >
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
          {cat.name} ({bookCounts[cat.id] || 0})
          {blocked ? (
            <span className="ml-1 rounded-full border border-border/60 bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              原分类
            </span>
          ) : isTarget && selectedCategoryId !== cat.id ? (
            <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
              松开归类
            </span>
          ) : null}
        </button>
          );
        })()
      ))}
    </div>
  );
}
