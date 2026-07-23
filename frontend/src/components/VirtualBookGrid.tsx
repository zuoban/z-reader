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
  getShelfColumnCount,
  getShelfGapPx,
  getShelfRowCount,
  SHELF_CARD_ESTIMATE_HEIGHT_PX,
} from '@/lib/shelf-grid';
import { cn } from '@/lib/utils';

export interface VirtualBookGridProps<T> {
  items: T[];
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Fired when the user scrolls near the end (for infinite load). */
  onEndReached?: () => void;
  endReachedOffsetRows?: number;
  className?: string;
  listClassName?: string;
  overscan?: number;
}

export function VirtualBookGrid<T>({
  items,
  getItemKey,
  renderItem,
  onEndReached,
  endReachedOffsetRows = 2,
  className,
  listClassName,
  overscan = 4,
}: VirtualBookGridProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const endReachedForCountRef = useRef(-1);

  const columnCount = useMemo(() => getShelfColumnCount(width || 360), [width]);
  const gap = useMemo(() => getShelfGapPx(width || 360), [width]);
  const rowCount = useMemo(
    () => getShelfRowCount(items.length, columnCount),
    [items.length, columnCount]
  );

  const measure = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    setWidth(node.clientWidth);
    // Distance from document top — required by useWindowVirtualizer.
    const top = node.getBoundingClientRect().top + window.scrollY;
    setScrollMargin(top);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, items.length]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;

    const ro = new ResizeObserver(() => measure());
    ro.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => SHELF_CARD_ESTIMATE_HEIGHT_PX + gap,
    overscan,
    scrollMargin,
    // Recalculate when column layout changes.
    getItemKey: (rowIndex) => `${columnCount}:${rowIndex}`,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Infinite scroll: when the last visible row approaches the end.
  useEffect(() => {
    if (!onEndReached || rowCount === 0) return;
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;
    if (last.index < rowCount - 1 - endReachedOffsetRows) return;
    // Fire once per items.length growth cycle to avoid spam.
    if (endReachedForCountRef.current === items.length) return;
    endReachedForCountRef.current = items.length;
    onEndReached();
  }, [endReachedOffsetRows, items.length, onEndReached, rowCount, virtualRows]);

  // Reset end-reached guard when list shrinks (filter/search).
  useEffect(() => {
    if (items.length < endReachedForCountRef.current) {
      endReachedForCountRef.current = -1;
    }
  }, [items.length]);

  return (
    <div ref={listRef} className={cn('relative w-full', className)}>
      <div
        className={cn('relative w-full', listClassName)}
        style={{
          height: virtualizer.getTotalSize(),
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
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
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
    </div>
  );
}
