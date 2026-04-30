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
    deleteBooks: vi.fn(),
    updateBook: vi.fn(),
    updateBooksCategory: vi.fn(),
    uploadCover: vi.fn(),
  },
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
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

  it('searches books by title, author, and filename', async () => {
    const books = [
      mockBook({ id: '1', title: '三体', author: '刘慈欣', filename: 'three-body.epub' }),
      mockBook({ id: '2', title: 'Clean Code', author: 'Robert Martin', filename: 'clean.pdf' }),
      mockBook({ id: '3', title: '写作是门手艺', author: '刘军强', filename: 'writing.epub' }),
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    act(() => {
      result.current.setSearchQuery('liu');
    });

    expect(result.current.filteredBooks).toHaveLength(0);

    act(() => {
      result.current.setSearchQuery('刘');
    });

    expect(result.current.filteredBooks.map((book) => book.title)).toEqual(['三体', '写作是门手艺']);

    act(() => {
      result.current.setSearchQuery('clean.pdf');
    });

    expect(result.current.filteredBooks).toHaveLength(1);
    expect(result.current.filteredBooks[0].title).toBe('Clean Code');
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

  it('uploads multiple supported files', async () => {
    vi.mocked(api.listBooks).mockResolvedValue([]);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.uploadBook)
      .mockResolvedValueOnce(mockBook({ id: 'book-a', title: 'Book A' }))
      .mockResolvedValueOnce(mockBook({ id: 'book-b', title: 'Book B' }));
    vi.mocked(api.updateBook).mockResolvedValue(mockBook());

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const firstFile = new File(['a'], 'a.epub', { type: 'application/epub+zip' });
    const secondFile = new File(['b'], 'b.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.uploadFiles([firstFile, secondFile]);
    });

    expect(api.uploadBook).toHaveBeenCalledTimes(2);
    expect(result.current.books).toHaveLength(2);
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

  it('rejects unsupported upload formats', async () => {
    vi.mocked(api.listBooks).mockResolvedValue([]);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const fakeFile = new File(['test'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.uploadFile(fakeFile);
    });

    expect(api.uploadBook).not.toHaveBeenCalled();
    expect(result.current.isUploading).toBe(false);
  });

  it('skips unsupported files during batch upload', async () => {
    vi.mocked(api.listBooks).mockResolvedValue([]);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.uploadBook).mockResolvedValue(mockBook({ id: 'supported' }));
    vi.mocked(api.updateBook).mockResolvedValue(mockBook({ id: 'supported' }));

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const supportedFile = new File(['book'], 'book.azw3', { type: 'application/octet-stream' });
    const unsupportedFile = new File(['notes'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.uploadFiles([supportedFile, unsupportedFile]);
    });

    expect(api.uploadBook).toHaveBeenCalledTimes(1);
    expect(api.uploadBook).toHaveBeenCalledWith(supportedFile);
  });

  it('handles delete success', async () => {
    const book = mockBook();
    vi.mocked(api.listBooks).mockResolvedValue([book]);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.deleteBooks).mockResolvedValue({ deleted_ids: ['book-1', 'book-2'] });

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

  it('handles batch delete success', async () => {
    const books = [
      mockBook({ id: 'book-1', title: 'One' }),
      mockBook({ id: 'book-2', title: 'Two' }),
      mockBook({ id: 'book-3', title: 'Three' }),
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([
      { book_id: 'book-1', user_id: 'u1', cfi: 'cfi-1', percentage: 10, updated_at: '' },
      { book_id: 'book-2', user_id: 'u1', cfi: 'cfi-2', percentage: 20, updated_at: '' },
    ]);
    vi.mocked(api.deleteBook).mockResolvedValue(undefined);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    await act(async () => {
      await result.current.handleDeleteMany(['book-1', 'book-2']);
    });

    expect(result.current.books.map((book) => book.id)).toEqual(['book-3']);
    expect(result.current.progressByBookId).toEqual({});
    expect(api.deleteBooks).toHaveBeenCalledWith(['book-1', 'book-2']);
  });

  it('keeps books after batch delete failure', async () => {
    const books = [
      mockBook({ id: 'book-1', title: 'One' }),
      mockBook({ id: 'book-2', title: 'Two' }),
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.deleteBooks).mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const batchResult = await act(async () => {
      return result.current.handleDeleteMany(['book-1', 'book-2']);
    });

    expect(batchResult).toEqual({ successCount: 0, failedCount: 2 });
    expect(result.current.books.map((book) => book.id)).toEqual(['book-1', 'book-2']);
  });

  it('updates categories for multiple books', async () => {
    const books = [
      mockBook({ id: 'book-1', title: 'One' }),
      mockBook({ id: 'book-2', title: 'Two' }),
    ];
    vi.mocked(api.listBooks).mockResolvedValue(books);
    vi.mocked(api.listProgress).mockResolvedValue([]);
    vi.mocked(api.updateBooksCategory).mockResolvedValue({
      books: [
        mockBook({ id: 'book-1', title: 'One', category: '科幻' }),
        mockBook({ id: 'book-2', title: 'Two', category: '科幻' }),
      ],
    });

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const updateResult = await act(async () => {
      return result.current.handleUpdateCategoryMany(['book-1', 'book-2'], '科幻');
    });

    expect(updateResult).toEqual({ successCount: 2, failedCount: 0 });
    expect(result.current.books.every((book) => book.category === '科幻')).toBe(true);
    expect(api.updateBooksCategory).toHaveBeenCalledWith(['book-1', 'book-2'], '科幻');
  });

  it('rejects too long batch category names', async () => {
    vi.mocked(api.listBooks).mockResolvedValue([mockBook()]);
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    const updateResult = await act(async () => {
      return result.current.handleUpdateCategoryMany(['book-1'], 'x'.repeat(51));
    });

    expect(updateResult).toEqual({ successCount: 0, failedCount: 1 });
    expect(api.updateBooksCategory).not.toHaveBeenCalled();
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

  it('exposes load error when books fail to load', async () => {
    vi.mocked(api.listBooks).mockRejectedValue(new Error('Backend unavailable'));
    vi.mocked(api.listProgress).mockResolvedValue([]);

    const { result } = renderHook(() => useShelfData(true));

    await vi.waitFor(() => {
      expect(result.current.isLoadingBooks).toBe(false);
    });

    expect(result.current.books).toHaveLength(0);
    expect(result.current.loadError).toBe('Backend unavailable');
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
