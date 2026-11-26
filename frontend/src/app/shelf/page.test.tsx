import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/lib/api';
import ShelfPage from '@/app/shelf/page';

const mockPush = vi.fn();
const mockRouter = { push: mockPush };
const mockUploadFiles = vi.fn();

const mockAuthState = {
  isLoading: false,
  isAuthenticated: true,
  isOffline: false,
  passwordRequired: true,
  logout: vi.fn().mockResolvedValue(undefined),
  checkAuth: vi.fn().mockResolvedValue('authenticated'),
};

const sampleBook: Book = {
  id: 'book-1',
  user_id: 'reader',
  title: '百年孤独',
  author: '加西亚·马尔克斯',
  filename: '1.epub',
  size: 1024 * 512,
  format: 'epub',
  category: '文学',
  created_at: '2026-11-20T00:00:00Z',
};

const createShelfDataState = () => ({
  books: [sampleBook],
  progressByBookId: {} as Record<string, number>,
  categories: ['文学'],
  isLoadingBooks: false,
  isSearching: false,
  isLoadingMoreBooks: false,
  hasMoreBooks: false,
  loadError: null as string | null,
  searchError: null as string | null,
  retrySearch: vi.fn(),
  selectedCategoryId: null as string | null,
  setSelectedCategoryId: vi.fn(),
  isUploading: false,
  uploadProgress: null as { current: number; total: number } | null,
  deletingId: null as string | null,
  isDeletingMany: false,
  isUpdatingManyCategories: false,
  isReparsingMany: false,
  filteredBooks: [sampleBook],
  bookCounts: { all: 1, uncategorized: 0, 文学: 1 } as Record<string, number>,
  refreshBooks: vi.fn(),
  loadMoreBooks: vi.fn(),
  handleUpload: vi.fn(),
  handleDelete: vi.fn(),
  handleDeleteMany: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
  handleUpdateCategoryMany: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
  handleRenameCategory: vi.fn().mockResolvedValue(undefined),
  handleReparseMany: vi.fn().mockResolvedValue({
    successCount: 1,
    failedCount: 0,
    updatedIds: ['book-1'],
  }),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  uploadFiles: mockUploadFiles,
  formatFileSize: (size: number) => `${Math.round(size / 1024)} KB`,
  sortBy: 'recent' as const,
  setSortBy: vi.fn(),
});

let mockShelfData = createShelfDataState();

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/hooks/useShelfData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShelfData')>();
  return {
    ...actual,
    useShelfData: () => mockShelfData,
  };
});

vi.mock('@/hooks/useShelfTheme', () => ({
  useShelfTheme: () => ({
    toggleTheme: vi.fn(),
    isDark: false,
    preset: 'light',
  }),
}));

const capturedItemKeys: string[] = [];

vi.mock('@/components/VirtualBookGrid', () => ({
  VirtualBookGrid: ({
    items,
    getItemKey,
    renderItem,
  }: {
    items: Book[];
    getItemKey: (item: Book, index: number) => string;
    renderItem: (item: Book, index: number) => ReactNode;
  }) => (
    <div data-testid="mock-virtual-grid">
      {items.map((item, index) => {
        const key = getItemKey(item, index);
        capturedItemKeys.push(key);
        return <div key={key}>{renderItem(item, index)}</div>;
      })}
    </div>
  ),
}));

const bookCardRenderProps: Array<{
  bookId: string;
  onRead: (bookId: string) => void;
  onDelete: (bookId: string) => void | Promise<void>;
  onSelectionToggle?: (bookId: string) => void;
}> = [];

