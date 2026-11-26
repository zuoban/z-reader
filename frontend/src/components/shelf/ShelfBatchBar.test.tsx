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
    isReparsingMany: false,
    onToggleSelectionMode: vi.fn(),
    onToggleVisibleSelection: vi.fn(),
    onOpenBatchCategory: vi.fn(),
    onBatchReparse: vi.fn(),
    onOpenBatchDelete: vi.fn(),
  };

  it('disables batch actions when nothing is selected and reflects pagination select-all wording', () => {
    const { rerender } = render(<ShelfBatchBar {...baseProps} />);

    expect(screen.getByRole('region', { name: '书籍批量操作' })).toBeInTheDocument();
    expect(screen.getByText('0 本')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全选' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '批量分类' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重刷元数据' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled();

    rerender(<ShelfBatchBar {...baseProps} hasMoreBooks />);
    expect(screen.getByRole('button', { name: '选择已加载' })).toBeEnabled();

    rerender(<ShelfBatchBar {...baseProps} selectedCount={3} allVisibleSelected />);
    expect(screen.getByText('3 本')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消全选' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '批量分类' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '重刷元数据' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '批量删除' })).toBeEnabled();
  });

  it('locks controls and sets aria-busy while batch operations are running', () => {
    const onOpenBatchCategory = vi.fn();
    const onBatchReparse = vi.fn();
    const onOpenBatchDelete = vi.fn();
    const { rerender } = render(
      <ShelfBatchBar
        {...baseProps}
        selectedCount={2}
        onOpenBatchCategory={onOpenBatchCategory}
        onBatchReparse={onBatchReparse}
        onOpenBatchDelete={onOpenBatchDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '批量分类' }));
    expect(onOpenBatchCategory).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '重刷元数据' }));
    expect(onBatchReparse).toHaveBeenCalledOnce();

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
    expect(screen.getByRole('button', { name: '重刷元数据' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '全选' })).toBeDisabled();

    rerender(
      <ShelfBatchBar
        {...baseProps}
        selectedCount={2}
        isBatchBusy
        isReparsingMany
      />
    );

    const reparseButton = screen.getByRole('button', { name: '重刷元数据' });
    expect(reparseButton).toBeDisabled();
    expect(reparseButton).toHaveAttribute('aria-busy', 'true');
    expect(reparseButton).toHaveTextContent('解析中…');
    expect(reparseButton.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('displays optional total visible book count context beside selected pill on all viewports', () => {
    render(<ShelfBatchBar {...baseProps} selectedCount={3} totalVisibleCount={12} />);
    expect(screen.getByText('3 本')).toBeInTheDocument();
    const totalEl = screen.getByText('/ 共 12 本');
    expect(totalEl).toBeInTheDocument();
    expect(totalEl).not.toHaveClass('hidden');
  });
});
