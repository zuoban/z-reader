'use client';

import { Category } from '@/lib/api';

interface CategoryFilterProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  bookCounts: Record<string, number>;
}

export function CategoryFilter({ categories, selectedCategoryId, onSelectCategory, bookCounts }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelectCategory(null)}
        className={`rounded-full px-4 py-1.5 text-sm transition-all ${
          selectedCategoryId === null
            ? 'bg-foreground text-background'
            : 'bg-background border border-border/70 hover:bg-muted'
        }`}
      >
        全部 ({bookCounts['all'] || 0})
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelectCategory(cat.id)}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-all ${
            selectedCategoryId === cat.id
              ? 'text-background'
              : 'bg-background border border-border/70 hover:bg-muted'
          }`}
          style={{
            backgroundColor: selectedCategoryId === cat.id ? cat.color : undefined,
          }}
        >
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
          {cat.name} ({bookCounts[cat.id] || 0})
        </button>
      ))}
    </div>
  );
}
