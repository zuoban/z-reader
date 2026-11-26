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
    uploadCover: vi.fn(),
    deleteBookCover: vi.fn(),
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

  it('validates and uploads a custom cover image with live preview and revocation', async () => {
    vi.mocked(api.uploadCover).mockResolvedValue({} as never);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-cover');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    try {
      const { unmount } = render(
        <BookMetadataDialog
          bookId="book-cover"
          currentTitle="红楼梦"
          currentAuthor="曹雪芹"
          onUpdate={onUpdate}
          open
          onOpenChange={onOpenChange}
        />
      );

      const fileInput = screen.getByLabelText('选择封面图片') as HTMLInputElement;
      const saveButton = screen.getByRole('button', { name: '保存' });
      expect(saveButton).toBeDisabled();

      // Reject unsupported format
      const badFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [badFile] } });
      expect(screen.getByRole('alert')).toHaveTextContent('仅支持 JPG、PNG 或 WebP 格式的封面图片');
      expect(saveButton).toBeDisabled();

      // Reject empty file
      const emptyFile = new File([], 'empty.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [emptyFile] } });
      expect(screen.getByRole('alert')).toHaveTextContent('所选封面文件为空');

      // Stage valid PNG cover
      const coverFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'custom.png', {
        type: 'image/png',
      });
      fireEvent.change(fileInput, { target: { files: [coverFile] } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('待保存')).toBeInTheDocument();
      expect(screen.getByAltText('红楼梦 封面预览')).toHaveAttribute('src', 'blob:preview-cover');
      expect(saveButton).toBeEnabled();

      // Cancel staged cover and verify preview URL is revoked
      fireEvent.click(screen.getByRole('button', { name: '取消更换' }));
      expect(saveButton).toBeDisabled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-cover');

      // Re-stage and save cover only
      fireEvent.change(fileInput, { target: { files: [coverFile] } });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(api.uploadCover).toHaveBeenCalledWith('book-cover', coverFile, 'custom.png');
      });
      expect(api.updateBook).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('已更新书籍封面');
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      unmount();
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('saves metadata and cover together and refreshes shelf when cover upload fails after metadata save', async () => {
    vi.mocked(api.updateBook).mockResolvedValue({} as never);
    vi.mocked(api.uploadCover).mockRejectedValueOnce(new Error('封面格式无效'));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-2');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    try {
      render(
        <BookMetadataDialog
          bookId="book-both"
          currentTitle="红楼梦"
          currentAuthor="曹雪芹"
          currentCoverUrl="blob:existing-cover"
          onUpdate={onUpdate}
          open
          onOpenChange={onOpenChange}
        />
      );

      expect(screen.getByRole('button', { name: '更换封面' })).toBeInTheDocument();
      fireEvent.change(screen.getByRole('textbox', { name: '书名' }), {
        target: { value: '脂砚斋重评石头记' },
      });
      const coverFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.jpg', {
        type: 'image/jpeg',
      });
      fireEvent.change(screen.getByLabelText('选择封面图片'), {
        target: { files: [coverFile] },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('封面格式无效');
      });
      expect(api.updateBook).toHaveBeenCalledWith('book-both', { title: '脂砚斋重评石头记' });
      expect(api.uploadCover).toHaveBeenCalledWith('book-both', coverFile, 'cover.jpg');
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onOpenChange).not.toHaveBeenCalled();

      // Retry cover upload succeeds
      vi.mocked(api.uploadCover).mockResolvedValueOnce({} as never);
      fireEvent.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('已更新书籍信息与封面');
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('removes an existing cover with undo support and saves via deleteBookCover', async () => {
    vi.mocked(api.deleteBookCover).mockResolvedValueOnce({} as never);
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <BookMetadataDialog
        bookId="book-remove"
        currentTitle="红楼梦"
        currentAuthor="曹雪芹"
        currentCoverUrl="blob:existing-cover"
        onUpdate={onUpdate}
        open
        onOpenChange={onOpenChange}
      />
    );

    const saveButton = screen.getByRole('button', { name: '保存' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByAltText('红楼梦 封面预览')).toHaveAttribute('src', 'blob:existing-cover');

    // Mark cover for removal
    fireEvent.click(screen.getByRole('button', { name: '移除封面' }));
    expect(screen.queryByAltText('红楼梦 封面预览')).not.toBeInTheDocument();
    expect(screen.getByText('待移除')).toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    // Undo removal restores preview and resets dirty state
    fireEvent.click(screen.getByRole('button', { name: '恢复原封面' }));
    expect(screen.getByAltText('红楼梦 封面预览')).toHaveAttribute('src', 'blob:existing-cover');
    expect(screen.queryByText('待移除')).not.toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    // Mark again and save
    fireEvent.click(screen.getByRole('button', { name: '移除封面' }));
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.deleteBookCover).toHaveBeenCalledWith('book-remove');
    });
    expect(api.updateBook).not.toHaveBeenCalled();
    expect(api.uploadCover).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('封面已移除');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('supports drag-and-drop cover upload with validation on the cover preview area', async () => {
    vi.mocked(api.uploadCover).mockResolvedValueOnce({} as never);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dropped-cover');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    try {
      const { unmount } = render(
        <BookMetadataDialog
          bookId="book-drop"
          currentTitle="红楼梦"
          currentAuthor="曹雪芹"
          currentCoverUrl="blob:existing-cover"
          onUpdate={onUpdate}
          open
          onOpenChange={onOpenChange}
        />
      );

      const dropzone = document.querySelector('[data-cover-dropzone="true"]') as HTMLElement;
      const preview = document.querySelector('[data-cover-preview="true"]') as HTMLElement;
      const saveButton = screen.getByRole('button', { name: '保存' });

      // Drag highlight toggles on dragOver / dragLeave
      fireEvent.dragOver(preview, { dataTransfer: { files: [] } });
      expect(dropzone).toHaveAttribute('data-dragging', 'true');
      fireEvent.dragLeave(dropzone, { relatedTarget: document.body });
      expect(dropzone).not.toHaveAttribute('data-dragging');

      // Invalid file type shows validation error
      const invalidFile = new File(['bad'], 'readme.txt', { type: 'text/plain' });
      fireEvent.drop(preview, { dataTransfer: { files: [invalidFile] } });
      expect(screen.getByRole('alert')).toHaveTextContent('仅支持 JPG、PNG 或 WebP 格式的封面图片');
      expect(saveButton).toBeDisabled();

      // Mark for removal then drop a valid image — clears removal and stages new cover
      fireEvent.click(screen.getByRole('button', { name: '移除封面' }));
      expect(screen.getByText('待移除')).toBeInTheDocument();

      const validFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'dropped.png', {
        type: 'image/png',
      });
      fireEvent.drop(preview, { dataTransfer: { files: [validFile] } });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText('待移除')).not.toBeInTheDocument();
      expect(screen.getByText('待保存')).toBeInTheDocument();
      expect(screen.getByAltText('红楼梦 封面预览')).toHaveAttribute('src', 'blob:dropped-cover');
      expect(saveButton).toBeEnabled();

      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(api.uploadCover).toHaveBeenCalledWith('book-drop', validFile, 'dropped.png');
      });
      expect(api.deleteBookCover).not.toHaveBeenCalled();
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      unmount();
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('tracks changed fields in the footer and submits on Ctrl/Meta+Enter', async () => {
    vi.mocked(api.updateBook).mockResolvedValue({} as never);
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <BookMetadataDialog
        bookId="book-shortcut"
        currentTitle="红楼梦"
        currentAuthor="曹雪芹"
        onUpdate={onUpdate}
        open
        onOpenChange={onOpenChange}
      />
    );

    expect(screen.getByText('未修改内容')).toBeInTheDocument();

    const titleInput = screen.getByRole('textbox', { name: '书名' });
    const authorInput = screen.getByRole('textbox', { name: '作者' });
    fireEvent.change(titleInput, { target: { value: '石头记' } });
    fireEvent.change(authorInput, { target: { value: '曹雪芹 / 高鹗' } });

    expect(screen.getByText('待保存：书名、作者')).toBeInTheDocument();

    fireEvent.keyDown(authorInput, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(api.updateBook).toHaveBeenCalledWith('book-shortcut', {
        title: '石头记',
        author: '曹雪芹 / 高鹗',
      });
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
