import { fireEvent, render, screen, waitFor } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('exposes alertdialog role and aria-describedby across rerenders', () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      title: '删除图书',
      description: '确定删除这本图书吗？删除后将无法恢复。',
      confirmLabel: '确认删除',
      confirmDisabled: false,
      onConfirm: vi.fn(),
    };

    const { rerender } = render(<ConfirmDialog {...props} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeVisible();

    const describedById = dialog.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    expect(document.getElementById(describedById!)).toHaveTextContent(props.description);

    rerender(<ConfirmDialog {...props} confirmDisabled />);
    const updatedDialog = screen.getByRole('alertdialog');
    expect(updatedDialog.getAttribute('aria-describedby')).toBe(describedById);
  });

  it('prevents closing and duplicate clicks while an async confirmation is pending', async () => {
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="删除所选图书"
        description="确定删除选中的 2 本图书吗？"
        confirmLabel="确认删除"
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByRole('button', { name: '确认删除' });
    const cancelButton = screen.getByRole('button', { name: '取消' });

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveAttribute('aria-busy', 'true');
    expect(cancelButton).toBeDisabled();

    fireEvent.click(confirmButton);
    fireEvent.click(cancelButton);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveConfirm();
    await waitFor(() => {
      expect(confirmButton).toBeEnabled();
      expect(cancelButton).toBeEnabled();
    });
  });

  it('sets safe autofocus on cancel button only for destructive confirmations', () => {
    const { rerender } = render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="删除图书"
        description="确定删除这本图书吗？"
        confirmLabel="确认删除"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '取消' })).toHaveAttribute('data-autofocus', 'true');

    rerender(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="确认操作"
        description="确定继续吗？"
        confirmLabel="确认"
        confirmVariant="default"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '取消' })).not.toHaveAttribute('data-autofocus');
  });

  it('disables closing when loading prop is true', () => {
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="删除图书"
        description="确定删除这本图书吗？"
        confirmLabel="删除中…"
        loading
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '删除中…' })).toBeDisabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
