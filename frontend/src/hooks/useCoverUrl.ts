'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { getAccessGeneration } from '@/lib/library-access';

// Global cover fetch queue with concurrency limit to avoid flooding
// the browser with parallel HTTP requests (browser limit ~6 per domain).
const MAX_CONCURRENT = 6;
const MAX_CACHED_COVERS = 200;
const MAX_CACHED_MISSING_COVERS = 500;
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
const missingCoverCache = new Set<string>();
const activeCoverConsumers = new Map<string, number>();
const coverCacheListeners = new Set<() => void>();

function subscribeCoverCache(listener: () => void): () => void {
  coverCacheListeners.add(listener);
  return () => {
    coverCacheListeners.delete(listener);
  };
}

function notifyCoverCacheListeners() {
  for (const listener of coverCacheListeners) {
    listener();
  }
}

function getServerCoverUrlSnapshot(): string | null {
  return null;
}

type ObserverCallback = (isIntersecting: boolean) => void;
let sharedObserver: IntersectionObserver | null = null;
const observedElements = new Map<Element, ObserverCallback>();

function observeCoverElement(element: Element, callback: ObserverCallback): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    return () => {};
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          observedElements.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { root: null, rootMargin: COVER_ROOT_MARGIN, threshold: 0 }
    );
  }
  observedElements.set(element, callback);
  sharedObserver.observe(element);

  return () => {
    observedElements.delete(element);
    sharedObserver?.unobserve(element);
    if (observedElements.size === 0 && sharedObserver) {
      sharedObserver.disconnect();
      sharedObserver = null;
    }
  };
}

function isMissingCoverCached(cacheKey: string): boolean {
  if (!missingCoverCache.has(cacheKey)) return false;
  missingCoverCache.delete(cacheKey);
  missingCoverCache.add(cacheKey);
  return true;
}

function markMissingCoverCached(cacheKey: string) {
  missingCoverCache.delete(cacheKey);
  missingCoverCache.add(cacheKey);
  while (missingCoverCache.size > MAX_CACHED_MISSING_COVERS) {
    const oldest = missingCoverCache.values().next().value as string | undefined;
    if (!oldest) break;
    missingCoverCache.delete(oldest);
  }
}

function touchCachedCoverUrl(cacheKey: string): string | undefined {
  const url = coverUrlCache.get(cacheKey);
  if (!url) return undefined;
  coverUrlCache.delete(cacheKey);
  coverUrlCache.set(cacheKey, url);
  return url;
}

function setCachedCoverUrl(bookKeyPrefix: string, cacheKey: string, url: string) {
  for (const key of missingCoverCache) {
    if (key.startsWith(bookKeyPrefix)) {
      missingCoverCache.delete(key);
    }
  }
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
    let evictKey: string | undefined;
    for (const key of coverUrlCache.keys()) {
      if (!activeCoverConsumers.get(key)) {
        evictKey = key;
        break;
      }
    }
    if (!evictKey) {
      evictKey = coverUrlCache.keys().next().value as string | undefined;
    }
    if (!evictKey) break;
    const evictedUrl = coverUrlCache.get(evictKey);
    coverUrlCache.delete(evictKey);
    if (evictedUrl) URL.revokeObjectURL(evictedUrl);
  }

  notifyCoverCacheListeners();
}

export function clearCoverUrlCache() {
  for (const url of coverUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  coverUrlCache.clear();
  missingCoverCache.clear();
  notifyCoverCacheListeners();
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
  size?: 'thumb',
  enabled = true
): {
  coverUrl: string | null;
  ref: React.RefObject<HTMLDivElement | null>;
} {
  const [generation] = useState(getAccessGeneration);
  const bookKeyPrefix = `${generation ?? ''}:${bookId}:${size ?? 'full'}:`;
  const cacheKey = `${bookKeyPrefix}${coverVersion ?? ''}`;
  const ref = useRef<HTMLDivElement | null>(null);
  const cachedCoverUrl = useSyncExternalStore(
    subscribeCoverCache,
    () => coverUrlCache.get(cacheKey) ?? null,
    getServerCoverUrlSnapshot
  );
  const coverUrl = enabled && generation === getAccessGeneration() ? cachedCoverUrl : null;

  useEffect(() => {
    if (!enabled) return;
    activeCoverConsumers.set(cacheKey, (activeCoverConsumers.get(cacheKey) ?? 0) + 1);
    return () => {
      const nextCount = (activeCoverConsumers.get(cacheKey) ?? 1) - 1;
      if (nextCount <= 0) {
        activeCoverConsumers.delete(cacheKey);
      } else {
        activeCoverConsumers.set(cacheKey, nextCount);
      }
    };
  }, [cacheKey, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (cachedCoverUrl) {
      touchCachedCoverUrl(cacheKey);
      return;
    }
    if (isMissingCoverCached(cacheKey)) {
      return;
    }

    const element = ref.current;
    if (!element) return;

    let disposed = false;
    type CoverRequest = { cancel?: () => void };
    let pendingRequest: CoverRequest | undefined;

    const stopFetch = () => {
      const request = pendingRequest;
      pendingRequest = undefined;
      request?.cancel?.();
    };

    const startFetch = () => {
      if (disposed || generation !== getAccessGeneration() || pendingRequest) return;
      if (coverUrlCache.has(cacheKey) || isMissingCoverCached(cacheKey)) return;

      const request: CoverRequest = {};
      pendingRequest = request;
      request.cancel = scheduleCoverFetch(async (signal) => {
        try {
          const blob = await api.fetchCover(bookId, size, signal);
          if (disposed || signal.aborted || generation !== getAccessGeneration()) return;
          if (!blob) {
            markMissingCoverCached(cacheKey);
            return;
          }
          if (coverUrlCache.has(cacheKey)) {
            touchCachedCoverUrl(cacheKey);
            return;
          }

          const url = URL.createObjectURL(blob);
          setCachedCoverUrl(bookKeyPrefix, cacheKey, url);
        } finally {
          if (pendingRequest === request) {
            pendingRequest = undefined;
          }
        }
      });
    };

    const unobserve = observeCoverElement(element, (isIntersecting) => {
      if (isIntersecting) {
        startFetch();
        return;
      }
      // Left the prefetch band before the cover was cached — free the slot.
      if (!coverUrlCache.has(cacheKey) && !isMissingCoverCached(cacheKey)) {
        stopFetch();
      }
    });

    return () => {
      disposed = true;
      unobserve();
      stopFetch();
    };
  }, [bookId, bookKeyPrefix, cachedCoverUrl, cacheKey, enabled, generation, size]);

  return { coverUrl, ref };
}
