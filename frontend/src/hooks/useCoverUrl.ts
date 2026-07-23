'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

// Global cover fetch queue with concurrency limit to avoid flooding
// the browser with parallel HTTP requests (browser limit ~6 per domain).
const MAX_CONCURRENT = 6;
const MAX_CACHED_COVERS = 200;
/** Start loading slightly before cards enter the viewport. */
const COVER_ROOT_MARGIN = '240px 0px';

type CoverJob = {
  run: () => void;
  cancelled: boolean;
};

const pendingQueue: CoverJob[] = [];
let activeCount = 0;

/**
 * Schedule a cover download. Returns a cancel function that aborts both the
 * queue slot (if still waiting) and any in-flight work.
 */
export function scheduleCoverFetch(
  fetchFn: (signal: AbortSignal) => Promise<void>
): () => void {
  const controller = new AbortController();
  const job: CoverJob = {
    cancelled: false,
    run: () => {
      if (job.cancelled) return;
      activeCount += 1;
      void (async () => {
        try {
          await fetchFn(controller.signal);
        } catch {
          // ignore fetch/abort errors
        } finally {
          activeCount -= 1;
          processQueue();
        }
      })();
    },
  };

  pendingQueue.push(job);
  processQueue();

  return () => {
    job.cancelled = true;
    controller.abort();
    const index = pendingQueue.indexOf(job);
    if (index >= 0) pendingQueue.splice(index, 1);
  };
}

function processQueue() {
  while (activeCount < MAX_CONCURRENT && pendingQueue.length > 0) {
    const next = pendingQueue.shift();
    if (!next || next.cancelled) continue;
    next.run();
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

export function getCoverCacheSizeForTests() {
  return coverUrlCache.size;
}

/**
 * Lazy-loads a book cover URL using IntersectionObserver.
 * Only fetches when the element is near the viewport, cancels when it leaves
 * before completion, and respects a global concurrency limit.
 */
export function useCoverUrl(
  bookId: string,
  coverVersion?: string,
  size?: 'thumb'
): {
  coverUrl: string | null;
  ref: React.RefObject<HTMLDivElement | null>;
} {
  const cacheKey = `${bookId}:${size ?? 'full'}:${coverVersion ?? ''}`;
  const [fetchedCover, setFetchedCover] = useState<{
    cacheKey: string;
    url: string;
  } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);
  const coverUrl =
    getCachedCoverUrl(cacheKey) ??
    (fetchedCover?.cacheKey === cacheKey ? fetchedCover.url : null);

  useEffect(() => {
    if (getCachedCoverUrl(cacheKey)) {
      return;
    }

    const element = ref.current;
    if (!element) return;

    let disposed = false;
    let cancelFetch: (() => void) | undefined;

    const stopFetch = () => {
      cancelFetch?.();
      cancelFetch = undefined;
      if (inFlightKeyRef.current === cacheKey) {
        inFlightKeyRef.current = null;
      }
    };

    const startFetch = () => {
      if (disposed || inFlightKeyRef.current === cacheKey) return;
      if (getCachedCoverUrl(cacheKey)) return;

      inFlightKeyRef.current = cacheKey;
      cancelFetch = scheduleCoverFetch(async (signal) => {
        try {
          const blob = await api.fetchCover(bookId, size, signal);
          if (!blob || disposed || signal.aborted) return;

          const url = URL.createObjectURL(blob);
          if (disposed || signal.aborted) {
            URL.revokeObjectURL(url);
            return;
          }
          setCachedCoverUrl(bookId, cacheKey, url);
          setFetchedCover({ cacheKey, url });
        } finally {
          if (inFlightKeyRef.current === cacheKey) {
            inFlightKeyRef.current = null;
          }
        }
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startFetch();
          return;
        }
        // Left the prefetch band before the cover was cached — free the slot.
        if (!getCachedCoverUrl(cacheKey)) {
          stopFetch();
        }
      },
      { root: null, rootMargin: COVER_ROOT_MARGIN, threshold: 0 }
    );

    observer.observe(element);

    return () => {
      disposed = true;
      observer.disconnect();
      stopFetch();
    };
  }, [bookId, cacheKey, size]);

  return { coverUrl, ref };
}
