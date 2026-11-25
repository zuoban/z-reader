'use client';

import dynamic from 'next/dynamic';

const BatchCategorySheet = dynamic(
  () => import('@/components/BatchCategorySheet').then((module) => module.BatchCategorySheet),
  { ssr: false }
);
const CategoryManagerSheet = dynamic(
  () => import('@/components/CategoryManagerSheet').then((module) => module.CategoryManagerSheet),
  { ssr: false }
);
const ConfirmDialog = dynamic(
  () => import('@/components/ConfirmDialog').then((module) => module.ConfirmDialog),
  { ssr: false }
);
const OfflineBooksDialog = dynamic(
  () => import('@/components/OfflineBooksDialog').then((module) => module.OfflineBooksDialog),
  { ssr: false }
);

export interface ShelfDialogsProps {
  selectedCount: number;
  categories: string[];
  bookCounts: Record<string, number>;
  batchDeleteOpen: boolean;
  onBatchDeleteOpenChange: (open: boolean) => void;
  isDeletingMany: boolean;
  onConfirmBatchDelete: () => Promise<void>;
  batchCategoryOpen: boolean;
  onBatchCategoryOpenChange: (open: boolean) => void;
  isUpdatingManyCategories: boolean;
  onSaveBatchCategory: (category: string | null) => Promise<void>;
  categoryManagerOpen: boolean;
  onCategoryManagerOpenChange: (open: boolean) => void;
  onRenameCategory: (category: string, nextCategory: string | null) => Promise<void>;
  offlineBooksOpen: boolean;
  onOfflineBooksOpenChange: (open: boolean) => void;
}

export function ShelfDialogs({
  selectedCount,
  categories,
  bookCounts,
  batchDeleteOpen,
  onBatchDeleteOpenChange,
  isDeletingMany,
  onConfirmBatchDelete,
  batchCategoryOpen,
  onBatchCategoryOpenChange,
  isUpdatingManyCategories,
  onSaveBatchCategory,
  categoryManagerOpen,
  onCategoryManagerOpenChange,
  onRenameCategory,
  offlineBooksOpen,
  onOfflineBooksOpenChange,
}: ShelfDialogsProps) {
  return (
    <>
      {batchDeleteOpen && (
        <ConfirmDialog
          open
          onOpenChange={onBatchDeleteOpenChange}
          title="删除所选图书"
          description={`确定删除选中的 ${selectedCount} 本图书吗？删除后将无法恢复。`}
          confirmLabel={isDeletingMany ? '删除中…' : '确认删除'}
          confirmDisabled={selectedCount === 0 || isDeletingMany}
          loading={isDeletingMany}
          onConfirm={onConfirmBatchDelete}
        />
      )}
      {batchCategoryOpen && (
        <BatchCategorySheet
          open
          onOpenChange={onBatchCategoryOpenChange}
          selectedCount={selectedCount}
          categories={categories}
          bookCounts={bookCounts}
          loading={isUpdatingManyCategories}
          onSave={onSaveBatchCategory}
        />
      )}
      {categoryManagerOpen && (
        <CategoryManagerSheet
          open
          onOpenChange={onCategoryManagerOpenChange}
          categories={categories}
          bookCounts={bookCounts}
          loading={isUpdatingManyCategories}
          onRenameCategory={onRenameCategory}
        />
      )}
      {offlineBooksOpen && (
        <OfflineBooksDialog open onOpenChange={onOfflineBooksOpenChange} />
      )}
    </>
  );
}
