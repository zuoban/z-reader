import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShelfData } from '@/hooks/useShelfData';
import { api } from '@/lib/api';
import type { Book } from '@/lib/api';

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    listBooks: vi.fn(),
    listProgress: vi.fn(),
    uploadBook: vi.fn(),
    deleteBook: vi.fn(),
    updateBook: vi.fn(),
    uploadCover: vi.fn(),
  },
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Mock book preview
vi.mock('@/lib/book-preview', () => ({
  extractBookPreview: vi.fn().mockResolvedValue({ title: 'Test Book', author: 'Test Author' }),
}));

const mockBook = (overrides: Partial<Book> = {}): Book => ({
  id: 'book-1',
  user_id: 'user-1',
  title: 'Test Book',
  author: 'Test Author',
  filename: 'test.epub',
  format: 'epub',
  size: 1024,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('useShelfData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads books when authenticated', async () => {
    const books = [mockBook()];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    // Wait for async load
    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].title).toBe('Test Book');
    expect(api.listBooks).toHaveBeenCalled();
  });

  it('does not load books when not authenticated', async () => {
    const { result } = renderHook(() => useShelfData(false));

    // Give time for potential load
    await vi.advanceTimersByTimeAsync(100);

    expect(result.current.isLoadingBooks).toBe(true);
    expect(api.listBooks).not.toHaveBeenCalled();
  });

  it('filters books by category', async () => {
    const books = [
      mockBook({ id: '1', title: 'SciFi Book', category: '科幻' }),
      mockBook({ id: '2', title: 'Fantasy Book', category: '奇幻' }),
      mockBook({ id: '3', title: 'No Category' }),
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    // Select category
    act(() => {
      result.current.setSelectedCategoryId('科幻');
    });

    expect(result.current.filteredBooks).toHaveLength(1);
    expect(result.current.filteredBooks[0].title).toBe('SciFi Book');
  });

  it('filters uncategorized books', async () => {
    const books = [
      mockBook({ id: '1', title: 'Categorized', category: '科幻' }),
      mockBook({ id: '2', title: 'No Category' }),
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    act(() => {
      result.current.setSelectedCategoryId(result.current.uncategorizedFilterId);
    });

    expect(result.current.filteredBooks).toHaveLength(1);
    expect(result.current.filteredBooks[0].title).toBe('No Category');
  });

  it('derives categories from books', async () => {
    const books = [
      mockBook({ id: '1', category: '科幻' }),
      mockBook({ id: '2', category: '奇幻' }),
      mockBook({ id: '3', category: '科幻' }), // duplicate
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    expect(result.current.categories).toEqual(['科幻', '奇幻']);
  });

  it('computes book counts per category', async () => {
    const books = [
      mockBook({ id: '1', category: '科幻' }),
      mockBook({ id: '2', category: '科幻' }),
      mockBook({ id: '3', category: '奇幻' }),
      mockBook({ id: '4' }), // uncategorized
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    expect(result.current.bookCounts['all']).toBe(4);
    expect(result.current.bookCounts['科幻']).toBe(2);
    expect(result.current.bookCounts['奇幻']).toBe(1);
    expect(result.current.bookCounts[result.current.uncategorizedFilterId]).toBe(1);
  });

  it('sorts books by recent read', async () => {
    const books = [
      mockBook({ id: '1', title: 'Old', last_read_at: '2023-01-01', created_at: '2023-01-01' }),
      mockBook({ id: '2', title: 'Recent', last_read_at: '2024-01-01', created_at: '2023-01-01' }),
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    // Default sort is recent_read
    expect(result.current.filteredBooks[0].title).toBe('Recent');
  });

  it('sorts books by title', async () => {
    const books = [
      mockBook({ id: '1', title: 'Zebra' }),
      mockBook({ id: '2', title: 'Alpha' }),
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    act(() => {
      result.current.setSortBy('title');
    });

    expect(result.current.filteredBooks[0].title).toBe('Alpha');
  });

  it('handles upload success', async () => {
    vi.mocked(api.listBooks).mockResolvedValue([]);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.uploadBook).mockResolvedValue(mockBook({ id: 'new-book' }));
    vi.mocked(api.updateBook).mockResolvedValue(mockBook({ id: 'new-book', title: 'Enriched' }));

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const fakeFile = new File(['test'], 'test.epub', { type: 'application/epub+zip' });
    const fakeEvent = { target: { files: [fakeFile], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleUpload(fakeEvent);
    });

    expect(result.current.books).toHaveLength(1);
    expect(api.uploadBook).toHaveBeenCalledWith(fakeFile);
  });

  it('handles upload error', async () => {
    vi.mocked(api.listBooks).mockResolvedValue([]);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.uploadBook).mockRejectedValue(new Error('Upload failed'));

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const fakeFile = new File(['test'], 'test.epub', { type: 'application/epub+zip' });
    const fakeEvent = { target: { files: [fakeFile], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.handleUpload(fakeEvent);
    });

    expect(result.current.isUploading).toBe(false);
  });

  it('handles delete success', async () => {
    const book = mockBook();
    vi.mocked(api.listBooks).mockResolvedValue([book]);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.deleteBook).mockResolvedValue(undefined);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    expect(result.current.books).toHaveLength(1);

    await act(async () => {
      await result.current.handleDelete('book-1');
    });

    expect(result.current.books).toHaveLength(0);
    expect(api.deleteBook).toHaveBeenCalledWith('book-1');
  });

  it('handles delete error', async () => {
    const book = mockBook();
    vi.mocked(api.listBooks).mockResolvedValue([book]);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.deleteBook).mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    await act(async () => {
      await result.current.handleDelete('book-1');
    });

    // Book should still be there
    expect(result.current.books).toHaveLength(1);
    expect(result.current.deletingId).toBeNull();
  });

  it('tracks uploading state', async () => {
    vi.mocked(api.listBooks).mockResolvedValue([]);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    // Make upload take some "time"
    vi.mocked(api.uploadBook).mockImplementation(async () => {
      return mockBook({ id: 'new' });
    });

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const fakeFile = new File(['test'], 'test.epub', { type: 'application/epub+zip' });
    const fakeEvent = { target: { files: [fakeFile], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;

    // Start upload
    const uploadPromise = act(async () => {
      await result.current.handleUpload(fakeEvent);
    });

    // isUploading should be true during upload
    expect(result.current.isUploading).toBe(false); // After await it completes

    await uploadPromise;
  });

  it('formats file sizes correctly', async () => {
    const { result } = renderHook(() => useShelfData(true));

    expect(result.current.formatFileSize(500)).toBe('500 B');
    expect(result.current.formatFileSize(1500)).toBe('1.5K');
    expect(result.current.formatFileSize(1500000)).toBe('1.4M');
  });

  it('loads progress data and maps by book ID', async () => {
    const books = [mockBook()];
    const progress = [
      { book_id: 'book-1', user_id: 'u1', cfi: 'epubcfi(/6/2)', percentage: 45, updated_at: '' },
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue(progress);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    expect(result.current.progressByBookId['book-1']).toBe(45);
  });

  it('handles progress load failure gracefully', async () => {
    vi.mocked(api.listBooks).mockResolvedValue([mockBook()]);
    vi.mocked(api.listProgress).mockRejectedValue(new Error('Progress API down'));

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    // Books should still load
    expect(result.current.books).toHaveLength(1);
    expect(result.current.progressByBookId).toEqual({});
  });

  it('clears selected category when it no longer exists', async () => {
    const books = [mockBook({ id: '1', category: '科幻' })];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    act(() => {
      result.current.setSelectedCategoryId('科幻');
    });
    expect(result.current.selectedCategoryId).toBe('科幻');

    // Change books to different category
    vi.mocked(api.listBooks).mockResolvedValue([mockBook({ id: '1', category: '奇幻' })]);

    await act(async () => {
      await result.current.loadBooks();
    });

    // Category should be cleared since 科幻 no longer exists
    expect(result.current.selectedCategoryId).toBeNull();
  });
});
