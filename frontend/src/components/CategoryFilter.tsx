'use client';

import { useEffect, useRef, useState } from 'react';
import { Category } from '@/lib/api';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const MAX_CATEGORY_LABEL_LENGTH = 6;

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

  function getCategoryClassName(isSelected: boolean, isRoot: boolean) {
    if (isSelected) {
      return isRoot
        ? 'text-foreground'
        : 'text-foreground';
    }

    return isRoot
      ? 'text-foreground/72 hover:text-foreground'
      : 'text-foreground/52 hover:text-foreground/82';
  }

  return (
    <div
      className="relative -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      ref={containerRef}
      onScroll={checkScroll}
    >
      <div className={`pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity duration-200 [mask-image:linear-gradient(to_right,black,transparent)] ${showLeftGradient ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 [mask-image:linear-gradient(to_left,black,transparent)] ${showRightGradient ? 'opacity-100' : 'opacity-0'}`} />
      <div className="min-w-max whitespace-nowrap">
        {[
          {
            id: null,
            label: truncateLabel('全部'),
            color: null,
          },
          {
            id: UNCATEGORIZED_FILTER_ID,
            label: truncateLabel('未分类'),
            color: null,
          },
          ...categories.map((category) => ({
            id: category.id,
            label: truncateLabel(category.name),
            color: category.color,
          })),
        ].map((item, index) => {
          const isSelected = selectedCategoryId === item.id;
          const isRoot = item.id === null;

          return (
            <span
              key={`${item.id ?? 'all'}-${index}`}
              className={`inline-block ${index > 0 ? 'ml-3' : ''}`}
            >
              <button
                onClick={() => onSelectCategory(item.id)}
                className={`inline-block whitespace-nowrap py-1 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-200 ${getCategoryClassName(isSelected, isRoot)}`}
                style={{
                  color: isSelected && item.color ? item.color : undefined,
                }}
              >
                {item.label}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
  function truncateLabel(label: string) {
    return label.length > MAX_CATEGORY_LABEL_LENGTH
      ? `${label.slice(0, MAX_CATEGORY_LABEL_LENGTH)}...`
      : label;
  }
