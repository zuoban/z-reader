import { fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SortSelector } from '@/components/SortSelector';
import { SORT_OPTIONS } from '@/hooks/useShelfData';

describe('SortSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays the current sort label and exposes accessible trigger metadata', () => {
    render(<SortSelector value="recent_read" onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: '书籍排序方式' });
    expect(trigger).toHaveAttribute('title', '排序：最近阅读');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('最近阅读');
  });

  it('opens the menu, highlights the active option, and notifies changes', async () => {
    const onChange = vi.fn();

    render(<SortSelector value="recent_read" onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: '书籍排序方式' });
    fireEvent.click(trigger);

    expect(await screen.findByText('排序方式')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const recentItem = screen.getByRole('menuitem', { name: '最近阅读' });
    expect(recentItem).toHaveAttribute('aria-current', 'true');
    expect(recentItem).toHaveAttribute('data-active', 'true');

    const titleOption = SORT_OPTIONS.find((opt) => opt.value === 'title')!;
    fireEvent.click(screen.getByRole('menuitem', { name: titleOption.label }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('title');

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('does not invoke onChange when clicking the already selected option', async () => {
    const onChange = vi.fn();

    render(<SortSelector value="recent_added" onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: '书籍排序方式' });
    fireEvent.click(trigger);

    const currentItem = await screen.findByRole('menuitem', { name: '最近添加' });
    fireEvent.click(currentItem);

    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('marks non-default sort values with data-non-default', () => {
    const { rerender } = render(<SortSelector value="recent_read" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '书籍排序方式' });
    expect(trigger).not.toHaveAttribute('data-non-default');

    rerender(<SortSelector value="title" onChange={vi.fn()} />);
    expect(trigger).toHaveAttribute('data-non-default', 'true');
  });
});
