'use client';

import { useEffect, useRef, useState } from 'react';
import { Category } from '@/lib/api';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';

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

  function checkScroll() {
    const el = containerRef.current;
    if (!el) return;

    setShowLeftGradient(el.scrollLeft > 0);
    setShowRightGradient(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();

    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);

    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, []);

  function isLightColor(color: string) {
    const hex = color.replace('#', '');
    if (hex.length !== 6) return false;

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.68;
  }

  function getCategoryClassName(isSelected: boolean) {
    if (isSelected) {
      return 'text-white shadow-sm';
    }

    return 'bg-background/92 border border-border/70 hover:bg-muted hover:border-border hover:shadow-[0_8px_18px_-18px_rgba(15,23,42,0.16)]';
  }

  return (
    <div className="relative -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" ref={containerRef} onScroll={checkScroll}>
      <div className={`pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity duration-200 [mask-image:linear-gradient(to_right,black,transparent)] ${showLeftGradient ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 [mask-image:linear-gradient(to_left,black,transparent)] ${showRightGradient ? 'opacity-100' : 'opacity-0'}`} />
      <div className="flex min-w-max gap-2">
      <button
        onClick={() => onSelectCategory(null)}
        className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-all duration-200 ${
          selectedCategoryId === null
            ? 'bg-foreground text-background'
            : getCategoryClassName(false)
        }`}
      >
        全部 ({bookCounts.all || 0})
      </button>
      <button
        onClick={() => onSelectCategory(UNCATEGORIZED_FILTER_ID)}
        className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-all duration-200 ${
          selectedCategoryId === UNCATEGORIZED_FILTER_ID
            ? 'bg-foreground text-background'
            : getCategoryClassName(false)
        }`}
      >
        未分类 ({bookCounts[UNCATEGORIZED_FILTER_ID] || 0})
      </button>
      {categories.map((category) => {
        const isSelected = selectedCategoryId === category.id;

        return (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={`inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-all duration-200 ${
              isSelected
                ? isLightColor(category.color)
                  ? 'text-foreground'
                  : 'text-white'
                : getCategoryClassName(false)
            }`}
            style={{
              backgroundColor: isSelected ? category.color : undefined,
            }}
          >
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
            {category.name} ({bookCounts[category.id] || 0})
          </button>
        );
      })}
      </div>
    </div>
  );
}
