import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { ShelfBatchBar } from '@/components/shelf/ShelfBatchBar';

describe('ShelfBatchBar', () => {
  const baseProps = {
    selectedCount: 0,
    allVisibleSelected: false,
    hasMoreBooks: false,
    isBatchBusy: false,
    isDeletingMany: false,
    isUpdatingManyCategories: false,
    onToggleSelectionMode: vi.fn(),
    onToggleVisibleSelection: vi.fn(),
    onOpenBatchCategory: vi.fn(),
    onOpenBatchDelete: vi.fn(),
  };

  it('disables batch actions when nothing is selected and reflects pagination select-all wording', () => {
    const { rerender } = render(<ShelfBatchBar {...baseProps} />);

    expect(screen.getByRole('region', { name: '书籍批量操作' })).toBeInTheDocument();
    expect(screen.getByText('0 本')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全选' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '批量分类' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled();

    rerender(<ShelfBatchBar {...baseProps} hasMoreBooks />);
    expect(screen.getByRole('button', { name: '选择已加载' })).toBeEnabled();

    rerender(<ShelfBatchBar {...baseProps} selectedCount={3} allVisibleSelected />);
    expect(screen.getByText('3 本')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消全选' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '批量分类' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '批量删除' })).toBeEnabled();
  });

  it('locks controls and sets aria-busy while batch operations are running', () => {
    const onOpenBatchCategory = vi.fn();
    const onOpenBatchDelete = vi.fn();
    const { rerender } = render(
      <ShelfBatchBar
        {...baseProps}
        selectedCount={2}
        onOpenBatchCategory={onOpenBatchCategory}
        onOpenBatchDelete={onOpenBatchDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '批量分类' }));
    expect(onOpenBatchCategory).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '批量删除' }));
    expect(onOpenBatchDelete).toHaveBeenCalledOnce();

    rerender(
      <ShelfBatchBar
        {...baseProps}
        selectedCount={2}
        isBatchBusy
        isDeletingMany
      />
    );

    expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '批量删除' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '批量分类' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '全选' })).toBeDisabled();
  });
});
