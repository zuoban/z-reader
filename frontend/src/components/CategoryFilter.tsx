'use client';

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

    return 'bg-background border border-border/70 hover:bg-muted hover:border-border hover:shadow-[0_8px_18px_-18px_rgba(15,23,42,0.16)]';
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelectCategory(null)}
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
          selectedCategoryId === null
            ? 'bg-foreground text-background'
            : getCategoryClassName(false)
        }`}
      >
        全部 ({bookCounts.all || 0})
      </button>
      <button
        onClick={() => onSelectCategory(UNCATEGORIZED_FILTER_ID)}
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
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
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
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
  );
}
