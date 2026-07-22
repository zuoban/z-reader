'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

// Global cover fetch queue with concurrency limit to avoid flooding
// the browser with parallel HTTP requests (browser limit ~6 per domain).
const MAX_CONCURRENT = 6;
const pendingQueue: Array<() => void> = [];
let activeCount = 0;

function scheduleCoverFetch(fetchFn: () => void): () => void {
  let cancelled = false;

  const run = async () => {
    if (cancelled) return;
    activeCount++;
    try {
      await fetchFn();
    } catch {
      // ignore fetch errors
    } finally {
      activeCount--;
      processQueue();
    }
  };

  pendingQueue.push(() => {
    if (!cancelled) run();
  });
  processQueue();

  return () => {
    cancelled = true;
  };
}

function processQueue() {
  while (activeCount < MAX_CONCURRENT && pendingQueue.length > 0) {
    const next = pendingQueue.shift();
    next?.();
  }
}

// Cache blob URLs by book ID to avoid re-fetching
const coverUrlCache = new Map<string, string>();

/**
 * Lazy-loads a book cover URL using IntersectionObserver.
 * Only fetches when the element enters the viewport, and respects
 * a global concurrency limit.
 */
export function useCoverUrl(bookId: string): {
  coverUrl: string | null;
  ref: React.RefObject<HTMLDivElement | null>;
} {
  const [fetchedCover, setFetchedCover] = useState<{ bookId: string; url: string } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const fetchedBookIds = useRef(new Set<string>());
  const coverUrl = coverUrlCache.get(bookId) ??
    (fetchedCover?.bookId === bookId ? fetchedCover.url : null);

  useEffect(() => {
    // The cache is read during rendering so a cached cover does not require a
    // synchronous state update in this effect.
    if (coverUrlCache.has(bookId)) {
      return;
    }

    const element = ref.current;
    if (!element) return;

    let disposed = false;
    let cancelFetch: (() => void) | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || fetchedBookIds.current.has(bookId)) return;
        fetchedBookIds.current.add(bookId);
        observer.disconnect();

        cancelFetch = scheduleCoverFetch(async () => {
          const blob = await api.fetchCover(bookId);
          if (!blob) return;

          const url = URL.createObjectURL(blob);
          if (disposed) {
            URL.revokeObjectURL(url);
            return;
          }
          coverUrlCache.set(bookId, url);
          setFetchedCover({ bookId, url });
        });
      },
      { rootMargin: '200px' } // Start loading 200px before entering viewport
    );

    observer.observe(element);

    return () => {
      disposed = true;
      observer.disconnect();
      cancelFetch?.();
    };
  }, [bookId]);

  return { coverUrl, ref };
}
