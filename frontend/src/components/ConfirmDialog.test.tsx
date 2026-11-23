import { render, screen } from '@/test/render';
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
});
