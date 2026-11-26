'use client';

import { toast } from 'sonner';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { api } from '@/lib/api';

interface CategorySelectorProps {
  bookId: string;
  currentCategory?: string;
  categories: string[];
  bookCounts: Record<string, number>;
  onUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategorySelector({
  bookId,
  currentCategory,
  categories,
  bookCounts,
  onUpdate,
  open,
  onOpenChange,
}: CategorySelectorProps) {
  const normalizedCurrentCategory = currentCategory?.trim() || null;
  const filteredCategories = Array.from(
    new Set(categories.map((category) => category.trim()).filter(Boolean))
  ).filter((cat) => (bookCounts[cat] || 0) > 0 || cat === normalizedCurrentCategory);

  async function handleSave(nextCategory: string | null) {
    if (nextCategory !== null && nextCategory.length > 50) {
      toast.error('分类名称不能超过 50 个字符');
      return;
    }

    try {
      await api.updateBook(bookId, { category: nextCategory });
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '设置分类失败');
    }
  }

  return (
    <CategoryPickerModal
      open={open}
      onOpenChange={onOpenChange}
      title="设置分类"
      subtitle={
        normalizedCurrentCategory
          ? `当前分类：${normalizedCurrentCategory}`
          : '将此书归入分类，便于整理查找'
      }
      initialCategory={normalizedCurrentCategory}
      categories={filteredCategories}
      bookCounts={bookCounts}
      listVariant="list"
      showClearButton={Boolean(normalizedCurrentCategory)}
      clearLabel="移除分类"
      clearingLabel="移除中…"
      willClearMessage={(_trimmed, selectedCategory) =>
        normalizedCurrentCategory && !selectedCategory
          ? `保存后将移除当前分类「${normalizedCurrentCategory}」`
          : null
      }
      isSaveDisabled={(selectedCategory) => selectedCategory === normalizedCurrentCategory}
      onSave={(category) => handleSave(category)}
    />
  );
}
