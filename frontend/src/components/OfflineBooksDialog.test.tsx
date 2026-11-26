import { fireEvent, render, screen, waitFor } from '@/test/render';
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

    const shareBars = document.querySelectorAll('[data-storage-share]');
    expect(shareBars).toHaveLength(2);
    expect(shareBars[0]).toHaveAttribute('data-storage-share', '100');
    expect(shareBars[1]).toHaveAttribute('data-storage-share', '4');

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
    expect(document.querySelectorAll('[data-storage-share]')).toHaveLength(0);

    // Clear all remaining books requires inline confirmation
    fireEvent.click(screen.getByRole('button', { name: '清空全部离线缓存' }));
    expect(screen.getByText('确定清空全部 1 本离线缓存？')).toBeInTheDocument();
    expect(clearOfflineBooks).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认清空' }));
    await waitFor(() => {
      expect(clearOfflineBooks).toHaveBeenCalledWith(PERSONAL_LIBRARY);
    });
    expect(await screen.findByText('暂无已保存的离线图书')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('已清空全部离线缓存');
  });

  it('cancels inline clear confirmation on Escape without closing the dialog', async () => {
    const onOpenChange = vi.fn();
    vi.mocked(listOfflineBooks).mockResolvedValue([SAMPLE_BOOKS[0]]);

    render(<OfflineBooksDialog open onOpenChange={onOpenChange} />);
    expect(await screen.findByText('三体')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清空全部离线缓存' }));
    expect(screen.getByRole('status')).toHaveTextContent('确定清空全部 1 本离线缓存？');
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByText('确定清空全部 1 本离线缓存？')).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '清空全部离线缓存' })).toHaveFocus();
    });
  });

  it('announces loading state as a busy status while reading offline books', async () => {
    let resolveList!: (items: OfflineBookSummary[]) => void;
    vi.mocked(listOfflineBooks).mockImplementation(
      () =>
        new Promise<OfflineBookSummary[]>((resolve) => {
          resolveList = resolve;
        })
    );

    render(<OfflineBooksDialog open onOpenChange={vi.fn()} />);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('读取设备缓存中…');
    expect(status).toHaveAttribute('aria-busy', 'true');

    resolveList([]);
    expect(await screen.findByText('暂无已保存的离线图书')).toBeInTheDocument();
  });

  it('guards closing and disables other actions while removing a book', async () => {
    let resolveRemove!: () => void;
    const onOpenChange = vi.fn();
    vi.mocked(listOfflineBooks).mockResolvedValue(SAMPLE_BOOKS);
    vi.mocked(removeOfflineBook).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve;
        })
    );

    render(<OfflineBooksDialog open onOpenChange={onOpenChange} />);
    expect(await screen.findByText('三体')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移除《三体》' }));
    expect(screen.getByRole('button', { name: '正在移除《三体》' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '移除《读书笔记》' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '关闭离线图书管理' })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveRemove();
    await waitFor(() => {
      expect(screen.queryByText('三体')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '关闭' })).toBeEnabled();
  });

  it('shows retry state when loading cached books fails', async () => {
    vi.mocked(listOfflineBooks)
      .mockRejectedValueOnce(new Error('storage error'))
      .mockResolvedValueOnce([SAMPLE_BOOKS[0]]);

    render(<OfflineBooksDialog open onOpenChange={vi.fn()} />);

    expect(await screen.findByText('无法读取离线缓存')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByText('三体')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('清空离线缓存失败，请重试');
    });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('filters cached books when 5 or more exist and clears filter on Escape before closing', async () => {
    const onOpenChange = vi.fn();
    const fiveBooks: OfflineBookSummary[] = [
      ...SAMPLE_BOOKS,
      {
        bookId: 'book-3',
        filename: 'dune.epub',
        title: '沙丘',
        author: '弗兰克·赫伯特',
        size: 3 * 1024 * 1024,
        savedAt: '2026-05-03T10:00:00.000Z',
      },
      {
        bookId: 'book-4',
        filename: 'go.pdf',
        title: 'Go 语言精进之路',
        author: '白明',
        size: 4 * 1024 * 1024,
        savedAt: '2026-05-04T10:00:00.000Z',
      },
      {
        bookId: 'book-5',
        filename: 'history.epub',
        title: '中国近代史',
        author: '徐中约',
        size: 5 * 1024 * 1024,
        savedAt: '2026-05-05T10:00:00.000Z',
      },
    ];
    vi.mocked(listOfflineBooks).mockResolvedValue(fiveBooks);

    render(<OfflineBooksDialog open onOpenChange={onOpenChange} />);

    const searchInput = await screen.findByRole('searchbox', { name: '筛选离线图书' });
    fireEvent.change(searchInput, { target: { value: '白明' } });

    expect(screen.getByText('Go 语言精进之路')).toBeInTheDocument();
    expect(screen.queryByText('三体')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '不存在的书' } });
    expect(screen.getByText('未找到匹配的离线图书')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getByText('三体')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '沙丘' } });
    fireEvent.keyDown(searchInput, { key: 'Escape', code: 'Escape' });
    expect(searchInput).toHaveValue('');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
