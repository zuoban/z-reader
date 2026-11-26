import { fireEvent, render, screen, waitFor } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { CategoryManagerSheet } from '@/components/CategoryManagerSheet';

describe('CategoryManagerSheet', () => {
  it('shows merge preview during inline rename and prevents closing while saving', async () => {
    let resolveRename!: () => void;
    const onRenameCategory = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve;
        })
    );
    const onOpenChange = vi.fn();

    render(
      <CategoryManagerSheet
        open
        onOpenChange={onOpenChange}
        categories={['古典', '科幻']}
        bookCounts={{ 古典: 3, 科幻: 2 }}
        onRenameCategory={onRenameCategory}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '重命名 古典' }));

    const input = screen.getByRole('textbox', { name: '新分类名称' });
    fireEvent.change(input, { target: { value: '科幻' } });
    const mergeStatus = screen.getByRole('status');
    expect(mergeStatus).toHaveTextContent('保存后将与已有分类「科幻」合并');
    expect(mergeStatus).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onRenameCategory).toHaveBeenCalledWith('古典', '科幻');
    expect(screen.getByText('正在保存…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '完成' })).toBeDisabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveRename();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '完成' })).toBeEnabled();
    });
  });

  it('cancels inline editing on Escape without closing the sheet even when focus leaves the input', async () => {
    const onOpenChange = vi.fn();

    render(
      <CategoryManagerSheet
        open
        onOpenChange={onOpenChange}
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        onRenameCategory={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '重命名 科幻' }));
    const cancelButton = screen.getByRole('button', { name: '取消' });
    cancelButton.focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: '新分类名称' })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '重命名 科幻' })).toHaveFocus();
    });
  });

  it('resets stale inline editing state when closed externally and reopened', async () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      categories: ['科幻'],
      bookCounts: { 科幻: 2 },
      onRenameCategory: vi.fn(),
    };

    const { rerender } = render(<CategoryManagerSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '重命名 科幻' }));
    expect(screen.getByRole('textbox', { name: '新分类名称' })).toBeInTheDocument();

    rerender(<CategoryManagerSheet {...props} open={false} />);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    rerender(<CategoryManagerSheet {...props} open />);
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: '新分类名称' })).not.toBeInTheDocument();
  });

  it('guards deletion confirmation while removal is in progress', async () => {
    let resolveDelete!: () => void;
    const onRenameCategory = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        })
    );
    const onOpenChange = vi.fn();

    render(
      <CategoryManagerSheet
        open
        onOpenChange={onOpenChange}
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        onRenameCategory={onRenameCategory}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '删除 科幻' }));
    const confirmButton = screen.getByRole('button', { name: '确认删除' });
    fireEvent.click(confirmButton);

    expect(onRenameCategory).toHaveBeenCalledWith('科幻', null);
    expect(screen.getByRole('button', { name: '删除中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveDelete();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('ignores Escape during IME composition while renaming a category', () => {
    const onOpenChange = vi.fn();

    render(
      <CategoryManagerSheet
        open
        onOpenChange={onOpenChange}
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        onRenameCategory={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '重命名 科幻' }));
    const input = screen.getByRole('textbox', { name: '新分类名称' });

    const composingEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composingEscape, 'isComposing', { value: true });
    fireEvent(input, composingEscape);

    expect(screen.getByRole('textbox', { name: '新分类名称' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: '新分类名称' })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows quick category filter only when at least 6 categories exist and handles Escape/empty match', () => {
    const onOpenChange = vi.fn();
    const smallProps = {
      open: true,
      onOpenChange,
      categories: ['科幻', '历史', '文学', '传记', '哲学'],
      bookCounts: { 科幻: 2, 历史: 1, 文学: 3, 传记: 1, 哲学: 1 },
      onRenameCategory: vi.fn(),
    };

    const { rerender } = render(<CategoryManagerSheet {...smallProps} />);
    expect(screen.queryByRole('textbox', { name: '筛选分类' })).not.toBeInTheDocument();

    rerender(
      <CategoryManagerSheet
        {...smallProps}
        categories={['Sci-Fi', '历史', '文学', '传记', '哲学', '散文']}
        bookCounts={{ 'Sci-Fi': 2, 历史: 1, 文学: 3, 传记: 1, 哲学: 1, 散文: 4 }}
      />
    );

    const filterInput = screen.getByRole('textbox', { name: '筛选分类' });
    fireEvent.change(filterInput, { target: { value: 'sci' } });
    expect(screen.getByText('匹配 1 / 6 个分类')).toBeInTheDocument();
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
    expect(screen.queryByText('散文')).not.toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: '不存在' } });
    expect(screen.getByText('未找到匹配「不存在」的分类')).toBeInTheDocument();

    fireEvent.keyDown(filterInput, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('散文')).toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: '不存在' } });
    fireEvent.click(screen.getByRole('button', { name: '清空筛选' }));
    expect(screen.getByText('历史')).toBeInTheDocument();
  });
});
