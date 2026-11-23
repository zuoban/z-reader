import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { OfflineBooksDialog } from '@/components/OfflineBooksDialog';
import { PERSONAL_LIBRARY } from '@/lib/api';
import {
  clearOfflineBooks,
  listOfflineBooks,
  removeOfflineBook,
  type OfflineBookSummary,
} from '@/lib/offline-books';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/offline-books', () => ({
  listOfflineBooks: vi.fn(),
  removeOfflineBook: vi.fn(),
  clearOfflineBooks: vi.fn(),
}));

const SAMPLE_BOOKS: OfflineBookSummary[] = [
  {
    bookId: 'book-1',
    filename: 'three-body.epub',
    title: '三体',
    author: '刘慈欣',
    size: 2 * 1024 * 1024, // 2.0 MB
    savedAt: '2026-05-02T10:00:00.000Z',
  },
  {
    bookId: 'book-2',
    filename: 'notes.epub',
    title: '读书笔记',
    author: '',
    size: 1536, // 1.5 KB
    savedAt: '2026-05-01T10:00:00.000Z',
  },
];

describe('OfflineBooksDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<OfflineBooksDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(listOfflineBooks).not.toHaveBeenCalled();
  });

  it('renders empty state when no offline books exist', async () => {
    vi.mocked(listOfflineBooks).mockResolvedValue([]);

    render(<OfflineBooksDialog open onOpenChange={vi.fn()} />);

    expect(await screen.findByText('暂无已保存的离线图书')).toBeInTheDocument();
    expect(screen.getByText('已缓存 0 本 · 共 0 B')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '清空全部离线缓存' })).not.toBeInTheDocument();
  });

  it('lists cached books with formatted sizes, removes one book, and clears all', async () => {
    vi.mocked(listOfflineBooks).mockResolvedValue(SAMPLE_BOOKS);
    vi.mocked(removeOfflineBook).mockResolvedValue();
    vi.mocked(clearOfflineBooks).mockResolvedValue();

    render(<OfflineBooksDialog open onOpenChange={vi.fn()} />);

    expect(await screen.findByText('三体')).toBeInTheDocument();
    expect(screen.getByText('刘慈欣 · 2.0 MB')).toBeInTheDocument();
    expect(screen.getByText('读书笔记')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
    expect(screen.getByText('已缓存 2 本 · 共 2.0 MB')).toBeInTheDocument();

    const readLinks = screen.getAllByRole('link', { name: '阅读' });
    expect(readLinks[0]).toHaveAttribute('href', '/read/book-1');

    // Remove a single book
    fireEvent.click(screen.getByRole('button', { name: '移除《三体》' }));
    await waitFor(() => {
      expect(removeOfflineBook).toHaveBeenCalledWith(PERSONAL_LIBRARY, 'book-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('三体')).not.toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith('已移除《三体》的离线缓存');
    expect(screen.getByText('已缓存 1 本 · 共 1.5 KB')).toBeInTheDocument();

    // Clear all remaining books
    fireEvent.click(screen.getByRole('button', { name: '清空全部离线缓存' }));
    await waitFor(() => {
      expect(clearOfflineBooks).toHaveBeenCalledWith(PERSONAL_LIBRARY);
    });
    expect(await screen.findByText('暂无已保存的离线图书')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('已清空全部离线缓存');
  });

  it('shows error toast when remove or clear fails and closes on Escape', async () => {
    const onOpenChange = vi.fn();
    vi.mocked(listOfflineBooks).mockResolvedValue([SAMPLE_BOOKS[0]]);
    vi.mocked(removeOfflineBook).mockRejectedValueOnce(new Error('failed'));
    vi.mocked(clearOfflineBooks).mockRejectedValueOnce(new Error('failed'));

    render(<OfflineBooksDialog open onOpenChange={onOpenChange} />);
    expect(await screen.findByText('三体')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移除《三体》' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('移除离线图书失败，请重试');
    });

    fireEvent.click(screen.getByRole('button', { name: '清空全部离线缓存' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('清空离线缓存失败，请重试');
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
