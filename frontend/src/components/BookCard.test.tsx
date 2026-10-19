import { fireEvent, render, screen } from '@testing-library/react';
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

function renderCard(selectionMode = false) {
  const onRead = vi.fn();
  const onSelectionToggle = vi.fn();
  render(
    <BookCard
      book={book}
      index={0}
      categories={[]}
      bookCounts={{}}
      onRead={onRead}
      onDelete={vi.fn()}
      onUpdate={vi.fn()}
      isDeleting={false}
      formatSize={() => '100 B'}
      progressPercentage={42}
      selectionMode={selectionMode}
      onSelectionToggle={onSelectionToggle}
    />,
  );
  return { onRead, onSelectionToggle };
}

describe('BookCard', () => {
  it('opens a book from the visible footer action', () => {
    const { onRead } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: '继续阅读：红楼梦' }));
    expect(onRead).toHaveBeenCalledOnce();
  });

  it('shows the fallback author only once', () => {
    renderCard();
    expect(screen.getAllByText('曹雪芹')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: '红楼梦' })).toHaveLength(1);
  });

  it('selects a book from the footer without opening it in selection mode', () => {
    const { onRead, onSelectionToggle } = renderCard(true);
    fireEvent.click(screen.getByRole('button', { name: '选择图书' }));
    expect(onSelectionToggle).toHaveBeenCalledOnce();
    expect(onRead).not.toHaveBeenCalled();
  });
});
