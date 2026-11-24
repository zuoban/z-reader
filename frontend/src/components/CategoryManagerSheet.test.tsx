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
    expect(screen.getByText('保存后将与已有分类「科幻」合并')).toBeInTheDocument();

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

  it('cancels inline editing on Escape without closing the sheet even when focus leaves the input', () => {
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
});
