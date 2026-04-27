import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgress } from '@/hooks/useProgress';
import { api } from '@/lib/api';
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
  ApiError: class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  api: {
    getProgress: vi.fn(),
    saveProgress: vi.fn(),
    saveProgressOnUnload: vi.fn(),
  },
}));

describe('useProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads progress on mount', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: 'epubcfi(/6/2)', percentage: 30 }));

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 100 }),
    );

    expect(result.current.isLoading).toBe(true);
    expect(api.getProgress).toHaveBeenCalledWith('book-1');

    await act(async () => {
      await Promise.resolve();
    });

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
    // Should not have saved yet (debounced)
    expect(api.saveProgress).not.toHaveBeenCalled();
  });

  it('debounced save after delay', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: 'epubcfi(/2)', percentage: 10, updated_at: '2024-01-01T00:00:00Z' }));
    vi.mocked(api.saveProgress).mockResolvedValue(MOCK_PROGRESS());

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 200, debounceDelay: 100 }),
    );

    // Wait for load to complete (sets lastSavedRef to 10%)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Update progress with > 1% change
    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 50);
    });

    // Interval fires at 200ms, then debounce at +100ms = 300ms total
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
    vi.mocked(api.saveProgress).mockResolvedValue(MOCK_PROGRESS());

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 5000 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 50);
    });

    // No save yet due to long debounce
    expect(api.saveProgress).not.toHaveBeenCalled();

    // Force save
    act(() => {
      result.current.saveNow();
    });

    expect(api.saveProgress).toHaveBeenCalledWith('book-1', 'epubcfi(/6/4)', 50, {
      expectedUpdatedAt: undefined,
      deviceId: expect.any(String),
    });
  });

  it('skips save when change is less than 1%', async () => {
    vi.mocked(api.getProgress).mockResolvedValue(MOCK_PROGRESS({ cfi: 'epubcfi(/6/2)', percentage: 50 }));
    vi.mocked(api.saveProgress).mockResolvedValue(MOCK_PROGRESS());

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 100 }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/2)', 50.5);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    // Should not save because change is < 1%
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
    vi.mocked(api.saveProgress).mockResolvedValue(MOCK_PROGRESS());

    const { result } = renderHook(() =>
      useProgress({ bookId: 'book-1', autoSaveInterval: 999999, debounceDelay: 5000 }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      result.current.updateProgress('epubcfi(/6/4)', 50);
    });

    // With 5s debounce, should not save after 100ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(api.saveProgress).not.toHaveBeenCalled();

    // But saveNow bypasses debounce
    act(() => {
      result.current.saveNow();
    });
    expect(api.saveProgress).toHaveBeenCalled();
  });
});
