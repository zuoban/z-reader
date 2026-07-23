'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  estimateShelfRowHeight,
  getShelfColumnCount,
  getShelfGapPx,
  getShelfRowCount,
} from '@/lib/shelf-grid';
import { cn } from '@/lib/utils';

export interface VirtualBookGridProps<T> {
  items: T[];
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * When this value changes (filter / sort / search), scroll to the list top
   * and allow another infinite-load cycle.
   */
  resetKey?: string | number;
  /** Fired near the end for infinite load. Caller should no-op if busy. */
  onEndReached?: () => void;
  /** Guard so the grid does not spam load-more while a page is in flight. */
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  /** How many rows before the last to start loading. */
  endReachedOffsetRows?: number;
  className?: string;
  listClassName?: string;
  overscan?: number;
}

export function VirtualBookGrid<T>({
  items,
  getItemKey,
  renderItem,
  resetKey,
  onEndReached,
  canLoadMore = true,
  isLoadingMore = false,
  endReachedOffsetRows = 3,
  className,
  listClassName,
  overscan = 5,
}: VirtualBookGridProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Start at 0 so SSR and hydration match; layout effect fills real width.
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Stable refs for observer callbacks (avoid re-subscribe thrash).
  const onEndReachedRef = useRef(onEndReached);
  const canLoadMoreRef = useRef(canLoadMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const loadLockRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const measureRafRef = useRef(0);

  useEffect(() => {
    onEndReachedRef.current = onEndReached;
    canLoadMoreRef.current = canLoadMore;
    isLoadingMoreRef.current = isLoadingMore;
  });

  // Clear in-flight lock when parent finishes loading.
  useEffect(() => {
    if (!isLoadingMore) {
      loadLockRef.current = false;
    }
  }, [isLoadingMore]);

  const columnCount = useMemo(() => getShelfColumnCount(width || 360), [width]);
  const gap = useMemo(() => getShelfGapPx(width || 360), [width]);
  const rowCount = useMemo(
    () => getShelfRowCount(items.length, columnCount),
    [items.length, columnCount]
  );
  const estimatedRowHeight = useMemo(
    () => estimateShelfRowHeight(width || 360, columnCount),
    [width, columnCount]
  );

  const applyChromeMeasure = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    const nextWidth = node.clientWidth;
    const nextMargin = node.getBoundingClientRect().top + window.scrollY;
    setWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    setScrollMargin((prev) => (Math.abs(prev - nextMargin) < 0.5 ? prev : nextMargin));
  }, []);

  // Coalesce ResizeObserver / layout thrash into one paint frame.
  const measureChrome = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (measureRafRef.current) return;
    measureRafRef.current = window.requestAnimationFrame(() => {
      measureRafRef.current = 0;
      applyChromeMeasure();
    });
  }, [applyChromeMeasure]);

  useLayoutEffect(() => {
    // First paint / item count change: measure immediately for correct scrollMargin.
    applyChromeMeasure();
  }, [applyChromeMeasure, items.length, resetKey]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;

    const ro = new ResizeObserver(() => {
      measureChrome();
    });
    ro.observe(node);
    window.addEventListener('resize', measureChrome, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureChrome);
      if (measureRafRef.current) {
        window.cancelAnimationFrame(measureRafRef.current);
        measureRafRef.current = 0;
      }
    };
  }, [measureChrome]);

  const estimateSize = useCallback(() => estimatedRowHeight, [estimatedRowHeight]);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize,
    overscan,
    scrollMargin,
    getItemKey: (rowIndex) => `${columnCount}:${gap}:${rowIndex}`,
  });

  // Remeasure cached sizes when layout breakpoints change.
  useEffect(() => {
    virtualizer.measure();
    // virtualizer identity is stable enough; key off layout inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure only on layout change
  }, [columnCount, gap, estimatedRowHeight]);

  // Filter / sort / search: jump back so users see the new list from the top.
  useLayoutEffect(() => {
    if (resetKey === undefined) return;
    loadLockRef.current = false;
    lastLoadAtRef.current = 0;
    if (rowCount > 0) {
      // Aligns window scroll with first row (accounts for scrollMargin).
      virtualizer.scrollToIndex(0, { align: 'start', behavior: 'auto' });
      return;
    }
    const node = listRef.current;
    if (!node) return;
    const target = node.getBoundingClientRect().top + window.scrollY - 12;
    if (window.scrollY > target + 40) {
      window.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on resetKey
  }, [resetKey]);

  const requestLoadMore = useCallback(() => {
    if (!onEndReachedRef.current) return;
    if (!canLoadMoreRef.current || isLoadingMoreRef.current) return;
    if (loadLockRef.current) return;

    const now = Date.now();
    // Throttle bursts while scroll inertia fires many intersections.
    if (now - lastLoadAtRef.current < 400) return;

    loadLockRef.current = true;
    lastLoadAtRef.current = now;
    onEndReachedRef.current();
  }, []);

  /** True when the end probe is still within the prefetch window. */
  const isSentinelNearViewport = useCallback(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return false;
    const prefetchPx = Math.round(estimatedRowHeight * endReachedOffsetRows);
    const rect = sentinel.getBoundingClientRect();
    return rect.top <= window.innerHeight + prefetchPx;
  }, [endReachedOffsetRows, estimatedRowHeight]);

  // Sentinel at the bottom of the virtual list — more reliable than row-index checks.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !onEndReached) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          requestLoadMore();
        }
      },
      {
        root: null,
        // Start loading a couple of viewports early.
        rootMargin: `0px 0px ${Math.round(estimatedRowHeight * endReachedOffsetRows)}px 0px`,
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [endReachedOffsetRows, estimatedRowHeight, onEndReached, requestLoadMore, rowCount]);

  // Short first pages / fast networks: if the sentinel is still on-screen after a
  // page arrives, keep loading until the viewport is filled or pages run out.
  useEffect(() => {
    if (!onEndReached) return;
    if (!canLoadMore || isLoadingMore) return;
    if (rowCount === 0) return;
    if (!isSentinelNearViewport()) return;
    requestLoadMore();
  }, [
    canLoadMore,
    isLoadingMore,
    isSentinelNearViewport,
    items.length,
    onEndReached,
    requestLoadMore,
    rowCount,
  ]);

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div ref={listRef} className={cn('relative w-full', className)}>
      <div
        className={cn('relative w-full', listClassName)}
        style={{
          height: Math.max(virtualizer.getTotalSize(), 0),
          // Hint the browser about the reserved list box for fewer layout thrash frames.
          contain: 'layout style',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columnCount;
          const rowItems = items.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full will-change-transform"
              style={{
                transform: `translate3d(0, ${virtualRow.start - scrollMargin}px, 0)`,
              }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  gap: `${gap}px`,
                  paddingBottom: `${gap}px`,
                }}
              >
                {rowItems.map((item, colIndex) => {
                  const index = startIndex + colIndex;
                  return (
                    <div key={getItemKey(item, index)} className="min-w-0">
                      {renderItem(item, index)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load-more probe sits after the virtual space so it tracks true list end. */}
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="pointer-events-none h-px w-full"
      />
    </div>
  );
}
