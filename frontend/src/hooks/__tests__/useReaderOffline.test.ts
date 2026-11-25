import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useReaderOffline } from '@/hooks/useReaderOffline';
import { api, type Book, type BookDownloadProgress } from '@/lib/api';
import { getOfflineLibrary } from '@/lib/library-access';
import { hasOfflineBook, saveOfflineBook } from '@/lib/offline-books';
import { deferred } from '@/test/deferred';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    getBook: vi.fn(),
    fetchBook: vi.fn(),
  },
}));

vi.mock('@/lib/library-access', () => ({
  getOfflineLibrary: vi.fn(),
}));

vi.mock('@/lib/offline-books', () => ({
  hasOfflineBook: vi.fn(),
  saveOfflineBook: vi.fn(),
}));

function makeBook(id = 'book-1'): Book {
  return {
    id,
    user_id: 'reader',
    title: 'Test Book',
    author: 'Author',
    filename: `${id}.epub`,
    format: 'epub',
    size: 1024,
    content_hash: 'hash-1',
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('useReaderOffline', () => {
  const defaultOptions = {
    bookId: 'book-1',
    library: 'personal:gen-1',
    authLoading: false,
    isAuthenticated: true,
    isOffline: false,
    checkAuth: vi.fn<() => Promise<string>>(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOfflineLibrary).mockReturnValue('personal:gen-1');
    vi.mocked(hasOfflineBook).mockResolvedValue(false);
    vi.mocked(saveOfflineBook).mockResolvedValue(undefined);
    defaultOptions.checkAuth.mockResolvedValue('authenticated');
  });

  it('starts idle and skips offline availability checks while online or loading auth', () => {
    const { result, rerender } = renderHook(
      (props: typeof defaultOptions) => useReaderOffline(props),
      { initialProps: defaultOptions },
    );

    expect(result.current.isRetryingAuth).toBe(false);
    expect(result.current.isSavingOffline).toBe(false);
    expect(result.current.offlineCheckedForBook).toBe(false);
    expect(result.current.hasLocalOfflineCopy).toBe(false);
    expect(result.current.offlineMissingCopy).toBe(false);
    expect(result.current.offlineDownloadLabel).toBeUndefined();
    expect(hasOfflineBook).not.toHaveBeenCalled();

    rerender({ ...defaultOptions, isOffline: true, authLoading: true });
    expect(hasOfflineBook).not.toHaveBeenCalled();

    rerender({ ...defaultOptions, isOffline: true, authLoading: false, bookId: '' });
    expect(hasOfflineBook).not.toHaveBeenCalled();
  });

  it('checks offline book availability when offline and exposes copy status', async () => {
    vi.mocked(hasOfflineBook).mockResolvedValueOnce(true);

    const { result, rerender } = renderHook(
      (props: typeof defaultOptions) => useReaderOffline(props),
      { initialProps: { ...defaultOptions, isOffline: true } },
    );

    await waitFor(() => expect(result.current.offlineCheckedForBook).toBe(true));
    expect(hasOfflineBook).toHaveBeenCalledWith('personal:gen-1', 'book-1');
    expect(result.current.hasLocalOfflineCopy).toBe(true);
    expect(result.current.offlineMissingCopy).toBe(false);

    vi.mocked(hasOfflineBook).mockResolvedValueOnce(false);
    rerender({ ...defaultOptions, isOffline: true, bookId: 'book-2' });

    expect(result.current.offlineCheckedForBook).toBe(false);
    expect(result.current.hasLocalOfflineCopy).toBe(false);
    expect(result.current.offlineMissingCopy).toBe(false);

    await waitFor(() => expect(result.current.offlineCheckedForBook).toBe(true));
    expect(result.current.hasLocalOfflineCopy).toBe(false);
    expect(result.current.offlineMissingCopy).toBe(true);
  });

  it('ignores stale offline availability responses on book switch, library change, or unmount', async () => {
    const firstCheck = deferred<boolean>();
    const secondCheck = deferred<boolean>();
    vi.mocked(hasOfflineBook)
      .mockReturnValueOnce(firstCheck.promise)
      .mockReturnValueOnce(secondCheck.promise);

    const { result, rerender, unmount } = renderHook(
      (props: typeof defaultOptions) => useReaderOffline(props),
      { initialProps: { ...defaultOptions, isOffline: true, bookId: 'book-1' } },
    );

    rerender({ ...defaultOptions, isOffline: true, bookId: 'book-2' });

    await act(async () => {
      firstCheck.resolve(true);
      await Promise.resolve();
    });
    expect(result.current.offlineCheckedForBook).toBe(false);
    expect(result.current.hasLocalOfflineCopy).toBe(false);

    // Library changes before secondCheck resolves
    vi.mocked(getOfflineLibrary).mockReturnValue('personal:gen-2');
    await act(async () => {
      secondCheck.resolve(true);
      await Promise.resolve();
    });
    expect(result.current.offlineCheckedForBook).toBe(false);

    // Unmount cancellation
    vi.mocked(getOfflineLibrary).mockReturnValue('personal:gen-1');
    const thirdCheck = deferred<boolean>();
    vi.mocked(hasOfflineBook).mockReturnValueOnce(thirdCheck.promise);
    rerender({ ...defaultOptions, isOffline: true, bookId: 'book-3' });
    unmount();

    await act(async () => {
      thirdCheck.resolve(true);
      await Promise.resolve();
    });
  });

  it('triggers checkAuth on window online event while offline and cleans up listeners', async () => {
    const checkAuth = vi.fn<() => Promise<string>>().mockResolvedValue('authenticated');
    const { rerender, unmount } = renderHook(
      (props: typeof defaultOptions) => useReaderOffline(props),
      { initialProps: { ...defaultOptions, isOffline: false, checkAuth } },
    );

    window.dispatchEvent(new Event('online'));
    expect(checkAuth).not.toHaveBeenCalled();

    rerender({ ...defaultOptions, isOffline: true, checkAuth });
    window.dispatchEvent(new Event('online'));
    expect(checkAuth).toHaveBeenCalledTimes(1);

    rerender({ ...defaultOptions, isOffline: false, checkAuth });
    window.dispatchEvent(new Event('online'));
    expect(checkAuth).toHaveBeenCalledTimes(1);

    rerender({ ...defaultOptions, isOffline: true, checkAuth });
    unmount();
    window.dispatchEvent(new Event('online'));
    expect(checkAuth).toHaveBeenCalledTimes(1);
  });

  it('retries connection, blocks re-entry and online listener during retry, and toasts when still offline', async () => {
    const pendingRetry = deferred<string>();
    const checkAuth = vi.fn<() => Promise<string>>().mockReturnValueOnce(pendingRetry.promise);

    const { result } = renderHook(() =>
      useReaderOffline({ ...defaultOptions, isOffline: true, checkAuth }),
    );

    let firstAttempt!: Promise<void>;
    act(() => {
      firstAttempt = result.current.handleRetryConnection();
    });
    expect(result.current.isRetryingAuth).toBe(true);
    expect(checkAuth).toHaveBeenCalledTimes(1);

    // Re-entry and window online event must be ignored while retrying
    await act(async () => {
      await result.current.handleRetryConnection();
    });
    window.dispatchEvent(new Event('online'));
    expect(checkAuth).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingRetry.resolve('offline');
      await firstAttempt;
    });
    expect(result.current.isRetryingAuth).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('仍无法连接服务器，请检查网络后再试');

    // Successful reconnect does not toast error
    vi.mocked(toast.error).mockClear();
    checkAuth.mockResolvedValueOnce('authenticated');
    await act(async () => {
      await result.current.handleRetryConnection();
    });
    expect(result.current.isRetryingAuth).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();

    // Rejection still clears isRetryingAuth
    checkAuth.mockRejectedValueOnce(new Error('network crash'));
    await expect(
      act(async () => {
        await result.current.handleRetryConnection();
      }),
    ).rejects.toThrow('network crash');
    expect(result.current.isRetryingAuth).toBe(false);
  });

  it('saves an already loaded book offline without calling fetchBook', async () => {
    const book = makeBook('book-1');
    const blob = new Blob(['epub-bytes'], { type: 'application/epub+zip' });
    vi.mocked(api.getBook).mockResolvedValueOnce(book);

    const { result } = renderHook(() => useReaderOffline(defaultOptions));

    await act(async () => {
      await result.current.saveBookOffline(blob);
    });

    expect(api.getBook).toHaveBeenCalledWith('book-1');
    expect(api.fetchBook).not.toHaveBeenCalled();
    expect(saveOfflineBook).toHaveBeenCalledWith(
      'personal:gen-1',
      book,
      blob,
      expect.any(Function),
    );
    const isStillCurrent = vi.mocked(saveOfflineBook).mock.calls[0][3] as () => boolean;
    expect(isStillCurrent()).toBe(true);
    vi.mocked(getOfflineLibrary).mockReturnValue('personal:gen-2');
    expect(isStillCurrent()).toBe(false);

    expect(toast.success).toHaveBeenCalledWith('图书已保存到此设备，可在断网时继续阅读');
    expect(result.current.isSavingOffline).toBe(false);
    expect(result.current.offlineDownloadLabel).toBeUndefined();
  });

  it('downloads book with progress label when loadedFile is null and blocks concurrent saves', async () => {
    const book = makeBook('book-1');
    const fetchedBlob = new Blob(['downloaded-epub']);
    const fetchDeferred = deferred<Blob>();
    let capturedOnProgress: ((progress: BookDownloadProgress) => void) | undefined;

    vi.mocked(api.getBook).mockResolvedValueOnce(book);
    vi.mocked(api.fetchBook).mockImplementationOnce((_id, opts) => {
      capturedOnProgress = opts?.onProgress;
      return fetchDeferred.promise;
    });

    const { result } = renderHook(() => useReaderOffline(defaultOptions));

    let savePromise!: Promise<void>;
    act(() => {
      savePromise = result.current.saveBookOffline(null);
    });

    expect(result.current.isSavingOffline).toBe(true);

    // Concurrent save attempt is ignored
    await act(async () => {
      await result.current.saveBookOffline(null);
    });
    expect(api.getBook).toHaveBeenCalledTimes(1);
    expect(api.fetchBook).toHaveBeenCalledTimes(1);

    act(() => {
      capturedOnProgress?.({
        downloadedBytes: 512 * 1024,
        totalBytes: 1024 * 1024,
        percentage: 42.9,
        bytesPerSecond: 1024,
        resumed: false,
      });
    });
    expect(result.current.offlineDownloadLabel).toBe('保存 42%');

    act(() => {
      capturedOnProgress?.({
        downloadedBytes: 2 * 1024 * 1024,
        totalBytes: null,
        percentage: null,
        bytesPerSecond: 1024,
        resumed: false,
      });
    });
    expect(result.current.offlineDownloadLabel).toBe('保存 2.0 MB');

    await act(async () => {
      fetchDeferred.resolve(fetchedBlob);
      await savePromise;
    });

    expect(saveOfflineBook).toHaveBeenCalledWith(
      'personal:gen-1',
      book,
      fetchedBlob,
      expect.any(Function),
    );
    expect(result.current.isSavingOffline).toBe(false);
    expect(result.current.offlineDownloadLabel).toBeUndefined();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('guards saveBookOffline when unauthenticated or library generation is stale', async () => {
    const { result: unauthResult } = renderHook(() =>
      useReaderOffline({ ...defaultOptions, isAuthenticated: false }),
    );
    await act(async () => {
      await unauthResult.current.saveBookOffline(new Blob(['a']));
    });
    expect(api.getBook).not.toHaveBeenCalled();

    vi.mocked(getOfflineLibrary).mockReturnValue('personal:other');
    const { result: staleResult } = renderHook(() => useReaderOffline(defaultOptions));
    await act(async () => {
      await staleResult.current.saveBookOffline(new Blob(['a']));
    });
    expect(api.getBook).not.toHaveBeenCalled();
  });

  it('aborts silently if library changes during download or during cache write', async () => {
    const bookDeferred = deferred<Book>();
    vi.mocked(api.getBook).mockReturnValueOnce(bookDeferred.promise);

    const { result } = renderHook(() => useReaderOffline(defaultOptions));

    let savePromise!: Promise<void>;
    act(() => {
      savePromise = result.current.saveBookOffline(new Blob(['a']));
    });

    vi.mocked(getOfflineLibrary).mockReturnValue('personal:gen-2');
    await act(async () => {
      bookDeferred.resolve(makeBook('book-1'));
      await savePromise;
    });

    expect(saveOfflineBook).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.isSavingOffline).toBe(false);

    // Now test library changing after saveOfflineBook resolves
    vi.mocked(getOfflineLibrary).mockReturnValue('personal:gen-1');
    const writeDeferred = deferred<void>();
    vi.mocked(api.getBook).mockResolvedValueOnce(makeBook('book-1'));
    vi.mocked(saveOfflineBook).mockReturnValueOnce(writeDeferred.promise);

    act(() => {
      savePromise = result.current.saveBookOffline(new Blob(['b']));
    });
    await waitFor(() => expect(saveOfflineBook).toHaveBeenCalledTimes(1));

    vi.mocked(getOfflineLibrary).mockReturnValue('personal:gen-3');
    await act(async () => {
      writeDeferred.resolve();
      await savePromise;
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.isSavingOffline).toBe(false);
  });

  it('reports Error and non-Error failures via toast.error and resets state', async () => {
    vi.mocked(api.getBook).mockResolvedValueOnce(makeBook('book-1'));
    vi.mocked(saveOfflineBook).mockRejectedValueOnce(new Error('存储空间不足'));

    const { result } = renderHook(() => useReaderOffline(defaultOptions));

    await act(async () => {
      await result.current.saveBookOffline(new Blob(['a']));
    });

    expect(toast.error).toHaveBeenCalledWith('存储空间不足');
    expect(result.current.isSavingOffline).toBe(false);
    expect(result.current.offlineDownloadLabel).toBeUndefined();

    vi.mocked(api.getBook).mockRejectedValueOnce('unknown failure');
    await act(async () => {
      await result.current.saveBookOffline(new Blob(['a']));
    });

    expect(toast.error).toHaveBeenCalledWith('保存离线图书失败');
    expect(result.current.isSavingOffline).toBe(false);
  });
});
