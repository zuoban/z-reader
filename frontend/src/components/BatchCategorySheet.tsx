'use client';

import { CategoryPickerModal } from '@/components/CategoryPickerModal';

interface BatchCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  categories: string[];
  bookCounts: Record<string, number>;
  loading?: boolean;
  onSave: (category: string | null) => void | Promise<void>;
}

export function BatchCategorySheet({
  open,
  onOpenChange,
  selectedCount,
  categories,
  bookCounts,
  loading = false,
  onSave,
}: BatchCategorySheetProps) {
  return (
    <CategoryPickerModal
      open={open}
      onOpenChange={onOpenChange}
      title="批量设置分类"
      subtitle={`将对已选择的 ${selectedCount} 本图书生效`}
      categories={categories}
      bookCounts={bookCounts}
      listVariant="chips"
      loading={loading}
      zIndex={90}
      returnFocus={false}
      showClearButton
      clearLabel="清空分类"
      clearingLabel="清空中…"
      isSaveDisabled={(selectedCategory) => !selectedCategory}
      onSave={(category) => onSave(category)}
    />
  );
}
