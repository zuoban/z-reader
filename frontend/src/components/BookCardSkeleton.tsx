'use client';

import type { CSSProperties } from 'react';
import { SHELF_GRID_GAP_PX, SHELF_GRID_MIN_COL_PX } from '@/lib/shelf-grid';

const skeletonGridStyle = {
  '--shelf-grid-mobile-gap': `${SHELF_GRID_GAP_PX.mobile}px`,
  '--shelf-grid-desktop-gap': `${SHELF_GRID_GAP_PX.desktop}px`,
  '--shelf-grid-sm-column': `${SHELF_GRID_MIN_COL_PX.sm}px`,
  '--shelf-grid-lg-column': `${SHELF_GRID_MIN_COL_PX.lg}px`,
} as CSSProperties;

export function BookCardSkeleton() {
  return (
    <div className="shelf-book-card flex min-w-0 flex-col">
      <div className="shelf-book-cover">
        <div className="skeleton-shimmer h-full w-full" aria-hidden="true" />
      </div>
      <div className="shelf-book-details">
        <div className="space-y-1.5">
          <div className="skeleton-shimmer h-4 w-4/5 rounded-xs" aria-hidden="true" />
          <div className="skeleton-shimmer h-3 w-1/2 rounded-xs" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <div className="flex h-4 items-center justify-between gap-2">
            <div className="skeleton-shimmer h-3 w-10 rounded-xs" aria-hidden="true" />
            <div className="skeleton-shimmer h-3 w-8 rounded-xs" aria-hidden="true" />
          </div>
          <div className="skeleton-shimmer h-0.5 w-full rounded-full" aria-hidden="true" />
        </div>
      </div>
      <div className="shelf-book-actions">
        <div className="skeleton-shimmer h-3.5 w-16 rounded-xs" aria-hidden="true" />
        <div className="skeleton-shimmer h-3.5 w-3.5 rounded-xs" aria-hidden="true" />
      </div>
    </div>
  );
}

export function BookCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      className="shelf-skeleton-container"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="正在加载书库"
    >
      <span className="sr-only">正在加载书库…</span>
      <div className="shelf-skeleton-grid" style={skeletonGridStyle} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => <BookCardSkeleton key={index} />)}
      </div>
    </div>
  );
}
