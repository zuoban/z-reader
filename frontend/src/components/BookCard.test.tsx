import { fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { BookCard } from '@/components/BookCard';
import { api, type Book } from '@/lib/api';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const useCoverUrlMock = vi.fn<
  (...args: unknown[]) => { coverUrl: string | null; ref: { current: null } }
>(() => ({ coverUrl: null, ref: { current: null } }));
vi.mock('@/hooks/useCoverUrl', () => ({
  useCoverUrl: (...args: unknown[]) => useCoverUrlMock(...args),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a book from the visible footer action', () => {
    const { onRead } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: '继续阅读：红楼梦' }));
    expect(onRead).toHaveBeenCalledWith('book-1');
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
    expect(onSelectionToggle).toHaveBeenCalledWith('book-1');
    expect(onRead).not.toHaveBeenCalled();
  });

  it('opens the book actions popover with metadata and current category', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: '更多操作：《红楼梦》' }));
    expect(screen.getByLabelText('书籍信息')).toBeInTheDocument();
    expect(screen.getByText('100 B')).toBeInTheDocument();
    expect(screen.queryByText('上次阅读')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '编辑信息' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /设置分类/ })).toHaveTextContent('未分类');
    expect(screen.getByRole('menuitem', { name: '删除图书' })).toBeInTheDocument();
  });

  it('opens the metadata edit dialog from the book actions menu', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: '更多操作：《红楼梦》' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑信息' }));

    const dialog = await screen.findByRole('dialog', { name: '编辑书籍信息' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '书名' })).toHaveValue('红楼梦');
    expect(screen.getByRole('textbox', { name: '作者' })).toHaveValue('曹雪芹');
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
    expect(onDelete).toHaveBeenCalledWith('book-1');

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

  it('disables cover fetching for coverless ready/non-epub/missing books and enables it when a cover exists', () => {
    useCoverUrlMock.mockClear();
    const baseProps = {
      index: 0,
      categories: [] as string[],
      bookCounts: {},
      onRead: vi.fn(),
      onDelete: vi.fn(),
      onUpdate: vi.fn(),
      isDeleting: false,
      formatSize: () => '100 B',
    };

    render(<BookCard {...baseProps} book={{ ...book, processing_state: 'ready' }} />);
    expect(useCoverUrlMock).toHaveBeenLastCalledWith('book-1', undefined, 'thumb', false);

    render(<BookCard {...baseProps} book={{ ...book, cover_missing: true }} />);
    expect(useCoverUrlMock).toHaveBeenLastCalledWith('book-1', undefined, 'thumb', false);

    render(<BookCard {...baseProps} book={{ ...book, format: 'pdf' }} />);
    expect(useCoverUrlMock).toHaveBeenLastCalledWith('book-1', undefined, 'thumb', false);

    render(<BookCard {...baseProps} book={{ ...book, processing_state: 'ready', cover_path: 'c.jpg' }} />);
    expect(useCoverUrlMock).toHaveBeenLastCalledWith('book-1', 'c.jpg', 'thumb', true);
  });

  it('lazily mounts the action menu on first click or ArrowDown keypress', async () => {
    render(
      <BookCard
        book={book}
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

    const trigger = screen.getByRole('button', { name: '更多操作：《红楼梦》' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem', { name: '编辑信息' })).not.toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(await screen.findByRole('menuitem', { name: '编辑信息' })).toBeInTheDocument();
  });

  it('reparses book metadata with loading state, success toast, and refresh callback', async () => {
    let resolveReparse!: (value: Book) => void;
    const reparseSpy = vi.spyOn(api, 'reparseBook').mockImplementation(
      () => new Promise<Book>((resolve) => {
        resolveReparse = resolve;
      }),
    );
    const onUpdate = vi.fn();

    const { rerender } = render(
      <BookCard
        book={book}
        index={0}
        categories={[]}
        bookCounts={{}}
        onRead={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
        isDeleting={false}
        formatSize={() => '100 B'}
      />,
    );

    const trigger = screen.getByRole('button', { name: '更多操作：《红楼梦》' });
    fireEvent.click(trigger);

    const reparseItem = screen.getByRole('menuitem', { name: '重新解析元数据' });
    fireEvent.click(reparseItem);

    expect(reparseSpy).toHaveBeenCalledWith('book-1');
    await waitFor(() => {
      expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('button', { name: '更多操作：《红楼梦》' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: '更多操作：《红楼梦》' }).querySelector('svg'),
      ).toHaveClass('animate-spin');
    });

    const updatedBook: Book = {
      ...book,
      title: '红楼梦（重刷）',
      author: '曹雪芹 著',
      cover_path: 'covers/book-1-new.jpg',
      cover_thumb_path: 'covers/book-1-new-thumb.jpg',
    };
    resolveReparse(updatedBook);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('已重新解析元数据');
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '更多操作：《红楼梦》' })).toBeEnabled();
    });

    rerender(
      <BookCard
        book={updatedBook}
        index={0}
        categories={[]}
        bookCounts={{}}
        onRead={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
        isDeleting={false}
        formatSize={() => '100 B'}
      />,
    );
    expect(useCoverUrlMock).toHaveBeenLastCalledWith(
      'book-1',
      'covers/book-1-new-thumb.jpg',
      'thumb',
      true,
    );
    reparseSpy.mockRestore();
  });

  it('shows an error toast when single-book metadata reparse fails', async () => {
    const reparseSpy = vi
      .spyOn(api, 'reparseBook')
      .mockRejectedValue(new Error('解析书籍元数据失败'));
    const onUpdate = vi.fn();

    render(
      <BookCard
        book={book}
        index={0}
        categories={[]}
        bookCounts={{}}
        onRead={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
        isDeleting={false}
        formatSize={() => '100 B'}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作：《红楼梦》' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '重新解析元数据' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('解析书籍元数据失败');
      expect(onUpdate).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '更多操作：《红楼梦》' })).toBeEnabled();
    });
    reparseSpy.mockRestore();
  });
});
