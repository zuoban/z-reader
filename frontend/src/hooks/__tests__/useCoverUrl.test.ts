import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCoverUrlCache,
  getCoverCacheSizeForTests,
  scheduleCoverFetch,
  useCoverUrl,
} from '@/hooks/useCoverUrl';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    fetchCover: vi.fn(),
  },
}));

type ObserverInstance = {
  callback: IntersectionObserverCallback;
  elements: Element[];
  options?: IntersectionObserverInit;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  trigger: (isIntersecting: boolean) => void;
};

let observers: ObserverInstance[] = [];

function installIntersectionObserverMock() {
  observers = [];
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin: string;
    readonly thresholds = [0];
    readonly callback: IntersectionObserverCallback;
    readonly elements: Element[] = [];
    readonly options?: IntersectionObserverInit;
    observe = vi.fn((el: Element) => {
      this.elements.push(el);
    });
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = callback;
      this.options = options;
      this.rootMargin = options?.rootMargin ?? '';
      observers.push(this);
    }

    trigger(isIntersecting: boolean) {
      const target = this.elements[0] ?? document.createElement('div');
      this.callback(
        [{ isIntersecting, target } as IntersectionObserverEntry],
        this,
      );
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
}

function CoverProbe({
  bookId,
  coverVersion,
  size,
}: {
  bookId: string;
  coverVersion?: string;
  size?: 'thumb';
}) {
  const { coverUrl, ref } = useCoverUrl(bookId, coverVersion, size);
  return React.createElement(
    'div',
    { ref, 'data-testid': 'cover-probe', 'data-cover-url': coverUrl ?? '' },
    coverUrl ?? 'empty',
  );
}

describe('cover fetch queue', () => {
  afterEach(() => {
    clearCoverUrlCache();
  });

  it('cancels a queued job before it starts', async () => {
    const slow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 50);
        })
    );

    // Saturate the concurrency pool with long jobs.
    const blockers = Array.from({ length: 6 }, () =>
      scheduleCoverFetch(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      })
    );

    const cancelQueued = scheduleCoverFetch(async () => {
      slow();
    });
    cancelQueued();

    await new Promise((resolve) => window.setTimeout(resolve, 120));
    blockers.forEach((cancel) => cancel());

    expect(slow).not.toHaveBeenCalled();
  });

  it('aborts an in-flight fetch via signal', async () => {
    let sawAbort = false;

    const cancel = scheduleCoverFetch(async (signal) => {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 200);
        signal.addEventListener('abort', () => {
          sawAbort = true;
          window.clearTimeout(timer);
          resolve();
        });
      });
    });

    await new Promise((resolve) => window.setTimeout(resolve, 10));
    cancel();
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(sawAbort).toBe(true);
  });

  it('swallows fetch errors and continues processing subsequent queued jobs', async () => {
    const nextJob = vi.fn(async () => {});

    scheduleCoverFetch(async () => {
      throw new Error('network failed');
    });
    scheduleCoverFetch(nextJob);

    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(nextJob).toHaveBeenCalledTimes(1);
  });

  it('tracks cache size after clear', () => {
    expect(getCoverCacheSizeForTests()).toBe(0);
    clearCoverUrlCache();
    expect(getCoverCacheSizeForTests()).toBe(0);
  });
});