vi.mock('@/components/BookCard', () => ({
  BookCard: ({
    book,
    onRead,
    onDelete,
    selectionMode,
    selected,
    onSelectionToggle,
    layout = 'grid',
  }: {
    book: Book;
    onRead: (bookId: string) => void;
    onDelete: (bookId: string) => void | Promise<void>;
    selectionMode?: boolean;
    selected?: boolean;
    onSelectionToggle?: (bookId: string) => void;
    layout?: 'grid' | 'list';
  }) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    bookCardRenderProps.push({
      bookId: book.id,
      onRead,
      onDelete,
      onSelectionToggle,
    });
    return (
      <div data-testid={`mock-book-card-${book.id}`} data-layout={layout}>
        <span>{book.title}</span>
        <button type="button" onClick={() => setDialogOpen(true)}>
          {`打开弹窗 ${book.id}`}
        </button>
        {dialogOpen && <span role="dialog">{`已打开 ${book.id}`}</span>}
        {selectionMode && (
          <button type="button" onClick={() => onSelectionToggle?.(book.id)}>
            {selected ? `已选 ${book.title}` : `选择 ${book.title}`}
          </button>
        )}
      </div>
    );
  },
}));

describe('ShelfPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.removeItem('z-reader-shelf-view-mode');
    capturedItemKeys.length = 0;
    bookCardRenderProps.length = 0;
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;
    mockAuthState.isOffline = false;
    mockShelfData = createShelfDataState();
  });

  it('uses accurate select-all wording and locks batch bar controls while busy', () => {
    const { rerender } = render(<ShelfPage />);

    fireEvent.click(screen.getByRole('button', { name: '批量操作' }));
    expect(screen.getByRole('button', { name: '全选' })).toBeEnabled();

    // When more pages exist, label clarifies only loaded books will be selected
    mockShelfData = { ...mockShelfData, hasMoreBooks: true };
    rerender(<ShelfPage />);
    expect(screen.getByRole('button', { name: '选择已加载' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '选择已加载' }));
    expect(screen.getByRole('button', { name: '取消全选' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '批量分类' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '批量删除' })).toBeEnabled();

    // While batch deletion is running, lock all batch controls and block Escape exit
    mockShelfData = { ...mockShelfData, isDeletingMany: true };
    rerender(<ShelfPage />);

    expect(screen.getByRole('button', { name: '取消全选' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '批量分类' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消选择' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '更多书库操作' })).toBeDisabled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('region', { name: '书籍批量操作' })).toBeInTheDocument();
  });

  it('guards file drag-and-drop when offline or uploading and resets stuck overlay on Escape/blur', () => {
    const file = new File(['epub'], 'demo.epub', { type: 'application/epub+zip' });
    const dataTransfer = {
      types: ['Files'],
      files: [file],
      dropEffect: 'none',
    };

    // Offline state should ignore file drops
    mockAuthState.isOffline = true;
    const { rerender } = render(<ShelfPage />);
    const main = screen.getByRole('main', { name: '书库' });

    fireEvent.dragEnter(main, { dataTransfer });
    expect(screen.queryByText('松开即可批量导入')).not.toBeInTheDocument();
    fireEvent.drop(main, { dataTransfer });
    expect(mockUploadFiles).not.toHaveBeenCalled();

    // Online state shows overlay and resets cleanly on window blur
    mockAuthState.isOffline = false;
    rerender(<ShelfPage />);

    fireEvent.dragEnter(main, { dataTransfer });
    expect(screen.getByText('松开即可批量导入')).toBeVisible();
    fireEvent(window, new Event('blur'));
    expect(screen.queryByText('松开即可批量导入')).not.toBeInTheDocument();

    // Uploading state shows busy dropzone hint and ignores drop
    mockShelfData = { ...mockShelfData, isUploading: true };
    rerender(<ShelfPage />);

    fireEvent.dragEnter(main, { dataTransfer });
    expect(screen.getByText('正在上传图书，请稍候')).toBeVisible();
    expect(screen.getByText('请等待当前上传完成后再拖入新文件')).toBeVisible();
    fireEvent.drop(main, { dataTransfer });
    expect(mockUploadFiles).not.toHaveBeenCalled();
  });

  it('ignores Escape during IME composition in shelf search and clears only when not composing', () => {
    mockShelfData = { ...mockShelfData, searchQuery: '百年' };
    render(<ShelfPage />);

    const searchInput = screen.getByRole('searchbox', { name: '搜索书库' });

    const composingEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composingEscape, 'isComposing', { value: true });
    fireEvent(searchInput, composingEscape);
    expect(mockShelfData.setSearchQuery).not.toHaveBeenCalled();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(mockShelfData.setSearchQuery).toHaveBeenCalledWith('');
  });

  it('keeps batch selection active when Escape dismisses an open shelf menu first', () => {
    render(<ShelfPage />);

    fireEvent.click(screen.getByRole('button', { name: '批量操作' }));
    fireEvent.click(screen.getByRole('button', { name: '选择 百年孤独' }));
    expect(screen.getByRole('region', { name: '书籍批量操作' })).toBeInTheDocument();

    // Open sort dropdown while in selection mode
    fireEvent.click(screen.getByRole('button', { name: '书籍排序方式' }));
    expect(screen.getByRole('menu')).toBeVisible();

    // First Escape closes the dropdown without exiting selection mode
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('region', { name: '书籍批量操作' })).toBeInTheDocument();

    // Second Escape (when no menu is open) exits selection mode
    if (screen.queryByRole('menu')) {
      fireEvent.click(screen.getByRole('button', { name: '书籍排序方式' }));
    }
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: '书籍批量操作' })).not.toBeInTheDocument();
  });

  it('reserves search, sort, and category bar space while books are loading to avoid CLS', () => {
    mockShelfData = {
      ...mockShelfData,
      books: [],
      filteredBooks: [],
      isLoadingBooks: true,
    };
    const { rerender } = render(<ShelfPage />);

    expect(screen.getByTestId('shelf-controls-skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('shelf-category-skeleton')).toHaveAttribute('aria-hidden', 'true');

    mockShelfData = createShelfDataState();
    rerender(<ShelfPage />);

    expect(screen.queryByTestId('shelf-controls-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shelf-category-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '搜索书库' })).toBeInTheDocument();
  });

  it('passes referentially stable callbacks to BookCard across selection toggles', () => {
    const secondBook: Book = {
      ...sampleBook,
      id: 'book-2',
      title: '红楼梦',
      filename: '2.epub',
    };
    mockShelfData = {
      ...mockShelfData,
      books: [sampleBook, secondBook],
      filteredBooks: [sampleBook, secondBook],
      bookCounts: { all: 2, uncategorized: 0, 文学: 2 },
    };
    render(<ShelfPage />);
    const initialBook1 = bookCardRenderProps.find((entry) => entry.bookId === 'book-1');
    expect(initialBook1).toBeDefined();

    bookCardRenderProps.length = 0;
    fireEvent.click(screen.getByRole('button', { name: '批量操作' }));
    fireEvent.click(screen.getByRole('button', { name: '选择 百年孤独' }));

    const latestBook2 = [...bookCardRenderProps]
      .reverse()
      .find((entry) => entry.bookId === 'book-2');
    expect(latestBook2).toBeDefined();
    expect(latestBook2?.onRead).toBe(initialBook1?.onRead);
    expect(latestBook2?.onDelete).toBe(initialBook1?.onDelete);
    expect(latestBook2?.onSelectionToggle).toBe(initialBook1?.onSelectionToggle);
  });

  it('triggers batch reparse and exits selection mode on full success', async () => {
    render(<ShelfPage />);

    fireEvent.click(screen.getByRole('button', { name: '批量操作' }));
    fireEvent.click(screen.getByRole('button', { name: '选择 百年孤独' }));
    fireEvent.click(screen.getByRole('button', { name: '重刷元数据' }));

    await waitFor(() => {
      expect(mockShelfData.handleReparseMany).toHaveBeenCalledWith(['book-1']);
      expect(screen.queryByRole('region', { name: '书籍批量操作' })).not.toBeInTheDocument();
    });
  });

  it('keeps failed books selected on partial batch reparse failure and locks bar while reparsing', async () => {
    const secondBook: Book = {
      ...sampleBook,
      id: 'book-2',
      title: '红楼梦',
      filename: '2.epub',
    };
    const handleReparseMany = vi.fn().mockResolvedValue({
      successCount: 1,
      failedCount: 1,
      updatedIds: ['book-1'],
    });
    mockShelfData = {
      ...mockShelfData,
      books: [sampleBook, secondBook],
      filteredBooks: [sampleBook, secondBook],
      bookCounts: { all: 2, uncategorized: 0, 文学: 2 },
      handleReparseMany,
    };

    const { rerender } = render(<ShelfPage />);

    fireEvent.click(screen.getByRole('button', { name: '批量操作' }));
    fireEvent.click(screen.getByRole('button', { name: '全选' }));
    fireEvent.click(screen.getByRole('button', { name: '重刷元数据' }));

    await waitFor(() => {
      expect(handleReparseMany).toHaveBeenCalledWith(['book-1', 'book-2']);
      expect(screen.getByRole('region', { name: '书籍批量操作' })).toBeInTheDocument();
      expect(screen.getByText('1 本')).toBeInTheDocument();
    });

    mockShelfData = { ...mockShelfData, isReparsingMany: true };
    rerender(<ShelfPage />);

    const reparseButton = screen.getByRole('button', { name: '重刷元数据' });
    expect(reparseButton).toBeDisabled();
    expect(reparseButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '批量分类' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled();
  });

  it('keeps BookCard mounted and dialog state intact when cover paths arrive', () => {
    const pendingBook: Book = {
      ...sampleBook,
      processing_state: 'pending',
      cover_path: undefined,
      cover_thumb_path: undefined,
    };
    mockShelfData = {
      ...mockShelfData,
      books: [pendingBook],
      filteredBooks: [pendingBook],
    };

    const { rerender } = render(<ShelfPage />);
    expect(capturedItemKeys).toEqual(['book-1']);

    fireEvent.click(screen.getByRole('button', { name: '打开弹窗 book-1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('已打开 book-1');

    capturedItemKeys.length = 0;
    const processedBook: Book = {
      ...pendingBook,
      processing_state: 'ready',
      cover_path: 'covers/book-1.jpg',
      cover_thumb_path: 'covers/book-1-thumb.jpg',
    };
    mockShelfData = {
      ...mockShelfData,
      books: [processedBook],
      filteredBooks: [processedBook],
    };

    rerender(<ShelfPage />);

    expect(capturedItemKeys).toEqual(['book-1']);
    expect(screen.getByRole('dialog')).toHaveTextContent('已打开 book-1');
  });

  it('switches between grid and list view modes and persists the choice', () => {
    const { container, unmount } = render(<ShelfPage />);

    const gridButton = screen.getByRole('button', { name: '网格视图' });
    const listButton = screen.getByRole('button', { name: '列表视图' });

    expect(gridButton).toHaveAttribute('aria-pressed', 'true');
    expect(listButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('mock-virtual-grid')).toBeInTheDocument();
    expect(screen.getByTestId('mock-book-card-book-1')).toHaveAttribute('data-layout', 'grid');

    fireEvent.click(listButton);

    expect(gridButton).toHaveAttribute('aria-pressed', 'false');
    expect(listButton).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('z-reader-shelf-view-mode')).toBe('list');
    expect(screen.queryByTestId('mock-virtual-grid')).not.toBeInTheDocument();
    expect(container.querySelector('[data-shelf-grid="list"]')).toBeInTheDocument();
    expect(screen.getByTestId('mock-book-card-book-1')).toHaveAttribute('data-layout', 'list');

    unmount();

    const remounted = render(<ShelfPage />);
    expect(remounted.getByRole('button', { name: '列表视图' })).toHaveAttribute('aria-pressed', 'true');
    expect(remounted.container.querySelector('[data-shelf-grid="list"]')).toBeInTheDocument();

    fireEvent.click(remounted.getByRole('button', { name: '网格视图' }));
    expect(window.localStorage.getItem('z-reader-shelf-view-mode')).toBe('grid');
    expect(remounted.getByTestId('mock-virtual-grid')).toBeInTheDocument();
  });

  it('filters visible books by reading status pills and resets via clear filters', () => {
    const unreadBook: Book = { ...sampleBook, id: 'book-2', title: '未读之书' };
    const finishedBook: Book = { ...sampleBook, id: 'book-3', title: '已完结之书' };
    mockShelfData = {
      ...mockShelfData,
      books: [sampleBook, unreadBook, finishedBook],
      filteredBooks: [sampleBook, unreadBook, finishedBook],
      bookCounts: { all: 3, uncategorized: 0, 文学: 3 },
      progressByBookId: {
        'book-1': 42,
        'book-2': 0,
        'book-3': 100,
      },
    };

    render(<ShelfPage />);

    const statusGroup = screen.getByRole('group', { name: '阅读状态筛选' });
    expect(within(statusGroup).getByRole('button', { name: /全部状态/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(statusGroup).getByRole('button', { name: /在读/ })).toBeInTheDocument();
    expect(within(statusGroup).getByRole('button', { name: /未读/ })).toBeInTheDocument();
    expect(within(statusGroup).getByRole('button', { name: /已读完/ })).toBeInTheDocument();

    fireEvent.click(within(statusGroup).getByRole('button', { name: /在读/ }));
    expect(screen.getByTestId('mock-book-card-book-1')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-book-card-book-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-book-card-book-3')).not.toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: '清除筛选' });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(within(statusGroup).getByRole('button', { name: /已读完/ }));
    expect(screen.queryByTestId('mock-book-card-book-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-book-card-book-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-book-card-book-3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(within(statusGroup).getByRole('button', { name: /全部状态/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('mock-book-card-book-1')).toBeInTheDocument();
    expect(screen.getByTestId('mock-book-card-book-2')).toBeInTheDocument();
    expect(screen.getByTestId('mock-book-card-book-3')).toBeInTheDocument();
  });

  it('displays header quick-resume pill for an in-progress book and navigates on click', () => {
    mockShelfData = {
      ...mockShelfData,
      books: [sampleBook],
      filteredBooks: [sampleBook],
      progressByBookId: { 'book-1': 57 },
    };

    render(<ShelfPage />);

    const resumeBtn = screen.getByRole('button', { name: `续读：${sampleBook.title}（57%）` });
    expect(resumeBtn).toBeInTheDocument();

    fireEvent.click(resumeBtn);
    expect(mockPush).toHaveBeenCalledWith(`/read/${sampleBook.id}`);
  });

  it('renders list-mode skeletons while loading in list view mode', () => {
    window.localStorage.setItem('z-reader-shelf-view-mode', 'list');
    mockShelfData = {
      ...mockShelfData,
      books: [],
      filteredBooks: [],
      isLoadingBooks: true,
    };

    const { container } = render(<ShelfPage />);

    const listSkeleton = container.querySelector('[data-skeleton-mode="list"]');
    expect(listSkeleton).toBeInTheDocument();
    expect(listSkeleton?.querySelectorAll('.shelf-book-row')).toHaveLength(6);
  });

  it('displays category book count badges without altering accessible button names', () => {
    mockShelfData = {
      ...mockShelfData,
      categories: ['文学', '科幻'],
      bookCounts: { all: 5, uncategorized: 1, 文学: 3, 科幻: 1 },
    };

    render(<ShelfPage />);

    const group = screen.getByRole('group', { name: '书籍分类筛选' });
    const allBtn = within(group).getByRole('button', { name: /^全部$/ });
    const uncatBtn = within(group).getByRole('button', { name: /^未分类$/ });
    const litBtn = within(group).getByRole('button', { name: /^文学$/ });
    const scifiBtn = within(group).getByRole('button', { name: /^科幻$/ });

    expect(allBtn.querySelector('[data-category-count="5"]')).toHaveTextContent('5');
    expect(uncatBtn.querySelector('[data-category-count="1"]')).toHaveTextContent('1');
    expect(litBtn.querySelector('[data-category-count="3"]')).toHaveTextContent('3');
    expect(scifiBtn.querySelector('[data-category-count="1"]')).toHaveTextContent('1');
  });

  it('combines search query, category, and reading status in the filtered bar summary', () => {
    mockShelfData = {
      ...mockShelfData,
      searchQuery: '百年',
      selectedCategoryId: '文学',
      progressByBookId: { 'book-1': 35 },
    };

    render(<ShelfPage />);

    fireEvent.click(within(screen.getByRole('group', { name: '阅读状态筛选' })).getByRole('button', { name: /在读/ }));
    expect(screen.getByText('搜索「百年」 · 文学 · 在读')).toBeInTheDocument();
  });
});
