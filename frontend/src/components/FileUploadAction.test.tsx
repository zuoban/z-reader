import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { FileUploadAction } from '@/components/FileUploadAction';

describe('FileUploadAction', () => {
  it('renders header density with quiet secondary emphasis and triggers the file input', () => {
    const onChange = vi.fn();
    const { container } = render(
      <FileUploadAction
        accept=".epub,.pdf"
        title="上传书籍"
        label="上传"
        density="header"
        emphasis="secondary"
        multiple
        onChange={onChange}
      />
    );

    const button = screen.getByRole('button', { name: '上传书籍' });
    expect(button).toHaveAttribute('title', '上传书籍');
    expect(button).toHaveAttribute('data-density', 'header');
    expect(button).toHaveAttribute('aria-busy', 'false');

    const surface = button.querySelector('[data-upload-surface="true"]');
    expect(surface).toHaveAttribute('data-density', 'header');
    expect(surface).toHaveAttribute('data-emphasis', 'secondary');
    expect(surface).toHaveTextContent('上传');

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.epub,.pdf');
    expect(input.multiple).toBe(true);

    const clickSpy = vi.spyOn(input, 'click');
    fireEvent.click(button);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('switches to busy status label while uploading', () => {
    render(
      <FileUploadAction
        accept=".epub"
        title="上传书籍"
        label="添加第一本书"
        statusLabel="上传 1/3"
        disabled
        onChange={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: '上传书籍' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-density', 'prominent');
    expect(screen.getByText('上传 1/3')).toBeInTheDocument();
  });
});
