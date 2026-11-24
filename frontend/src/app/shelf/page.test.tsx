import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/lib/api';
import ShelfPage from '@/app/shelf/page';

const mockPush = vi.fn();
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
  filteredBooks: [sampleBook],
  bookCounts: { all: 1, uncategorized: 0, 文学: 1 },
  refreshBooks: vi.fn(),
  loadMoreBooks: vi.fn(),
  handleUpload: vi.fn(),
  handleDelete: vi.fn(),
  handleDeleteMany: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
  handleUpdateCategoryMany: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
  handleRenameCategory: vi.fn().mockResolvedValue(undefined),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  uploadFiles: mockUploadFiles,
  formatFileSize: (size: number) => `${Math.round(size / 1024)} KB`,
  sortBy: 'recent' as const,
  setSortBy: vi.fn(),
});

let mockShelfData = createShelfDataState();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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

vi.mock('@/components/VirtualBookGrid', () => ({
  VirtualBookGrid: ({
    items,
    renderItem,
  }: {
    items: Book[];
    renderItem: (item: Book, index: number) => ReactNode;
  }) => <div>{items.map((item, index) => <div key={item.id}>{renderItem(item, index)}</div>)}</div>,
}));

vi.mock('@/components/BookCard', () => ({
  BookCard: ({
    book,
    selectionMode,
    selected,
    onSelectionToggle,
  }: {
    book: Book;
    selectionMode?: boolean;
    selected?: boolean;
    onSelectionToggle?: () => void;
  }) => (
    <div>
      <span>{book.title}</span>
      {selectionMode && (
        <button type="button" onClick={onSelectionToggle}>
          {selected ? `已选 ${book.title}` : `选择 ${book.title}`}
        </button>
      )}
    </div>
  ),
}));

describe('ShelfPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
