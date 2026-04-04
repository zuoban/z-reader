'use client';

import { useEffect, useRef, useState } from 'react';
import { Category } from '@/lib/api';
import { cn } from '@/lib/utils';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const MAX_CATEGORY_LABEL_LENGTH = 8;

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
    ...categories.map((category) => ({
      id: category.id,
      label: category.name,
      color: category.color,
      count: bookCounts[category.id] || 0,
      isRoot: false,
    })),
  ];

  return (
    <div className="relative w-full">
      {/* 左侧渐变指示器 */}
      <div
        className={cn(
          'pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-background via-background/95 to-transparent transition-opacity duration-300',
          showLeftGradient ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* 右侧渐变指示器 */}
      <div
        className={cn(
          'pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background via-background/95 to-transparent transition-opacity duration-300',
          showRightGradient ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* 筛选标签容器 */}
      <div
        className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        ref={containerRef}
        onScroll={checkScroll}
      >
        <div className="flex min-w-max items-center gap-1.5 px-2 pb-3 pt-1">
          {filterItems.map((item, index) => {
            const isSelected = selectedCategoryId === item.id;

            return (
              <button
                key={item.id ?? 'all'}
                ref={isSelected ? activeItemRef : null}
                onClick={() => onSelectCategory(item.id)}
                className={cn(
                  'group relative flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isSelected
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                {/* 颜色指示点 */}
                {item.color && (
                  <span
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full border border-white/30 shadow-sm transition-transform',
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
                        ? 'bg-background/20 text-background'
                        : 'bg-muted text-muted-foreground group-hover:bg-muted-foreground/10'
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
