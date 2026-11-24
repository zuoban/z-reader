import { fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchCategorySheet } from '@/components/BatchCategorySheet';

describe('BatchCategorySheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders as a centered paper modal with transparent outer wrapper and hides empty category list', () => {
    render(
      <BatchCategorySheet
        open
        onOpenChange={vi.fn()}
        selectedCount={3}
        categories={[]}
        bookCounts={{}}
        onSave={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: '批量设置分类' });
    expect(dialog).toHaveClass('app-dialog-shell');
    expect(dialog.parentElement).not.toHaveClass('app-dialog-shell');
    expect(screen.getByText('将对已选择的 3 本图书生效')).toBeInTheDocument();
    expect(screen.queryByText('已有分类')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('toggles existing category chips and submits the selected category', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <BatchCategorySheet
        open
        onOpenChange={vi.fn()}
        selectedCount={2}
        categories={['古典', '科幻']}
        bookCounts={{ 古典: 4, 科幻: 2 }}
        onSave={onSave}
      />
    );

    const scifiChip = screen.getByRole('button', { name: /科幻/ });
    const saveButton = screen.getByRole('button', { name: '保存' });

    expect(scifiChip).toHaveAttribute('aria-pressed', 'false');
    expect(saveButton).toBeDisabled();

    fireEvent.click(scifiChip);
    expect(scifiChip).toHaveAttribute('aria-pressed', 'true');
    expect(saveButton).toBeEnabled();

    // Clicking active chip toggles it off and disables Save again
    fireEvent.click(scifiChip);
    expect(scifiChip).toHaveAttribute('aria-pressed', 'false');
    expect(saveButton).toBeDisabled();

    fireEvent.click(scifiChip);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('科幻');
    });
  });

  it('clears categories explicitly via the clear action and shows new-category preview on input', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <BatchCategorySheet
        open
        onOpenChange={vi.fn()}
        selectedCount={2}
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        onSave={onSave}
      />
    );

    const input = screen.getByRole('textbox', { name: '分类名称' });
    fireEvent.change(input, { target: { value: '技术读物' } });
    expect(screen.getByText('将新建分类「技术读物」')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清空分类' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(null);
    });
  });

  it('clears stale input when reopened externally and returns focus on clear-input click', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <BatchCategorySheet
        open
        onOpenChange={onOpenChange}
        selectedCount={2}
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        onSave={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox', { name: '分类名称' });
    fireEvent.change(input, { target: { value: '临时分类' } });
    expect(input).toHaveValue('临时分类');

    // Clear input button clears text and restores focus to textbox
    fireEvent.click(screen.getByRole('button', { name: '清空输入' }));
    expect(input).toHaveValue('');
    expect(document.activeElement).toBe(input);

    // Type again, then simulate parent closing and reopening the sheet
    fireEvent.change(input, { target: { value: '历史随笔' } });
    rerender(
      <BatchCategorySheet
        open={false}
        onOpenChange={onOpenChange}
        selectedCount={2}
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        onSave={vi.fn()}
      />
    );
    rerender(
      <BatchCategorySheet
        open
        onOpenChange={onOpenChange}
        selectedCount={2}
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        onSave={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '分类名称' })).toHaveValue('');
    });
  });

  it('ignores Escape during IME composition and closes on normal Escape', () => {
    const onOpenChange = vi.fn();

    render(
      <BatchCategorySheet
        open
        onOpenChange={onOpenChange}
        selectedCount={2}
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        onSave={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox', { name: '分类名称' });
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
