import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useReaderBookmarks } from '@/hooks/useReaderBookmarks';
import { api, type Bookmark } from '@/lib/api';
import { ACCESS_GENERATION_KEY, setAccessGeneration } from '@/lib/library-access';
import { deferred } from '@/test/deferred';

vi.mock('@/lib/api', () => ({
  api: { listBookmarks: vi.fn(), createBookmark: vi.fn(), deleteBookmark: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const options = {
  currentCFI: 'epubcfi(/6/2)',
  percentage: 20,
  currentChapter: 'Chapter 1',
  viewRef: { current: null },
  onBookmarksOpenChange: vi.fn(),
};

function bookmark(bookId: string): Bookmark {
  return {
    id: `${bookId}-bookmark`, book_id: bookId, user_id: 'reader',
    cfi: options.currentCFI, percentage: options.percentage, created_at: '',
  };
}

describe('useReaderBookmarks', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => localStorage.removeItem(ACCESS_GENERATION_KEY));

  it('loads only the active book and ignores a late list response', async () => {
    const oldList = deferred<Bookmark[]>();
    const list = vi.mocked(api.listBookmarks)
      .mockImplementation((id) => id === 'first' ? oldList.promise : Promise.resolve([bookmark(id)]));
    const { result, rerender, unmount } = renderHook(
      (bookId) => useReaderBookmarks({ ...options, bookId, isAuthenticated: true }),
      { initialProps: 'first', wrapper: StrictMode },
    );
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(list).toHaveBeenCalledTimes(1);
    const firstSignal = list.mock.calls[0][1];
    expect(firstSignal?.aborted).toBe(false);

    rerender('second');
    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.bookmarks).toEqual([bookmark('second')]));
    await act(async () => { oldList.resolve([bookmark('first')]); });
    expect(result.current.bookmarks).toEqual([bookmark('second')]);

    unmount();
    expect(list.mock.calls[1][1]?.aborted).toBe(true);
  });

  it('clears the previous book while a save is pending and ignores its completion', async () => {
    const save = deferred<Bookmark>();
    const create = vi.mocked(api.createBookmark).mockReturnValueOnce(save.promise);
    vi.mocked(api.listBookmarks).mockImplementation(async (id) => [{ ...bookmark(id), cfi: 'other' }]);
    const { result, rerender } = renderHook(
      (bookId) => useReaderBookmarks({ ...options, bookId, isAuthenticated: true }),
      { initialProps: 'first' },
    );
    await waitFor(() => expect(result.current.bookmarks[0]?.book_id).toBe('first'));
    act(() => { void result.current.handleCreateBookmark(); });
    expect(result.current.isSavingBookmark).toBe(true);

    rerender('second');
    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.isSavingBookmark).toBe(false);
    await waitFor(() => expect(result.current.bookmarks[0]?.book_id).toBe('second'));
    await act(async () => { save.resolve(bookmark('first')); });
    expect(create).toHaveBeenCalledOnce();
    expect(result.current.bookmarks.map((item) => item.book_id)).toEqual(['second']);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not reload an old book when its deletion fails after logout', async () => {
    const deletion = deferred<void>();
    const list = vi.mocked(api.listBookmarks).mockResolvedValue([bookmark('first')]);
    vi.mocked(api.deleteBookmark).mockReturnValueOnce(deletion.promise);
    const { result, rerender } = renderHook(
      (isAuthenticated) => useReaderBookmarks({ ...options, bookId: 'first', isAuthenticated }),
      { initialProps: true },
    );
    await waitFor(() => expect(result.current.bookmarks).toEqual([bookmark('first')]));
    act(() => { void result.current.handleDeleteBookmark('first-bookmark'); });
    expect(result.current.bookmarks).toEqual([]);

    rerender(false);
    await act(async () => { deletion.reject(new Error('late failure')); });
    expect(list).toHaveBeenCalledOnce();
    expect(result.current.bookmarks).toEqual([]);
  });

  it('ignores write failures when access expires before the hook rerenders', async () => {
    const existing = { ...bookmark('first'), cfi: 'other' };
    const list = vi.mocked(api.listBookmarks).mockResolvedValue([existing]);
    const save = deferred<Bookmark>();
    const deletion = deferred<void>();
    vi.mocked(api.createBookmark).mockReturnValueOnce(save.promise);
    vi.mocked(api.deleteBookmark).mockReturnValueOnce(deletion.promise);
    const { result } = renderHook(() => useReaderBookmarks({
      ...options, bookId: 'first', isAuthenticated: true,
    }));
    await waitFor(() => expect(result.current.bookmarks).toEqual([existing]));

    act(() => {
      void result.current.handleCreateBookmark();
      void result.current.handleDeleteBookmark(existing.id);
    });
    await act(async () => {
      setAccessGeneration('expired');
      const failure = new Error('access expired');
      save.reject(failure);
      deletion.reject(failure);
    });

    expect(list.mock.calls[0][1]?.aborted).toBe(false);
    expect(list).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
