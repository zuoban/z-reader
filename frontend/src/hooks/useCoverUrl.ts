'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

// Global cover fetch queue with concurrency limit to avoid flooding
// the browser with parallel HTTP requests (browser limit ~6 per domain).
const MAX_CONCURRENT = 6;
const MAX_CACHED_COVERS = 200;
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

// Cache blob URLs with an LRU cap. Blob URLs retain their underlying binary
// data until explicitly revoked, so an unbounded cache leaks memory on large
// libraries.
const coverUrlCache = new Map<string, string>();

function getCachedCoverUrl(cacheKey: string): string | undefined {
  const url = coverUrlCache.get(cacheKey);
  if (!url) return undefined;
  coverUrlCache.delete(cacheKey);
  coverUrlCache.set(cacheKey, url);
  return url;
}

function setCachedCoverUrl(bookId: string, cacheKey: string, url: string) {
  const bookKeyPrefix = `${bookId}:`;
  for (const [key, cachedUrl] of coverUrlCache) {
    if (key !== cacheKey && key.startsWith(bookKeyPrefix)) {
      coverUrlCache.delete(key);
      URL.revokeObjectURL(cachedUrl);
    }
  }

  const existing = coverUrlCache.get(cacheKey);
  if (existing && existing !== url) URL.revokeObjectURL(existing);
  coverUrlCache.delete(cacheKey);
  coverUrlCache.set(cacheKey, url);

  while (coverUrlCache.size > MAX_CACHED_COVERS) {
    const oldest = coverUrlCache.entries().next().value as [string, string] | undefined;
    if (!oldest) break;
    coverUrlCache.delete(oldest[0]);
    URL.revokeObjectURL(oldest[1]);
  }
}

export function clearCoverUrlCache() {
  for (const url of coverUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  coverUrlCache.clear();
}

/**
 * Lazy-loads a book cover URL using IntersectionObserver.
 * Only fetches when the element enters the viewport, and respects
 * a global concurrency limit.
 */
export function useCoverUrl(bookId: string, coverVersion?: string, size?: 'thumb'): {
  coverUrl: string | null;
  ref: React.RefObject<HTMLDivElement | null>;
} {
  const cacheKey = `${bookId}:${size ?? 'full'}:${coverVersion ?? ''}`;
  const [fetchedCover, setFetchedCover] = useState<{ cacheKey: string; url: string } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const fetchedBookIds = useRef(new Set<string>());
  const coverUrl = getCachedCoverUrl(cacheKey) ??
    (fetchedCover?.cacheKey === cacheKey ? fetchedCover.url : null);

  useEffect(() => {
    // The cache is read during rendering so a cached cover does not require a
    // synchronous state update in this effect.
    if (getCachedCoverUrl(cacheKey)) {
      return;
    }

    const element = ref.current;
    if (!element) return;

    let disposed = false;
    let cancelFetch: (() => void) | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || fetchedBookIds.current.has(cacheKey)) return;
        fetchedBookIds.current.add(cacheKey);
        observer.disconnect();

        cancelFetch = scheduleCoverFetch(async () => {
          const blob = await api.fetchCover(bookId, size);
          if (!blob) return;

          const url = URL.createObjectURL(blob);
          if (disposed) {
            URL.revokeObjectURL(url);
            return;
          }
          setCachedCoverUrl(bookId, cacheKey, url);
          setFetchedCover({ cacheKey, url });
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
  }, [bookId, cacheKey, size]);

  return { coverUrl, ref };
}