describe('useCoverUrl hook', () => {
  let blobCounter = 0;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    blobCounter = 0;
    createObjectURLSpy = vi.fn(() => `blob:cover-${++blobCounter}`);
    revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });
    installIntersectionObserverMock();
  });

  afterEach(() => {
    clearCoverUrlCache();
    vi.unstubAllGlobals();
  });

  it('does not observe or fetch when ref is not attached', () => {
    const { result } = renderHook(() => useCoverUrl('book-unattached'));
    expect(result.current.coverUrl).toBeNull();
    expect(observers).toHaveLength(0);
    expect(api.fetchCover).not.toHaveBeenCalled();
  });

  it('lazy-loads thumb and full covers when intersecting and serves cache hits immediately', async () => {
    vi.mocked(api.fetchCover)
      .mockResolvedValueOnce(new Blob(['thumb-img']))
      .mockResolvedValueOnce(new Blob(['full-img']));

    const { unmount } = render(
      React.createElement(CoverProbe, { bookId: 'book-1', coverVersion: 'v1', size: 'thumb' }),
    );

    expect(screen.getByTestId('cover-probe')).toHaveTextContent('empty');
    expect(observers).toHaveLength(1);
    expect(observers[0].options?.rootMargin).toBe('240px 0px');
    expect(api.fetchCover).not.toHaveBeenCalled();

    await act(async () => {
      observers[0].trigger(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.fetchCover).toHaveBeenCalledWith('book-1', 'thumb', expect.any(AbortSignal));
    expect(screen.getByTestId('cover-probe')).toHaveTextContent('blob:cover-1');
    expect(getCoverCacheSizeForTests()).toBe(1);
    unmount();

    // Remounting with the same key hits cache without observing or fetching
    const prevObserverCount = observers.length;
    const remount = render(
      React.createElement(CoverProbe, { bookId: 'book-1', coverVersion: 'v1', size: 'thumb' }),
    );
    expect(screen.getByTestId('cover-probe')).toHaveTextContent('blob:cover-1');
    expect(observers).toHaveLength(prevObserverCount);
    expect(api.fetchCover).toHaveBeenCalledTimes(1);
    remount.unmount();

    // Full-size request for the same book replaces old cached entry for that bookId and revokes it
    render(React.createElement(CoverProbe, { bookId: 'book-1', coverVersion: 'v1' }));
    await act(async () => {
      observers[observers.length - 1].trigger(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.fetchCover).toHaveBeenLastCalledWith('book-1', undefined, expect.any(AbortSignal));
    expect(screen.getByTestId('cover-probe')).toHaveTextContent('blob:cover-2');
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:cover-1');
    expect(getCoverCacheSizeForTests()).toBe(1);
  });

  it('deduplicates inflight fetches when intersecting multiple times', async () => {
    let resolveFetch!: (blob: Blob | null) => void;
    vi.mocked(api.fetchCover).mockImplementation(
      () => new Promise<Blob | null>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(React.createElement(CoverProbe, { bookId: 'book-dedup', size: 'thumb' }));

    act(() => {
      observers[0].trigger(true);
      observers[0].trigger(true);
    });

    expect(api.fetchCover).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(new Blob(['img']));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('cover-probe')).toHaveTextContent('blob:cover-1');
  });

  it('aborts fetch when leaving viewport early and retries on re-entry', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFirst!: (blob: Blob | null) => void;

    vi.mocked(api.fetchCover)
      .mockImplementationOnce((_id, _size, signal) => {
        capturedSignal = signal;
        return new Promise<Blob | null>((resolve) => {
          resolveFirst = resolve;
        });
      })
      .mockResolvedValueOnce(new Blob(['retry-img']));

    render(React.createElement(CoverProbe, { bookId: 'book-leave' }));

    act(() => {
      observers[0].trigger(true);
    });
    expect(api.fetchCover).toHaveBeenCalledTimes(1);

    // Leave viewport before first fetch resolves -> aborts
    act(() => {
      observers[0].trigger(false);
    });
    expect(capturedSignal?.aborted).toBe(true);

    // Resolving the aborted fetch should not set coverUrl
    await act(async () => {
      resolveFirst(new Blob(['stale-img']));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('cover-probe')).toHaveTextContent('empty');

    // Re-entering viewport triggers a fresh fetch
    await act(async () => {
      observers[0].trigger(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.fetchCover).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('cover-probe')).toHaveTextContent('blob:cover-1');
  });

  it('handles missing cover (null) and fetch rejection gracefully, allowing retry', async () => {
    vi.mocked(api.fetchCover)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('temporary error'))
      .mockResolvedValueOnce(new Blob(['ok']));

    render(React.createElement(CoverProbe, { bookId: 'book-retry' }));

    await act(async () => {
      observers[0].trigger(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('cover-probe')).toHaveTextContent('empty');
    expect(getCoverCacheSizeForTests()).toBe(0);

    await act(async () => {
      observers[0].trigger(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('cover-probe')).toHaveTextContent('empty');

    await act(async () => {
      observers[0].trigger(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('cover-probe')).toHaveTextContent('blob:cover-1');
  });

  it('disconnects observer and aborts in-flight fetch on unmount without leaking state', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch!: (blob: Blob | null) => void;

    vi.mocked(api.fetchCover).mockImplementation((_id, _size, signal) => {
      capturedSignal = signal;
      return new Promise<Blob | null>((resolve) => {
        resolveFetch = resolve;
      });
    });

    const { unmount } = render(React.createElement(CoverProbe, { bookId: 'book-unmount' }));

    act(() => {
      observers[0].trigger(true);
    });

    unmount();
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      resolveFetch(new Blob(['late-img']));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(getCoverCacheSizeForTests()).toBe(0);
  });

  it('evicts oldest covers beyond LRU cap and revokes all URLs on clearCoverUrlCache', async () => {
    vi.mocked(api.fetchCover).mockImplementation(async () => new Blob(['img']));

    // Cache 201 distinct books to exercise the MAX_CACHED_COVERS = 200 LRU eviction branch
    for (let i = 0; i < 201; i += 1) {
      const { unmount } = render(
        React.createElement(CoverProbe, { bookId: `lru-book-${i}`, size: 'thumb' }),
      );
      await act(async () => {
        observers[observers.length - 1].trigger(true);
        await Promise.resolve();
        await Promise.resolve();
      });
      unmount();
    }

    expect(getCoverCacheSizeForTests()).toBe(200);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:cover-1');

    clearCoverUrlCache();
    expect(getCoverCacheSizeForTests()).toBe(0);
    expect(revokeObjectURLSpy.mock.calls.length).toBe(201);
  });
});
