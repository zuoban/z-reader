import { fireEvent, render, screen, waitFor } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { BookCard } from '@/components/BookCard';
import type { Book } from '@/lib/api';

vi.mock('@/hooks/useCoverUrl', () => ({
  useCoverUrl: () => ({ coverUrl: null, ref: { current: null } }),
}));

const book: Book = {
  id: 'book-1',
  user_id: 'reader',
  title: '红楼梦',
  author: '曹雪芹',
  filename: 'book.epub',
  format: 'epub',
  size: 100,
  created_at: '2026-10-01T00:00:00Z',
};

function renderCard(
  options: {
    selectionMode?: boolean;
    isDeleting?: boolean;
    onDelete?: () => void | Promise<void>;
  } = {},
) {
  const onRead = vi.fn();
  const onDelete = options.onDelete ?? vi.fn();
  const onSelectionToggle = vi.fn();
  const view = render(
    <BookCard
      book={book}
      index={0}
      categories={[]}
      bookCounts={{}}
      onRead={onRead}
      onDelete={onDelete}
      onUpdate={vi.fn()}
      isDeleting={options.isDeleting ?? false}
      formatSize={() => '100 B'}
      progressPercentage={42}
      selectionMode={options.selectionMode ?? false}
      onSelectionToggle={onSelectionToggle}
    />,
  );
  return { ...view, onRead, onDelete, onSelectionToggle };
}

describe('BookCard', () => {
  it('opens a book from the visible footer action', () => {
    const { onRead } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: '继续阅读：红楼梦' }));
    expect(onRead).toHaveBeenCalledOnce();
  });

  it('shows the fallback author only once with tooltip', () => {
    renderCard();
    const author = screen.getByText('曹雪芹');
    expect(author).toHaveAttribute('title', '曹雪芹');
    expect(screen.getAllByRole('heading', { name: '红楼梦' })).toHaveLength(1);
  });

  it('selects a book from the footer without opening it in selection mode', () => {
    const { onRead, onSelectionToggle } = renderCard({ selectionMode: true });
    fireEvent.click(screen.getByRole('button', { name: '选择图书' }));
    expect(onSelectionToggle).toHaveBeenCalledOnce();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('opens the book actions popover with metadata and current category', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: '更多操作：《红楼梦》' }));
    expect(screen.getByLabelText('书籍信息')).toBeInTheDocument();
    expect(screen.getByText('100 B')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /设置分类/ })).toHaveTextContent('未分类');
    expect(screen.getByRole('menuitem', { name: '删除图书' })).toBeInTheDocument();
  });

  it('keeps the delete confirmation open while async deletion is in flight and disables card actions', async () => {
    let resolveDelete!: () => void;
    const onDelete = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );

    const { rerender, onRead } = renderCard({ onDelete });
    fireEvent.click(screen.getByRole('button', { name: '更多操作：《红楼梦》' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除图书' }));

    const confirmButton = await screen.findByRole('button', { name: '确认删除' });
    expect(screen.getByText('确定删除《红楼梦》吗？删除后将无法恢复。')).toBeInTheDocument();

    fireEvent.click(confirmButton);
    expect(onDelete).toHaveBeenCalledOnce();

    rerender(
      <BookCard
        book={book}
        index={0}
        categories={[]}
        bookCounts={{}}
        onRead={onRead}
        onDelete={onDelete}
        onUpdate={vi.fn()}
        isDeleting
        formatSize={() => '100 B'}
        progressPercentage={42}
      />,
    );

    expect(screen.getByRole('article')).toHaveAttribute('data-deleting', 'true');
    expect(screen.getByRole('button', { name: '阅读《红楼梦》' })).toBeDisabled();
    const deletingAction = screen.getByRole('button', { name: '正在删除：红楼梦' });
    expect(deletingAction).toBeDisabled();
    expect(deletingAction.querySelector('svg')).toHaveClass('animate-spin');
    expect(screen.getByRole('button', { name: '更多操作：《红楼梦》' })).toBeDisabled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    resolveDelete();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('shows a pending cover indicator while processing_state is pending', () => {
    render(
      <BookCard
        book={{ ...book, processing_state: 'pending' }}
        index={0}
        categories={[]}
        bookCounts={{}}
        onRead={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        isDeleting={false}
        formatSize={() => '100 B'}
      />,
    );

    const badgeText = screen.getByText('正在生成封面');
    expect(badgeText).toBeVisible();
    expect(badgeText.parentElement?.querySelector('svg')).toHaveClass('animate-spin');
  });
});
