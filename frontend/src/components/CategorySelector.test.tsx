import { fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { CategorySelector } from '@/components/CategorySelector';
import { api } from '@/lib/api';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    updateBook: vi.fn(),
  },
}));

describe('CategorySelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps app-dialog-shell on the dialog content instead of the outer modal wrapper', () => {
    render(
      <CategorySelector
        bookId="book-1"
        currentCategory="古典"
        categories={['古典', '科幻']}
        bookCounts={{ 古典: 2, 科幻: 3 }}
        onUpdate={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: '设置分类' });
    expect(dialog).toHaveClass('app-dialog-shell');
    expect(dialog.parentElement).not.toHaveClass('app-dialog-shell');
  });

  it('disables save when unchanged, supports selecting and toggling categories, and saves updates', async () => {
    vi.mocked(api.updateBook).mockResolvedValue({} as never);
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CategorySelector
        bookId="book-1"
        currentCategory="古典"
        categories={['古典', '科幻']}
        bookCounts={{ 古典: 2, 科幻: 3 }}
        onUpdate={onUpdate}
        open
        onOpenChange={onOpenChange}
      />
    );

    const saveButton = screen.getByRole('button', { name: '保存' });
    expect(saveButton).toBeDisabled();

    const scifiButton = screen.getByRole('button', { name: /科幻/ });
    expect(scifiButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(scifiButton);
    expect(scifiButton).toHaveAttribute('aria-pressed', 'true');
    expect(saveButton).toBeEnabled();

    // Clicking the selected option again toggles back to empty (uncategorized)
    fireEvent.click(scifiButton);
    expect(scifiButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('textbox', { name: '分类名称' })).toHaveValue('');

    // Re-select and submit
    fireEvent.click(scifiButton);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateBook).toHaveBeenCalledWith('book-1', { category: '科幻' });
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a creation preview when typing a new category name', async () => {
    vi.mocked(api.updateBook).mockResolvedValue({} as never);

    render(
      <CategorySelector
        bookId="book-2"
        categories={['科幻']}
        bookCounts={{ 科幻: 1 }}
        onUpdate={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '移除分类' })).not.toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: '分类名称' });
    fireEvent.change(input, { target: { value: '历史随笔' } });

    expect(screen.getByText('将新建分类「历史随笔」')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(api.updateBook).toHaveBeenCalledWith('book-2', { category: '历史随笔' });
    });
  });

  it('removes the current category directly via the footer action and handles errors', async () => {
    vi.mocked(api.updateBook)
      .mockRejectedValueOnce(new Error('网络异常'))
      .mockResolvedValueOnce({} as never);
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CategorySelector
        bookId="book-1"
        currentCategory="古典"
        categories={['古典']}
        bookCounts={{ 古典: 1 }}
        onUpdate={onUpdate}
        open
        onOpenChange={onOpenChange}
      />
    );

    const removeButton = screen.getByRole('button', { name: '移除分类' });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('网络异常');
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(removeButton);
    await waitFor(() => {
      expect(api.updateBook).toHaveBeenLastCalledWith('book-1', { category: null });
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
