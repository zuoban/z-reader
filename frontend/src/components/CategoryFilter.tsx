'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Category } from '@/lib/api';
import { cn } from '@/lib/utils';

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
      count: totalBooks,
      isRoot: true,
    },
    {
      id: UNCATEGORIZED_FILTER_ID,
      label: '未分类',
      count: uncategorizedBooks,
      isRoot: true,
    },
    ...categories
      .map((category) => ({
        id: category.id,
        label: category.name,
        count: bookCounts[category.id] || 0,
        isRoot: false,
      }))
      .filter((item) => item.count > 0),
  ];
  const edgeFadeWidth = 24;
  const scrollMask = (() => {
    if (showLeftGradient && showRightGradient) {
      return `linear-gradient(to right, transparent 0, black ${edgeFadeWidth}px, black calc(100% - ${edgeFadeWidth}px), transparent 100%)`;
    }

    if (showLeftGradient) {
      return `linear-gradient(to right, transparent 0, black ${edgeFadeWidth}px, black 100%)`;
    }

    if (showRightGradient) {
      return `linear-gradient(to right, black 0, black calc(100% - ${edgeFadeWidth}px), transparent 100%)`;
    }

    return undefined;
  })();
  const scrollMaskStyle = {
    maskImage: scrollMask,
    WebkitMaskImage: scrollMask,
  } as CSSProperties;

  return (
    <div className="relative w-full">
      {/* 筛选标签容器 */}
      <div
        className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        ref={containerRef}
        onScroll={checkScroll}
        style={scrollMaskStyle}
      >
        <div
          role="tablist"
          aria-label="书籍分类筛选"
          className="inline-flex min-w-max items-center gap-1 rounded-full border border-border/60 bg-muted/35 p-1.5"
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
                  'inline-flex h-9 items-center gap-2 rounded-xl px-4 py-1 text-[13px] font-medium transition-all duration-200',
                  isSelected
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                )}
              >
                <span>{truncateLabel(item.label)}</span>
                {item.count > 0 && (
                  <span
                    className={cn(
                      'inline-flex min-w-[1.45rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
                      isSelected
                        ? 'bg-foreground text-background'
                        : 'bg-muted-foreground/20 text-muted-foreground'
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
