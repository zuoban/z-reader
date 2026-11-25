'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface BatchResult {
  successCount: number;
}

interface UseShelfSelectionOptions {
  filteredBookIds: string[];
  isBatchBusy: boolean;
  externalDialogOpen: boolean;
  onDeleteMany: (ids: string[]) => Promise<BatchResult>;
  onUpdateCategoryMany: (ids: string[], category: string | null) => Promise<BatchResult>;
}

export function useShelfSelection({
  filteredBookIds,
  isBatchBusy,
  externalDialogOpen,
  onDeleteMany,
  onUpdateCategoryMany,
}: UseShelfSelectionOptions) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(() => new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchCategoryOpen, setBatchCategoryOpen] = useState(false);

  const selectedExistingIds = useMemo(
    () => filteredBookIds.filter((id) => selectedBookIds.has(id)),
    [filteredBookIds, selectedBookIds]
  );
  const selectedCount = selectedExistingIds.length;
  const allVisibleSelected =
    filteredBookIds.length > 0 && filteredBookIds.every((id) => selectedBookIds.has(id));

  useEffect(() => {
    if (
      !selectionMode ||
      isBatchBusy ||
      batchDeleteOpen ||
      batchCategoryOpen ||
      externalDialogOpen
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        document.querySelector(
          '[role="menu"]:not([aria-hidden="true"]):not([hidden]), [role="dialog"]:not([aria-hidden="true"]):not([hidden]), [role="alertdialog"]:not([aria-hidden="true"]):not([hidden])'
        )
      ) {
        return;
      }
      setSelectionMode(false);
      setSelectedBookIds(new Set());
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionMode, isBatchBusy, batchDeleteOpen, batchCategoryOpen, externalDialogOpen]);

  const toggleBookSelection = useCallback((bookId: string) => {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  }, []);

  function clearSelectionWhenFiltering() {
    if (selectionMode && selectedBookIds.size > 0) {
      setSelectedBookIds(new Set());
    }
  }

  function toggleSelectionMode() {
    if (isBatchBusy) return;
    setSelectionMode((enabled) => {
      if (enabled) {
        setSelectedBookIds(new Set());
        setBatchDeleteOpen(false);
        setBatchCategoryOpen(false);
      }
      return !enabled;
    });
  }

  function toggleVisibleSelection() {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredBookIds.forEach((id) => next.delete(id));
      } else {
        filteredBookIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function confirmBatchDelete() {
    const result = await onDeleteMany(selectedExistingIds);
    if (result.successCount > 0) {
      setSelectedBookIds(new Set());
      setSelectionMode(false);
    }
    setBatchDeleteOpen(false);
  }

  async function saveBatchCategory(category: string | null) {
    const result = await onUpdateCategoryMany(selectedExistingIds, category);
    if (result.successCount > 0) {
      setSelectedBookIds(new Set());
      setSelectionMode(false);
      setBatchCategoryOpen(false);
    }
  }

  return {
    selectionMode,
    selectedBookIds,
    selectedCount,
    allVisibleSelected,
    batchDeleteOpen,
    setBatchDeleteOpen,
    batchCategoryOpen,
    setBatchCategoryOpen,
    toggleBookSelection,
    clearSelectionWhenFiltering,
    toggleSelectionMode,
    toggleVisibleSelection,
    confirmBatchDelete,
    saveBatchCategory,
  };
}
