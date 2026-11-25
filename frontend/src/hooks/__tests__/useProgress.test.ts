import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ACCESS_GENERATION_KEY, accessStorageKey } from '@/lib/library-access';
import { useProgress } from '@/hooks/useProgress';
import { ApiError, api } from '@/lib/api';
import type { Progress } from '@/lib/api';

const MOCK_PROGRESS = (overrides: Partial<Progress> = {}): Progress => ({
  book_id: 'book-1',
  user_id: 'user-1',
  cfi: '',
  percentage: 0,
  updated_at: new Date().toISOString(),
  ...overrides,
});

vi.mock('@/lib/api', () => ({
  AUTH_EXPIRED_EVENT: 'z-reader-auth-expired',
  ApiError: class ApiError extends Error {
    status: number;
    details?: unknown;

    constructor(message: string, status: number, details?: unknown) {
      super(message);
      this.status = status;
      this.details = details;
    }
  },
  api: {
    getProgress: vi.fn(),
    saveProgress: vi.fn(),
    saveProgressOnUnload: vi.fn(),
  },
}));

function deferredProgress() {
  let resolve!: (progress: Progress) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Progress>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setDocumentVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
  });
}

describe('useProgress', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    setDocumentVisibility('visible');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads progress from the current access session without replaying the previous queue', async () => {
    const queueKey = 'z-reader-offline-pending-sync-books';
    const progressKey = 'z-reader-offline-progress:book-1';
    localStorage.setItem(accessStorageKey(queueKey, 'previous'), JSON.stringify(['book-1']));
    localStorage.setItem(accessStorageKey(progressKey, 'previous'), JSON.stringify({
      cfi: 'epubcfi(/6/2)', percentage: 10,
    }));
    localStorage.setItem(accessStorageKey(progressKey, 'current'), JSON.stringify({
      cfi: 'epubcfi(/6/4)', percentage: 20,
    }));
    localStorage.setItem(ACCESS_GENERATION_KEY, 'current');
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: '', percentage: 0 }));

    const { result } = renderHook(() => useProgress({ bookId: 'book-1' }));
    expect(result.current.progress).toMatchObject({ cfi: 'epubcfi(/6/4)', percentage: 20 });
    await waitFor(() => expect(api.getProgress).toHaveBeenCalledWith('book-1'));
    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('loads progress on mount', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/2)', percentage: 30 }),
    );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 100 }),
    );

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });

    expect(api.getProgress).toHaveBeenCalledWith('book-1');
    expect(result.current.progress?.cfi).toBe('epubcfi(/6/2)');
    expect(result.current.progress?.percentage).toBe(30);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty when no saved progress', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: '', percentage: 0 }));

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.progress).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('hydrates synchronously from offline localStorage snapshot and ignores corrupt cache', async () => {
    localStorage.setItem(
      'z-reader-offline-progress:book-1',
      JSON.stringify({
        cfi: 'epubcfi(/6/8)',
        percentage: 42,
        updated_at: '2026-05-02T10:00:00.000Z',
        device_id: 'dev-local',
      }),
    );
    vi.mocked(api.getProgress).mockResolvedValue(
      MOCK_PROGRESS({
        cfi: 'epubcfi(/6/4)',
        percentage: 20,
        updated_at: '2026-05-01T10:00:00.000Z',
      }),
    );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );

    // Hydrated synchronously before remote finishes
    expect(result.current.isLoading).toBe(false);
    expect(result.current.progress).toMatchObject({
      cfi: 'epubcfi(/6/8)',
      percentage: 42,
      remote: false,
    });

    // After remote loads, newer local cache wins over older remote progress
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.progress?.cfi).toBe('epubcfi(/6/8)');
    expect(result.current.progress?.percentage).toBe(42);

    // Corrupt localStorage does not throw
    localStorage.setItem('z-reader-offline-progress:book-bad', '{invalid-json');
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: '', percentage: 0 }));
    const { result: badResult } = renderHook(() =>
      useProgress({ bookId: 'book-bad', autoSaveInterval: 999999 }),
    );
    expect(badResult.current.isLoading).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(badResult.current.progress).toBeNull();
  });

  it('keeps remote progress when remote timestamp is newer than local offline cache', async () => {
    localStorage.setItem(
      'z-reader-offline-progress:book-1',
      JSON.stringify({
        cfi: 'epubcfi(/6/2)',
        percentage: 15,
        updated_at: '2026-05-01T08:00:00.000Z',
      }),
    );
    vi.mocked(api.getProgress).mockResolvedValue(
      MOCK_PROGRESS({
        cfi: 'epubcfi(/6/10)',
        percentage: 65,
        updated_at: '2026-05-02T12:00:00.000Z',
      }),
    );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.progress?.cfi).toBe('epubcfi(/6/10)');
    expect(result.current.progress?.percentage).toBe(65);
  });

  it('falls back to offline localStorage progress when initial remote load fails', async () => {
    localStorage.setItem(
      'z-reader-offline-progress:book-1',
      JSON.stringify({
        cfi: 'epubcfi(/6/12)',
        percentage: 77,
        updated_at: '2026-05-02T09:00:00.000Z',
      }),
    );
    vi.mocked(api.getProgress).mockRejectedValue(new Error('Offline'));

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.progress?.cfi).toBe('epubcfi(/6/12)');
    expect(result.current.progress?.percentage).toBe(77);
  });

  it('updates progress without immediate save', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: '', percentage: 0 }));

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 100 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 50);
    });

    expect(result.current.progress).toEqual({ cfi: 'epubcfi(/6/4)', percentage: 50 });
    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('debounced save after delay', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/2)', percentage: 10, updated_at: '2024-01-01T00:00:00Z' }),
    );
    vi.mocked(api.saveProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/4)', percentage: 50, updated_at: '2024-01-01T00:05:00Z' }),
    );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 200, debounceDelay: 100 }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 50);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(api.saveProgress).toHaveBeenCalledTimes(1);
    expect(api.saveProgress).toHaveBeenCalledWith('book-1', 'epubcfi(/6/4)', 50, {
      expectedUpdatedAt: '2024-01-01T00:00:00Z',
      deviceId: expect.any(String),
    });
  });

  it('saveNow forces immediate save', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: '', percentage: 0 }));
    vi.mocked(api.saveProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/4)', percentage: 50 }),
    );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 5000 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 50);
    });

    expect(api.saveProgress).not.toHaveBeenCalled();

    await act(async () => {
      result.current.saveNow();
      await Promise.resolve();
    });

    expect(api.saveProgress).toHaveBeenCalledWith('book-1', 'epubcfi(/6/4)', 50, {
      createOnly: true,
      deviceId: expect.any(String),
    });
  });

  it('skips save when change is less than 1%', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/2)', percentage: 50 }),
    );
    vi.mocked(api.saveProgress).mockResolvedValue(MOCK_PROGRESS());

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 100, debounceDelay: 50 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/2)', 50.5);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('handles load progress error gracefully', async () => {
    vi.mocked(api.getProgress).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('custom debounce delay does not cause immediate save', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: '', percentage: 0 }));
    vi.mocked(api.saveProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/4)', percentage: 50 }),
    );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 5000 }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 50);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(api.saveProgress).not.toHaveBeenCalled();

    await act(async () => {
      result.current.saveNow();
      await Promise.resolve();
    });
    expect(api.saveProgress).toHaveBeenCalled();
  });

  it('queues offline backup on network save error and syncs when back online', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: '', percentage: 0 }));
    vi.mocked(api.saveProgress)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(MOCK_PROGRESS({ cfi: 'epubcfi(/6/6)', percentage: 55 }));

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/6)', 55);
    });

    await act(async () => {
      result.current.saveNow();
      await Promise.resolve();
    });

    const cachedRaw = localStorage.getItem('z-reader-offline-progress:book-1');
    expect(cachedRaw).not.toBeNull();
    expect(JSON.parse(cachedRaw!)).toMatchObject({ cfi: 'epubcfi(/6/6)', percentage: 55 });
    expect(JSON.parse(localStorage.getItem('z-reader-offline-pending-sync-books')!)).toEqual(['book-1']);
    expect(result.current.progress).toMatchObject({ cfi: 'epubcfi(/6/6)', percentage: 55, remote: false });

    // Trigger online recovery
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.saveProgress).toHaveBeenCalledTimes(2);
    expect(api.saveProgress).toHaveBeenLastCalledWith('book-1', 'epubcfi(/6/6)', 55, {
      createOnly: true,
      deviceId: expect.any(String),
    });
    expect(localStorage.getItem('z-reader-offline-progress:book-1')).toBeNull();
    expect(JSON.parse(localStorage.getItem('z-reader-offline-pending-sync-books')!)).toEqual([]);
  });

  it('keeps B’s server progress when A reconnects with a stale offline position', async () => {
    const initial = MOCK_PROGRESS({
      cfi: 'epubcfi(/6/2)', percentage: 10, updated_at: '2026-05-01T00:00:00.123456789Z',
    });
    let server = initial;
    vi.mocked(api.getProgress).mockImplementation(async () => server);
    vi.mocked(api.saveProgress).mockImplementation(async (_id, cfi, percentage, options) => {
      if (options?.expectedUpdatedAt !== server.updated_at) {
        throw new ApiError('Conflict', 409, { progress: server });
      }
      server = MOCK_PROGRESS({ cfi, percentage });
      return server;
    });
    const openReader = () => renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );
    const first = openReader();
    await act(async () => {});
    first.unmount();

    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = openReader();
    await act(async () => {});
    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 20);
      result.current.saveNow();
      result.current.updateProgress('epubcfi(/6/6)', 30);
      result.current.saveNow();
    });
    expect(api.saveProgress).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('z-reader-offline-progress:book-1')!))
      .toMatchObject({ expected_updated_at: initial.updated_at });

    const fromB = MOCK_PROGRESS({
      cfi: 'epubcfi(/6/20)', percentage: 80, updated_at: '2026-05-02T00:00:00Z',
    });
    server = fromB;
    online.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('online'));
    });
    expect(api.saveProgress).toHaveBeenCalledExactlyOnceWith('book-1', 'epubcfi(/6/6)', 30, {
      expectedUpdatedAt: initial.updated_at,
      deviceId: expect.any(String),
    });
    expect(server).toEqual(fromB);
    expect(localStorage.getItem('z-reader-offline-progress:book-1')).toBeNull();
    expect(result.current.progress).toMatchObject({ cfi: 'epubcfi(/6/6)', remote: false });

    await act(async () => {
      result.current.updateProgress('epubcfi(/6/8)', 40);
      result.current.saveNow();
    });
    expect(api.saveProgress).toHaveBeenLastCalledWith('book-1', 'epubcfi(/6/8)', 40, {
      expectedUpdatedAt: fromB.updated_at,
      deviceId: expect.any(String),
    });
  });

  it('preserves unconfirmed data across a 503 and advances the base after a successful replay', async () => {
    const initial = '2026-05-01T00:00:00Z';
    const afterFirstReplay = '2026-05-02T00:00:00Z';
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({
      cfi: 'epubcfi(/6/2)', percentage: 10, updated_at: initial,
    }));
    const firstReplay = deferredProgress();
    vi.mocked(api.saveProgress)
      .mockRejectedValueOnce(new ApiError('Unavailable', 503))
      .mockRejectedValueOnce(new ApiError('Unavailable', 503))
      .mockReturnValueOnce(firstReplay.promise)
      .mockResolvedValueOnce(MOCK_PROGRESS({ cfi: 'epubcfi(/6/8)', percentage: 40 }));
    const { result } = renderHook(() => useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }));
    await act(async () => {});
    await act(async () => {
      result.current.updateProgress('epubcfi(/6/4)', 20);
      result.current.saveNow();
    });
    const queued = localStorage.getItem('z-reader-offline-progress:book-1');
    expect(queued).not.toBeNull();
    // Leave the reader open and online without dispatching any browser events.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.saveProgress).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('z-reader-offline-progress:book-1')).toBe(queued);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.saveProgress).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.saveProgress).toHaveBeenNthCalledWith(3, 'book-1', 'epubcfi(/6/4)', 20, {
      expectedUpdatedAt: initial, deviceId: expect.any(String),
    });
    act(() => {
      result.current.updateProgress('epubcfi(/6/8)', 40);
      result.current.saveNow();
    });
    await act(async () => {
      firstReplay.resolve(MOCK_PROGRESS({
        cfi: 'epubcfi(/6/4)', percentage: 20, updated_at: afterFirstReplay,
      }));
    });
    expect(api.saveProgress).toHaveBeenNthCalledWith(4, 'book-1', 'epubcfi(/6/8)', 40, {
      expectedUpdatedAt: afterFirstReplay, deviceId: expect.any(String),
    });
    expect(localStorage.getItem('z-reader-offline-progress:book-1')).toBeNull();
    expect(result.current.progress?.cfi).toBe('epubcfi(/6/8)');
  });

  it('caps the retry delay while the server remains unavailable', async () => {
    localStorage.setItem('z-reader-offline-pending-sync-books', JSON.stringify(['book-1']));
    localStorage.setItem('z-reader-offline-progress:book-1', JSON.stringify({
      cfi: 'epubcfi(/6/4)', percentage: 20,
    }));
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS());
    vi.mocked(api.saveProgress).mockRejectedValue(new ApiError('Unavailable', 503));
    renderHook(() => useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }));
    await act(async () => {});
    expect(api.saveProgress).toHaveBeenCalledTimes(1);

    for (const [index, delay] of [1000, 2000, 4000, 8000, 16000, 30000, 30000].entries()) {
      await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
      expect(api.saveProgress).toHaveBeenCalledTimes(index + 2);
    }
  });

  it.each(['offline', 'disabled', 'access change', 'unmount'])(
    'stops scheduled replay on %s and retains queued progress',
    async (reason) => {
      const queueKey = 'z-reader-offline-pending-sync-books';
      const snapshotKey = 'z-reader-offline-progress:book-1';
      const snapshot = JSON.stringify({ cfi: 'epubcfi(/6/4)', percentage: 20 });
      localStorage.setItem(queueKey, JSON.stringify(['book-1']));
      localStorage.setItem(snapshotKey, snapshot);
      vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS());
      vi.mocked(api.saveProgress)
        .mockRejectedValueOnce(new ApiError('Unavailable', 503))
        .mockResolvedValue(MOCK_PROGRESS({ cfi: 'epubcfi(/6/4)', percentage: 20 }));
      const { rerender, unmount } = renderHook(
        ({ enabled }) => useProgress({ bookId: 'book-1', remoteSyncEnabled: enabled }),
        { initialProps: { enabled: true } },
      );
      await act(async () => {});
      expect(api.saveProgress).toHaveBeenCalledTimes(1);

      if (reason === 'offline') {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        window.dispatchEvent(new Event('offline'));
      } else if (reason === 'disabled') {
        rerender({ enabled: false });
      } else if (reason === 'access change') {
        localStorage.setItem(ACCESS_GENERATION_KEY, 'new-session');
        window.dispatchEvent(new StorageEvent('storage', { key: ACCESS_GENERATION_KEY }));
      } else {
        unmount();
      }
      await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
      expect(api.saveProgress).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(snapshotKey)).toBe(snapshot);
      expect(JSON.parse(localStorage.getItem(queueKey)!)).toEqual(['book-1']);

      if (reason === 'offline' || reason === 'disabled') {
        await act(async () => {
          if (reason === 'offline') {
            vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
            window.dispatchEvent(new Event('online'));
          } else {
            rerender({ enabled: true });
          }
        });
        expect(api.saveProgress).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem(snapshotKey)).toBeNull();
      }
    },
  );

  it('resumes on remount after a previous reader’s in-flight replay fails', async () => {
    const queueKey = 'z-reader-offline-pending-sync-books';
    const snapshotKey = 'z-reader-offline-progress:book-1';
    localStorage.setItem(queueKey, JSON.stringify(['book-1']));
    localStorage.setItem(snapshotKey, JSON.stringify({ cfi: 'epubcfi(/6/4)', percentage: 20 }));
    const replay = deferredProgress();
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS());
    vi.mocked(api.saveProgress)
      .mockReturnValueOnce(replay.promise)
      .mockResolvedValueOnce(MOCK_PROGRESS({ cfi: 'epubcfi(/6/4)', percentage: 20 }));

    const openReader = () => renderHook(() => useProgress({ bookId: 'book-1' }));
    const first = openReader();
    expect(api.saveProgress).toHaveBeenCalledTimes(1);
    first.unmount();
    openReader();
    await act(async () => {});
    expect(api.saveProgress).toHaveBeenCalledTimes(1);

    await act(async () => { replay.reject(new ApiError('Unavailable', 503)); });
    expect(api.saveProgress).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.saveProgress).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(snapshotKey)).toBeNull();
  });

  it('uses conditional creation for a legacy queue and retains a newer edit when replay conflicts', async () => {
    const snapshotKey = 'z-reader-offline-progress:book-1';
    localStorage.setItem('z-reader-offline-pending-sync-books', JSON.stringify(['book-1']));
    localStorage.setItem(snapshotKey, JSON.stringify({
      cfi: 'epubcfi(/6/4)', percentage: 20, updated_at: '2099-05-02T00:00:00Z',
    }));
    const fromB = MOCK_PROGRESS({
      cfi: 'epubcfi(/6/20)', percentage: 80, updated_at: '2026-05-02T00:00:00Z',
    });
    vi.mocked(api.getProgress).mockResolvedValue(fromB);
    const replay = deferredProgress();
    vi.mocked(api.saveProgress).mockReturnValueOnce(replay.promise);
    const { result } = renderHook(() => useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }));
    await act(async () => {});
    expect(api.saveProgress).toHaveBeenCalledExactlyOnceWith('book-1', 'epubcfi(/6/4)', 20, {
      createOnly: true, deviceId: expect.any(String),
    });
    act(() => {
      result.current.updateProgress('epubcfi(/6/6)', 30);
      result.current.saveNow();
    });
    const newer = localStorage.getItem(snapshotKey);
    await act(async () => { replay.reject(new ApiError('Conflict', 409, { progress: fromB })); });
    expect(api.saveProgress).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(snapshotKey)).toBe(newer);
    expect(JSON.parse(newer!)).toMatchObject({ cfi: 'epubcfi(/6/6)', expected_updated_at: null });
  });

  it('keeps an unsaved offline edit on its original base after a replay conflict', async () => {
    const initial = MOCK_PROGRESS({
      cfi: 'epubcfi(/6/2)', percentage: 10, updated_at: '2026-05-01T00:00:00Z',
    });
    const fromB = MOCK_PROGRESS({
      cfi: 'epubcfi(/6/20)', percentage: 80, updated_at: '2026-05-02T00:00:00Z',
    });
    vi.mocked(api.getProgress).mockResolvedValue(initial);
    const conflict = new ApiError('Conflict', 409, { progress: fromB });
    vi.mocked(api.saveProgress).mockRejectedValue(conflict);
    const online = vi.spyOn(navigator, 'onLine', 'get');
    const { result } = renderHook(() => useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }));
    await act(async () => {});
    online.mockReturnValue(false);
    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 20);
      result.current.saveNow();
      result.current.updateProgress('epubcfi(/6/8)', 40);
    });
    online.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await act(async () => { result.current.saveNow(); });

    expect(api.saveProgress).toHaveBeenCalledTimes(2);
    expect(api.saveProgress).toHaveBeenLastCalledWith('book-1', 'epubcfi(/6/8)', 40, {
      expectedUpdatedAt: initial.updated_at, deviceId: expect.any(String),
    });
    expect(result.current.progress?.cfi).toBe('epubcfi(/6/8)');
  });

  it('reloads latest remote progress on 409 conflict and ignores offline queue on non-409 ApiError', async () => {
    vi.mocked(api.getProgress)
      .mockResolvedValueOnce(MOCK_PROGRESS({ cfi: 'epubcfi(/6/2)', percentage: 10, updated_at: '2026-05-01T00:00:00Z' }))
      .mockResolvedValueOnce(MOCK_PROGRESS({ cfi: 'epubcfi(/6/20)', percentage: 80, updated_at: '2026-05-01T01:00:00Z' }));
    vi.mocked(api.saveProgress)
      .mockRejectedValueOnce(new ApiError('Conflict', 409))
      .mockRejectedValueOnce(new ApiError('Bad Request', 400));

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 30);
    });

    await act(async () => {
      result.current.saveNow();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Resolved 409 by pulling latest remote progress
    expect(result.current.progress?.cfi).toBe('epubcfi(/6/20)');
    expect(result.current.progress?.percentage).toBe(80);
    expect(localStorage.getItem('z-reader-offline-progress:book-1')).toBeNull();

    // Non-409 ApiError does not store offline backup
    act(() => {
      result.current.updateProgress('epubcfi(/6/22)', 85);
    });
    await act(async () => {
      result.current.saveNow();
      await Promise.resolve();
    });
    expect(localStorage.getItem('z-reader-offline-progress:book-1')).toBeNull();
  });

  it('handles syncOfflineProgressQueue edge cases (missing entry, ApiError discard, network break)', async () => {
    localStorage.setItem(
      'z-reader-offline-pending-sync-books',
      JSON.stringify(['missing-book', 'bad-book', 'retry-book', 'later-book']),
    );
    localStorage.setItem(
      'z-reader-offline-progress:bad-book',
      JSON.stringify({ cfi: 'epubcfi(/bad)', percentage: 10, device_id: 'd1' }),
    );
    localStorage.setItem(
      'z-reader-offline-progress:retry-book',
      JSON.stringify({ cfi: 'epubcfi(/retry)', percentage: 20, device_id: 'd1' }),
    );
    localStorage.setItem(
      'z-reader-offline-progress:later-book',
      JSON.stringify({ cfi: 'epubcfi(/later)', percentage: 30, device_id: 'd1' }),
    );

    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: '', percentage: 0 }));
    vi.mocked(api.saveProgress)
      .mockRejectedValueOnce(new ApiError('Invalid CFI', 422))
      .mockRejectedValueOnce(new Error('Network interrupted'))
      .mockResolvedValue(MOCK_PROGRESS({ cfi: 'epubcfi(/saved)' }));

    renderHook(() => useProgress({ bookId: 'book-current', autoSaveInterval: 999999 }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // missing-book and bad-book removed; retry-book and later-book kept after network break
    expect(localStorage.getItem('z-reader-offline-progress:bad-book')).toBeNull();
    expect(localStorage.getItem('z-reader-offline-progress:retry-book')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('z-reader-offline-pending-sync-books')!)).toEqual([
      'retry-book',
      'later-book',
    ]);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(vi.mocked(api.saveProgress).mock.calls.map(([id]) => id)).toEqual([
      'bad-book', 'retry-book', 'retry-book', 'later-book',
    ]);
    expect(JSON.parse(localStorage.getItem('z-reader-offline-pending-sync-books')!)).toEqual([]);
  });

  it('flushes pending progress on visibilitychange(hidden) and pagehide/beforeunload', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/2)', percentage: 10, updated_at: '2026-05-01T00:00:00Z' }),
    );
    vi.mocked(api.saveProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/8)', percentage: 40, updated_at: '2026-05-01T00:10:00Z' }),
    );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 5000 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Pagehide without pending change does not call saveProgressOnUnload
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(api.saveProgressOnUnload).not.toHaveBeenCalled();

    // Pending change triggers saveProgressOnUnload on pagehide
    act(() => {
      result.current.updateProgress('epubcfi(/6/6)', 30);
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(api.saveProgressOnUnload).toHaveBeenCalledWith('book-1', 'epubcfi(/6/6)', 30, {
      expectedUpdatedAt: '2026-05-01T00:00:00Z',
      deviceId: expect.any(String),
    });

    // Pending change triggers immediate saveProgress when document becomes hidden
    act(() => {
      result.current.updateProgress('epubcfi(/6/8)', 40);
      setDocumentVisibility('hidden');
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(api.saveProgress).toHaveBeenCalledWith('book-1', 'epubcfi(/6/8)', 40, {
      expectedUpdatedAt: '2026-05-01T00:00:00Z',
      deviceId: expect.any(String),
    });
  });

  it('refreshes remote progress on focus/visible when updated by another device', async () => {
    localStorage.setItem('z-reader-device-id', 'this-device');
    vi.mocked(api.getProgress)
      .mockResolvedValueOnce(
        MOCK_PROGRESS({
          cfi: 'epubcfi(/6/2)',
          percentage: 10,
          updated_at: '2026-05-01T00:00:00Z',
          device_id: 'this-device',
        }),
      )
      .mockResolvedValueOnce(
        MOCK_PROGRESS({
          cfi: 'epubcfi(/6/4)',
          percentage: 25,
          updated_at: '2026-05-01T01:00:00Z',
          device_id: 'this-device', // same device -> ignored
        }),
      )
      .mockResolvedValueOnce(
        MOCK_PROGRESS({
          cfi: 'epubcfi(/6/12)',
          percentage: 60,
          updated_at: '2026-05-01T02:00:00Z',
          device_id: 'other-device', // newer & other device -> applied
        }),
      );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999 }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.progress?.percentage).toBe(10);

    // Focus returns same-device update -> ignored
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(result.current.progress?.percentage).toBe(10);

    // Visibility visible returns other-device newer update -> applied
    await act(async () => {
      setDocumentVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(result.current.progress?.cfi).toBe('epubcfi(/6/12)');
    expect(result.current.progress?.percentage).toBe(60);
  });

  it('skips remote calls when remoteSyncEnabled is false and syncs once re-enabled', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/2)', percentage: 10, updated_at: '2026-05-01T00:00:00Z' }),
    );
    vi.mocked(api.saveProgress).mockResolvedValue(
      MOCK_PROGRESS({ cfi: 'epubcfi(/6/9)', percentage: 45, updated_at: '2026-05-02T00:00:00Z' }),
    );

    const { result, rerender } = renderHook(
      ({ remoteSyncEnabled }) =>
        useProgress({
          bookId: 'book-offline',
          autoSaveInterval: 999999,
          remoteSyncEnabled,
        }),
      { initialProps: { remoteSyncEnabled: false } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(api.getProgress).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);

    // Saving while offline writes directly to localStorage without hitting the API
    act(() => {
      result.current.updateProgress('epubcfi(/6/9)', 45);
      result.current.saveNow();
    });

    expect(api.saveProgress).not.toHaveBeenCalled();
    expect(localStorage.getItem('z-reader-offline-progress:book-offline')).toContain('epubcfi(/6/9)');
    expect(JSON.parse(localStorage.getItem('z-reader-offline-pending-sync-books')!)).toContain(
      'book-offline',
    );

    // Re-enabling remote sync flushes the pending offline progress queue
    rerender({ remoteSyncEnabled: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.saveProgress).toHaveBeenCalledWith(
      'book-offline',
      'epubcfi(/6/9)',
      45,
      { createOnly: true, deviceId: expect.any(String) },
    );
  });

  it('degrades gracefully when localStorage getItem, setItem, and removeItem throw', async () => {
    const storageError = new DOMException('Storage is blocked', 'SecurityError');
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw storageError;
    });
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw storageError;
    });
    const removeItemSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw storageError;
    });

    vi.mocked(api.getProgress).mockResolvedValueOnce(
      MOCK_PROGRESS({
        cfi: '',
        percentage: 0,
      }),
    );
    vi.mocked(api.saveProgress).mockResolvedValue(
      MOCK_PROGRESS({
        cfi: 'epubcfi(/6/10)',
        percentage: 55,
        updated_at: '2026-05-01T02:00:00Z',
      }),
    );

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-private', autoSaveInterval: 999999 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Empty initial progress exercises safeRemoveStorageItem in rememberServerVersion
    expect(result.current.isLoading).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(getItemSpy).toHaveBeenCalled();
    expect(removeItemSpy).toHaveBeenCalled();

    // Save progress remotely (exercises safeGetStorageItem + safeSetStorageItem + getDeviceId)
    await act(async () => {
      result.current.updateProgress('epubcfi(/6/10)', 55);
      result.current.saveNow();
      await Promise.resolve();
    });
    expect(setItemSpy).toHaveBeenCalled();
    expect(api.saveProgress).toHaveBeenCalledWith(
      'book-private',
      'epubcfi(/6/10)',
      55,
      { createOnly: true, deviceId: expect.any(String) },
    );

    // Focus triggers remote progress refresh cleanly even when localStorage throws
    vi.mocked(api.getProgress).mockResolvedValueOnce(
      MOCK_PROGRESS({
        cfi: 'epubcfi(/6/11)',
        percentage: 62,
        updated_at: '2026-05-01T03:00:00Z',
        device_id: 'other-device',
      }),
    );
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(result.current.progress).toMatchObject({
      cfi: 'epubcfi(/6/11)',
      percentage: 62,
    });

    // beforeunload save completes without throwing
    act(() => {
      result.current.updateProgress('epubcfi(/6/12)', 70);
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(api.saveProgressOnUnload).toHaveBeenCalledWith(
      'book-private',
      'epubcfi(/6/12)',
      70,
      { createOnly: true, deviceId: expect.any(String) },
    );
  });

  it('handles offline progress updates without throwing when localStorage writes fail', async () => {
    const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw quotaError;
    });
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw quotaError;
    });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw quotaError;
    });

    const { result } = renderHook(() =>
      useProgress({
        bookId: 'book-quota',
        autoSaveInterval: 999999,
        remoteSyncEnabled: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isLoading).toBe(false);

    expect(() => {
      act(() => {
        result.current.updateProgress('epubcfi(/6/14)', 80);
        result.current.saveNow();
      });
    }).not.toThrow();

    expect(getItemSpy).toHaveBeenCalled();
    expect(setItemSpy).toHaveBeenCalled();
    expect(result.current.progress).toMatchObject({
      cfi: 'epubcfi(/6/14)',
      percentage: 80,
      remote: false,
    });
    expect(api.saveProgress).not.toHaveBeenCalled();
  });
});
