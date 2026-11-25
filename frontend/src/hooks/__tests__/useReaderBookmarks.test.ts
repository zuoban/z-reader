import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useReaderBookmarks } from '@/hooks/useReaderBookmarks';
import { api, type Bookmark } from '@/lib/api';
import { ACCESS_GENERATION_KEY, setAccessGeneration } from '@/lib/library-access';
import { deferred } from '@/test/deferred';

vi.mock('@/lib/api', () => ({
  api: {
    listBookmarks: vi.fn(),
    createBookmark: vi.fn(),
    updateBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
  },
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

  it('notifies the user and reloads bookmarks when deletion fails for the active book', async () => {
    const existing = { ...bookmark('first'), cfi: 'other' };
    const list = vi.mocked(api.listBookmarks).mockResolvedValue([existing]);
    vi.mocked(api.deleteBookmark).mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useReaderBookmarks({
      ...options, bookId: 'first', isAuthenticated: true,
    }));
    await waitFor(() => expect(result.current.bookmarks).toEqual([existing]));

    await act(async () => {
      await result.current.handleDeleteBookmark(existing.id);
    });

    expect(toast.error).toHaveBeenCalledWith('删除书签失败');
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
      expect(result.current.bookmarks).toEqual([existing]);
    });
  });

  it('defers bookmark loading until deferLoad clears and fetches only once per book', async () => {
    const existing = bookmark('first');
    const list = vi.mocked(api.listBookmarks).mockResolvedValue([existing]);

    const { result, rerender } = renderHook(
      (deferLoad: boolean) => useReaderBookmarks({
        ...options, bookId: 'first', isAuthenticated: true, deferLoad,
      }),
      { initialProps: true, wrapper: StrictMode },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(list).not.toHaveBeenCalled();
    expect(result.current.bookmarks).toEqual([]);

    rerender(false);
    await waitFor(() => expect(result.current.bookmarks).toEqual([existing]));
    expect(list).toHaveBeenCalledTimes(1);

    rerender(true);
    rerender(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('updates bookmark note on success, trims whitespace, and preserves other bookmarks', async () => {
    const first = { ...bookmark('first'), id: 'bm-1', note: '旧笔记' };
    const second = { ...bookmark('first'), id: 'bm-2', cfi: 'other', note: '另一条' };
    const updated = { ...first, note: '新笔记' };
    vi.mocked(api.listBookmarks).mockResolvedValue([first, second]);
    vi.mocked(api.updateBookmark).mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useReaderBookmarks({
      ...options, bookId: 'first', isAuthenticated: true,
    }));
    await waitFor(() => expect(result.current.bookmarks).toEqual([first, second]));

    let ok = false;
    await act(async () => {
      ok = await result.current.handleUpdateBookmarkNote('bm-1', '  新笔记  ');
    });

    expect(ok).toBe(true);
    expect(api.updateBookmark).toHaveBeenCalledWith('first', 'bm-1', { note: '新笔记' });
    expect(result.current.bookmarks).toEqual([updated, second]);
    expect(toast.success).toHaveBeenCalledWith('书签备注已更新');
  });

  it('handles updateBookmark errors for the active book and returns false', async () => {
    const existing = { ...bookmark('first'), id: 'bm-1', note: '旧笔记' };
    vi.mocked(api.listBookmarks).mockResolvedValue([existing]);
    vi.mocked(api.updateBookmark).mockRejectedValueOnce(new Error('network error'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { result } = renderHook(() => useReaderBookmarks({
        ...options, bookId: 'first', isAuthenticated: true,
      }));
      await waitFor(() => expect(result.current.bookmarks).toEqual([existing]));

      let ok = true;
      await act(async () => {
        ok = await result.current.handleUpdateBookmarkNote('bm-1', '修改');
      });

      expect(ok).toBe(false);
      expect(result.current.bookmarks).toEqual([existing]);
      expect(toast.error).toHaveBeenCalledWith('更新书签备注失败');
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('returns false and ignores stale updates when unauthenticated, book changes, or access expires', async () => {
    const { result: unauthResult } = renderHook(() => useReaderBookmarks({
      ...options, bookId: 'first', isAuthenticated: false,
    }));
    await expect(unauthResult.current.handleUpdateBookmarkNote('bm-1', 'test')).resolves.toBe(false);
    expect(api.updateBookmark).not.toHaveBeenCalled();

    const pendingSuccess = deferred<Bookmark>();
    const pendingFailure = deferred<Bookmark>();
    const existing = { ...bookmark('first'), id: 'bm-1', note: '旧笔记' };
    vi.mocked(api.listBookmarks).mockImplementation(async (id) =>
      id === 'first' ? [existing] : [bookmark(id)],
    );
    vi.mocked(api.updateBookmark)
      .mockReturnValueOnce(pendingSuccess.promise)
      .mockReturnValueOnce(pendingFailure.promise);

    const { result, rerender } = renderHook(
      (bookId: string) => useReaderBookmarks({ ...options, bookId, isAuthenticated: true }),
      { initialProps: 'first' },
    );
    await waitFor(() => expect(result.current.bookmarks).toEqual([existing]));

    let lateSuccessPromise!: Promise<boolean>;
    act(() => {
      lateSuccessPromise = result.current.handleUpdateBookmarkNote('bm-1', '新笔记');
    });
    rerender('second');
    await waitFor(() => expect(result.current.bookmarks).toEqual([bookmark('second')]));
    await act(async () => {
      pendingSuccess.resolve({ ...existing, note: '新笔记' });
    });
    await expect(lateSuccessPromise).resolves.toBe(false);
    expect(result.current.bookmarks).toEqual([bookmark('second')]);
    expect(toast.success).not.toHaveBeenCalled();

    let lateFailurePromise!: Promise<boolean>;
    act(() => {
      lateFailurePromise = result.current.handleUpdateBookmarkNote('second-bookmark', '失败');
    });
    await act(async () => {
      setAccessGeneration('expired');
      pendingFailure.reject(new Error('expired'));
    });
    await expect(lateFailurePromise).resolves.toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('deduplicates rapid bookmark creation clicks before React re-renders', async () => {
    const firstSave = deferred<Bookmark>();
    const create = vi.mocked(api.createBookmark).mockReturnValueOnce(firstSave.promise);
    vi.mocked(api.listBookmarks).mockResolvedValue([]);

    const { result } = renderHook(() => useReaderBookmarks({
      ...options,
      bookId: 'first',
      isAuthenticated: true,
    }));
    await waitFor(() => expect(api.listBookmarks).toHaveBeenCalledTimes(1));

    // Fire two clicks synchronously in the same tick before isSavingBookmark state updates.
    act(() => {
      void result.current.handleCreateBookmark();
      void result.current.handleCreateBookmark();
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.current.isSavingBookmark).toBe(true);

    await act(async () => {
      firstSave.resolve(bookmark('first'));
    });

    expect(result.current.isSavingBookmark).toBe(false);
    expect(result.current.bookmarks).toEqual([bookmark('first')]);
  });
});
