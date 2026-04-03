'use client';

import { useEffect, useRef, useState } from 'react';
import { Category } from '@/lib/api';

const UNCATEGORIZED_FILTER_ID = 'uncategorized';
const MAX_CATEGORY_LABEL_LENGTH = 6;

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

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedCategoryId]);

  function getCategoryClassName(isSelected: boolean, isRoot: boolean) {
    if (isSelected) {
      return isRoot
        ? 'text-foreground'
        : 'text-foreground';
    }

    return isRoot
      ? 'text-foreground/76 hover:text-foreground'
      : 'text-foreground/55 hover:text-foreground/82';
  }

  return (
    <div
      className="relative overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      ref={containerRef}
      onScroll={checkScroll}
    >
      <div className={`pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-6 bg-gradient-to-r from-background via-background/90 to-transparent transition-opacity duration-200 ${showLeftGradient ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-6 bg-gradient-to-l from-background via-background/90 to-transparent transition-opacity duration-200 ${showRightGradient ? 'opacity-100' : 'opacity-0'}`} />
      <div className="min-w-max border-b border-border/50 px-1 pr-6 pb-0.5 whitespace-nowrap">
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
              className={`inline-block snap-start ${index > 0 ? 'ml-4' : ''}`}
            >
              <button
                ref={isSelected ? activeItemRef : null}
                onClick={() => onSelectCategory(item.id)}
                className={`inline-flex h-11 items-center border-b-2 px-0.5 text-[13px] font-medium tracking-[-0.01em] transition-[color,border-color] duration-200 cursor-pointer ${
                  isSelected ? 'border-foreground' : 'border-transparent'
                } ${getCategoryClassName(isSelected, isRoot)}`}
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
