import { act, fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import type { CategoryPickerModalProps } from '@/components/CategoryPickerModal';

function renderBatchPicker(overrides: Partial<CategoryPickerModalProps> = {}) {
  return render(
    <CategoryPickerModal
      open
      onOpenChange={vi.fn()}
      title="批量设置分类"
      subtitle="将对已选择的 2 本图书生效"
      categories={['科幻']}
      bookCounts={{ 科幻: 2 }}
      listVariant="chips"
      zIndex={90}
      returnFocus={false}
      showClearButton
      clearLabel="清空分类"
      clearingLabel="清空中…"
      isSaveDisabled={(selectedCategory) => !selectedCategory}
      onSave={vi.fn()}
      {...overrides}
    />
  );
}

describe('CategoryPickerModal (batch mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders as a centered paper modal with transparent outer wrapper and hides empty category list', () => {
    renderBatchPicker({
      subtitle: '将对已选择的 3 本图书生效',
      categories: [],
      bookCounts: {},
    });

    const dialog = screen.getByRole('dialog', { name: '批量设置分类' });
    expect(dialog).toHaveClass('app-dialog-shell');
    expect(dialog.parentElement).not.toHaveClass('app-dialog-shell');
    expect(screen.getByText('将对已选择的 3 本图书生效')).toBeInTheDocument();
    expect(screen.queryByText('已有分类')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('toggles existing category chips and submits the selected category', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderBatchPicker({
      categories: ['古典', '科幻'],
      bookCounts: { 古典: 4, 科幻: 2 },
      onSave,
    });

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

    renderBatchPicker({ onSave });

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
    const { rerender } = renderBatchPicker({ onOpenChange });

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
      <CategoryPickerModal
        open={false}
        onOpenChange={onOpenChange}
        title="批量设置分类"
        subtitle="将对已选择的 2 本图书生效"
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        listVariant="chips"
        zIndex={90}
        returnFocus={false}
        showClearButton
        clearLabel="清空分类"
        clearingLabel="清空中…"
        isSaveDisabled={(selectedCategory) => !selectedCategory}
        onSave={vi.fn()}
      />
    );
    rerender(
      <CategoryPickerModal
        open
        onOpenChange={onOpenChange}
        title="批量设置分类"
        subtitle="将对已选择的 2 本图书生效"
        categories={['科幻']}
        bookCounts={{ 科幻: 2 }}
        listVariant="chips"
        zIndex={90}
        returnFocus={false}
        showClearButton
        clearLabel="清空分类"
        clearingLabel="清空中…"
        isSaveDisabled={(selectedCategory) => !selectedCategory}
        onSave={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '分类名称' })).toHaveValue('');
    });
  });

  it('ignores Escape during IME composition and closes on normal Escape', () => {
    const onOpenChange = vi.fn();

    renderBatchPicker({ onOpenChange });

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

  it('filters existing categories while typing partial names and restores full list on exact match', async () => {
    renderBatchPicker({
      categories: ['Sci-Fi', '历史随笔', '散文精选'],
      bookCounts: { 'Sci-Fi': 2, 历史随笔: 3, 散文精选: 1 },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('3 个')).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: '分类名称' });
    fireEvent.change(input, { target: { value: 'sci' } });

    expect(screen.getByText('匹配 1 / 3 个')).toBeInTheDocument();
    expect(screen.getByText('Sci').tagName).toBe('MARK');
    expect(screen.getByRole('button', { name: /Sci-Fi/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /历史随笔/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sci-Fi/ }));
    expect(screen.getByText('3 个')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /历史随笔/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '未知分类' } });
    expect(screen.getByText('匹配 0 / 3 个')).toBeInTheDocument();
    expect(screen.getByText('无匹配已有分类，按回车或点击保存即可新建')).toBeInTheDocument();
  });
});
