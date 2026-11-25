import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShelfSelection } from './useShelfSelection';

describe('useShelfSelection', () => {
  const onDeleteMany = vi.fn<(ids: string[]) => Promise<{ successCount: number }>>();
  const onUpdateCategoryMany = vi.fn<
    (ids: string[], category: string | null) => Promise<{ successCount: number }>
  >();

  const defaultOptions = {
    filteredBookIds: ['book-1', 'book-2', 'book-3'],
    isBatchBusy: false,
    externalDialogOpen: false,
    onDeleteMany,
    onUpdateCategoryMany,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    onDeleteMany.mockResolvedValue({ successCount: 1 });
    onUpdateCategoryMany.mockResolvedValue({ successCount: 1 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('initializes with selection mode disabled and empty selection', () => {
    const { result } = renderHook(() => useShelfSelection(defaultOptions));

    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedBookIds.size).toBe(0);
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.allVisibleSelected).toBe(false);
    expect(result.current.batchDeleteOpen).toBe(false);
    expect(result.current.batchCategoryOpen).toBe(false);
  });

  it('toggles selection mode, resets dialogs/selection on exit, and blocks toggle while busy', () => {
    const { result, rerender } = renderHook(
      (props: typeof defaultOptions) => useShelfSelection(props),
      { initialProps: defaultOptions },
    );

    act(() => result.current.toggleSelectionMode());
    expect(result.current.selectionMode).toBe(true);

    act(() => {
      result.current.toggleBookSelection('book-1');
      result.current.setBatchDeleteOpen(true);
      result.current.setBatchCategoryOpen(true);
    });
    expect(result.current.selectedCount).toBe(1);

    // Blocked while batch operation is busy
    rerender({ ...defaultOptions, isBatchBusy: true });
    act(() => result.current.toggleSelectionMode());
    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedCount).toBe(1);

    // Exiting resets selection and closes batch dialogs
    rerender({ ...defaultOptions, isBatchBusy: false });
    act(() => result.current.toggleSelectionMode());
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedBookIds.size).toBe(0);
    expect(result.current.batchDeleteOpen).toBe(false);
    expect(result.current.batchCategoryOpen).toBe(false);
  });

  it('tracks individual and visible selection relative to filteredBookIds', () => {
    const { result, rerender } = renderHook(
      (props: typeof defaultOptions) => useShelfSelection(props),
      { initialProps: defaultOptions },
    );

    act(() => result.current.toggleBookSelection('book-1'));
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.allVisibleSelected).toBe(false);

    // Select all visible
    act(() => result.current.toggleVisibleSelection());
    expect(result.current.selectedCount).toBe(3);
    expect(result.current.allVisibleSelected).toBe(true);

    // Narrow filter: only book-1 and book-2 visible; book-3 remains in Set but excluded from count
    rerender({ ...defaultOptions, filteredBookIds: ['book-1', 'book-2'] });
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.allVisibleSelected).toBe(true);

    // Toggling visible when all visible are selected deselects only visible items
    act(() => result.current.toggleVisibleSelection());
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.allVisibleSelected).toBe(false);
    expect(result.current.selectedBookIds.has('book-3')).toBe(true);

    // Toggling an already selected book removes it
    act(() => result.current.toggleBookSelection('book-3'));
    expect(result.current.selectedBookIds.size).toBe(0);

    // Empty filtered list never counts as allVisibleSelected
    rerender({ ...defaultOptions, filteredBookIds: [] });
    expect(result.current.allVisibleSelected).toBe(false);
  });

  it('clears selection when filtering only while selectionMode is active and non-empty', () => {
    const { result } = renderHook(() => useShelfSelection(defaultOptions));

    act(() => result.current.toggleBookSelection('book-1'));
    const beforeSet = result.current.selectedBookIds;

    // selectionMode is false -> no-op
    act(() => result.current.clearSelectionWhenFiltering());
    expect(result.current.selectedBookIds).toBe(beforeSet);

    act(() => result.current.toggleSelectionMode());
    act(() => result.current.clearSelectionWhenFiltering());
    expect(result.current.selectedBookIds.size).toBe(0);

    // Empty selection -> no-op
    const emptySet = result.current.selectedBookIds;
    act(() => result.current.clearSelectionWhenFiltering());
    expect(result.current.selectedBookIds).toBe(emptySet);
  });

  it('exits selection mode on Escape unless blocked by state, inputs, or visible overlays', () => {
    const { result, rerender, unmount } = renderHook(
      (props: typeof defaultOptions) => useShelfSelection(props),
      { initialProps: defaultOptions },
    );

    const enterSelection = () => {
      act(() => {
        result.current.toggleSelectionMode();
        result.current.toggleBookSelection('book-1');
      });
    };

    enterSelection();

    // Non-Escape key ignored
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(result.current.selectionMode).toBe(true);

    // Composing / defaultPrevented ignored
    const prevented = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    prevented.preventDefault();
    act(() => {
      window.dispatchEvent(prevented);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true }));
    });
    expect(result.current.selectionMode).toBe(true);

    // Input, textarea, contentEditable targets ignored
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.append(input, textarea, editable);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(result.current.selectionMode).toBe(true);

    // Visible menu / dialog / alertdialog blocks Escape
    for (const role of ['menu', 'dialog', 'alertdialog']) {
      const overlay = document.createElement('div');
      overlay.setAttribute('role', role);
      document.body.appendChild(overlay);
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(result.current.selectionMode).toBe(true);
      overlay.remove();
    }

    // State flags block Escape listener
    rerender({ ...defaultOptions, isBatchBusy: true });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(result.current.selectionMode).toBe(true);

    rerender({ ...defaultOptions, isBatchBusy: false, externalDialogOpen: true });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(result.current.selectionMode).toBe(true);

    rerender({ ...defaultOptions, externalDialogOpen: false });
    act(() => result.current.setBatchDeleteOpen(true));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(result.current.selectionMode).toBe(true);
    act(() => result.current.setBatchDeleteOpen(false));

    act(() => result.current.setBatchCategoryOpen(true));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(result.current.selectionMode).toBe(true);
    act(() => result.current.setBatchCategoryOpen(false));

    // Hidden overlays do NOT block Escape
    const hiddenDialog = document.createElement('div');
    hiddenDialog.setAttribute('role', 'dialog');
    hiddenDialog.setAttribute('aria-hidden', 'true');
    const hiddenMenu = document.createElement('div');
    hiddenMenu.setAttribute('role', 'menu');
    hiddenMenu.hidden = true;
    document.body.append(hiddenDialog, hiddenMenu);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedBookIds.size).toBe(0);

    // Unmount cleans up listener
    enterSelection();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('passes only visible selected IDs to confirmBatchDelete and resets on partial/full success', async () => {
    const { result, rerender } = renderHook(
      (props: typeof defaultOptions) => useShelfSelection(props),
      { initialProps: defaultOptions },
    );

    act(() => {
      result.current.toggleSelectionMode();
      result.current.toggleBookSelection('book-1');
      result.current.toggleBookSelection('book-3');
      result.current.setBatchDeleteOpen(true);
    });

    // Filter out book-3 so only book-1 is passed
    rerender({ ...defaultOptions, filteredBookIds: ['book-1', 'book-2'] });

    // Failure (successCount === 0) keeps selection mode & selection, closes confirm dialog
    onDeleteMany.mockResolvedValueOnce({ successCount: 0 });
    await act(async () => {
      await result.current.confirmBatchDelete();
    });
    expect(onDeleteMany).toHaveBeenCalledWith(['book-1']);
    expect(result.current.batchDeleteOpen).toBe(false);
    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedCount).toBe(1);

    // Success clears selection, exits selection mode, closes dialog
    act(() => result.current.setBatchDeleteOpen(true));
    onDeleteMany.mockResolvedValueOnce({ successCount: 1 });
    await act(async () => {
      await result.current.confirmBatchDelete();
    });
    expect(result.current.batchDeleteOpen).toBe(false);
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedBookIds.size).toBe(0);
  });

  it('handles saveBatchCategory success and zero-success outcomes', async () => {
    const { result } = renderHook(() => useShelfSelection(defaultOptions));

    act(() => {
      result.current.toggleSelectionMode();
      result.current.toggleBookSelection('book-2');
      result.current.setBatchCategoryOpen(true);
    });

    // Zero success keeps dialog, selection, and selection mode open
    onUpdateCategoryMany.mockResolvedValueOnce({ successCount: 0 });
    await act(async () => {
      await result.current.saveBatchCategory('科幻');
    });
    expect(onUpdateCategoryMany).toHaveBeenCalledWith(['book-2'], '科幻');
    expect(result.current.batchCategoryOpen).toBe(true);
    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedCount).toBe(1);

    // Success with null category clears selection, exits selection mode, closes dialog
    onUpdateCategoryMany.mockResolvedValueOnce({ successCount: 1 });
    await act(async () => {
      await result.current.saveBatchCategory(null);
    });
    expect(onUpdateCategoryMany).toHaveBeenCalledWith(['book-2'], null);
    expect(result.current.batchCategoryOpen).toBe(false);
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedBookIds.size).toBe(0);
  });
});
