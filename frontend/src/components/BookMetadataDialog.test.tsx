import { fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { BookMetadataDialog } from '@/components/BookMetadataDialog';
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

describe('BookMetadataDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps app-dialog-shell on the dialog content instead of the outer modal wrapper', () => {
    render(
      <BookMetadataDialog
        bookId="book-1"
        currentTitle="红楼梦"
        currentAuthor="曹雪芹"
        onUpdate={vi.fn()}
        open
        onOpenChange={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: '编辑书籍信息' });
    expect(dialog).toHaveClass('app-dialog-shell');
    expect(dialog.parentElement).not.toHaveClass('app-dialog-shell');
  });

  it('disables save when unchanged and sends only modified fields', async () => {
    vi.mocked(api.updateBook).mockResolvedValue({} as never);
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <BookMetadataDialog
        bookId="book-1"
        currentTitle="红楼梦"
        currentAuthor="曹雪芹"
        onUpdate={onUpdate}
        open
        onOpenChange={onOpenChange}
      />
    );

    const saveButton = screen.getByRole('button', { name: '保存' });
    expect(saveButton).toBeDisabled();

    const titleInput = screen.getByRole('textbox', { name: '书名' });
    fireEvent.change(titleInput, { target: { value: '  石头记  ' } });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateBook).toHaveBeenCalledWith('book-1', { title: '石头记' });
    });
    expect(toast.success).toHaveBeenCalledWith('已更新书籍信息');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocks empty title and allows clearing author to empty string', async () => {
    vi.mocked(api.updateBook).mockResolvedValue({} as never);
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <BookMetadataDialog
        bookId="book-2"
        currentTitle="三体"
        currentAuthor="刘慈欣"
        onUpdate={onUpdate}
        open
        onOpenChange={onOpenChange}
      />
    );

    const titleInput = screen.getByRole('textbox', { name: '书名' });
    const saveButton = screen.getByRole('button', { name: '保存' });

    fireEvent.change(titleInput, { target: { value: '   ' } });
    expect(screen.getByRole('alert')).toHaveTextContent('书名不能为空');
    expect(saveButton).toBeDisabled();

    fireEvent.change(titleInput, { target: { value: '三体' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '清空作者' }));
    expect(screen.getByRole('textbox', { name: '作者' })).toHaveValue('');
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateBook).toHaveBeenCalledWith('book-2', { author: '' });
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and shows an error toast when saving fails', async () => {
    vi.mocked(api.updateBook).mockRejectedValueOnce(new Error('保存失败'));
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <BookMetadataDialog
        bookId="book-1"
        currentTitle="红楼梦"
        currentAuthor="曹雪芹"
        onUpdate={onUpdate}
        open
        onOpenChange={onOpenChange}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: '作者' }), {
      target: { value: '曹雪芹 / 高鹗' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('保存失败');
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('ignores Escape during IME composition and closes on normal Escape', () => {
    const onOpenChange = vi.fn();

    render(
      <BookMetadataDialog
        bookId="book-1"
        currentTitle="红楼梦"
        currentAuthor="曹雪芹"
        onUpdate={vi.fn()}
        open
        onOpenChange={onOpenChange}
      />
    );

    const input = screen.getByRole('textbox', { name: '书名' });
    const composingEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composingEscape, 'isComposing', { value: true });
    fireEvent(input, composingEscape);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
