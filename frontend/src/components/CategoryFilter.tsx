'use client';

import { useEffect, useRef, useState } from 'react';
import { Category } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getCategoryColor } from '@/lib/categoryColors';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const MAX_CATEGORY_LABEL_LENGTH = 12;

function truncateLabel(label: string) {
  return label.length > MAX_CATEGORY_LABEL_LENGTH
    ? `${label.slice(0, MAX_CATEGORY_LABEL_LENGTH)}...`
    : label;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  bookCounts: Record<string, number>;
}

export function CategoryFilter({
  categories,
  selectedCategoryId,
  onSelectCategory,
  bookCounts,
}: CategoryFilterProps) {
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  // 计算总书籍数和未分类书籍数
  const totalBooks = bookCounts.all ?? 0;
  const uncategorizedBooks = bookCounts[UNCATEGORIZED_FILTER_ID] ?? 0;

  function checkScroll() {
    const el = containerRef.current;
    if (!el) return;

    const hasLeftScroll = el.scrollLeft > 0;
    const hasRightScroll = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
    setShowLeftGradient(hasLeftScroll);
    setShowRightGradient(hasRightScroll);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();

    el.addEventListener('scroll', checkScroll);
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', checkScroll);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedCategoryId]);

  const filterItems = [
    {
      id: null,
      label: '全部',
      color: null,
      count: totalBooks,
      isRoot: true,
    },
    {
      id: UNCATEGORIZED_FILTER_ID,
      label: '未分类',
      color: null,
      count: uncategorizedBooks,
      isRoot: true,
    },
    ...categories
      .map((category, index) => ({
        id: category.id,
        label: category.name,
        color: getCategoryColor(index + 1),
        count: bookCounts[category.id] || 0,
        isRoot: false,
      }))
      .filter((item) => item.count > 0),
  ];

  return (
    <div className="relative w-full">
      {/* 左侧渐变指示器 */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-10 bg-gradient-to-r from-background/0 via-background/80 to-background transition-opacity duration-300',
          showLeftGradient ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* 右侧渐变指示器 */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-10 bg-gradient-to-l from-background/0 via-background/80 to-background transition-opacity duration-300',
          showRightGradient ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* 筛选标签容器 */}
      <div
        className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        ref={containerRef}
        onScroll={checkScroll}
      >
        <div
          role="tablist"
          aria-label="书籍分类筛选"
          className="flex min-w-max items-center gap-1 px-1 py-1.5"
        >
          {filterItems.map((item) => {
            const isSelected = selectedCategoryId === item.id;

            return (
              <button
                key={item.id ?? 'all'}
                ref={isSelected ? activeItemRef : null}
                onClick={() => onSelectCategory(item.id)}
                role="tab"
                aria-selected={isSelected}
                className={cn(
                  'group relative flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium cursor-pointer transition-all duration-200',
                  isSelected
                    ? 'bg-primary/12 text-primary ring-1 ring-primary/20 dark:bg-primary/20 dark:ring-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                )}
              >
                {/* 颜色指示点 */}
                {item.color && (
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      isSelected ? 'scale-110' : 'group-hover:scale-110'
                    )}
                    style={{ backgroundColor: item.color }}
                  />
                )}

                {/* 标签文字 */}
                <span className={cn(isSelected && 'font-semibold')}>
                  {truncateLabel(item.label)}
                </span>

                {/* 书籍数量徽章 */}
                {item.count > 0 && (
                  <span
                    className={cn(
                      'flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-medium transition-colors',
                      isSelected
                        ? 'bg-muted/80 text-muted-foreground'
                        : 'text-muted-foreground/70'
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
