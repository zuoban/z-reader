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
        <div className="space-y-1.5">
          <div className="flex h-4 items-center justify-between gap-2">
            <div className="skeleton-shimmer h-4 w-12 rounded bg-secondary/70" aria-hidden="true" />
            <div className="skeleton-shimmer h-3 w-8 rounded-xs" aria-hidden="true" />
          </div>
          <div className="skeleton-shimmer h-[3px] w-full rounded-full" aria-hidden="true" />
        </div>
      </div>
      <div className="shelf-book-actions">
        <div className="skeleton-shimmer h-3.5 w-16 rounded-xs" aria-hidden="true" />
        <div className="skeleton-shimmer h-3.5 w-3.5 rounded-xs" aria-hidden="true" />
      </div>
    </div>
  );
}

export function BookRowSkeleton() {
  return (
    <div className="shelf-book-row flex min-w-0 items-center gap-3 p-3 sm:gap-4 sm:p-3.5">
      <div
        className="skeleton-shimmer h-[84px] w-[60px] shrink-0 rounded-lg"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="space-y-1.5">
          <div className="skeleton-shimmer h-4 w-2/5 max-w-xs rounded-xs" aria-hidden="true" />
          <div className="skeleton-shimmer h-3 w-24 rounded-xs" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-3">
          <div className="skeleton-shimmer h-4 w-12 rounded bg-secondary/70" aria-hidden="true" />
          <div className="skeleton-shimmer h-3 w-10 rounded-xs" aria-hidden="true" />
        </div>
        <div className="skeleton-shimmer h-[3px] w-full rounded-full sm:max-w-xs" aria-hidden="true" />
      </div>
      <div
        className="skeleton-shimmer hidden h-9 w-24 shrink-0 rounded-full sm:block"
        aria-hidden="true"
      />
    </div>
  );
}

export function BookCardSkeletonGrid({
  count = 6,
  viewMode = 'grid',
}: {
  count?: number;
  viewMode?: 'grid' | 'list';
}) {
  return (
    <div
      className="shelf-skeleton-container"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="正在加载书库"
    >
      <span className="sr-only">正在加载书库…</span>
      {viewMode === 'list' ? (
        <div className="space-y-2.5" data-skeleton-mode="list" aria-hidden="true">
          {Array.from({ length: count }, (_, index) => (
            <BookRowSkeleton key={index} />
          ))}
        </div>
      ) : (
        <div className="shelf-skeleton-grid" style={skeletonGridStyle} aria-hidden="true">
          {Array.from({ length: count }, (_, index) => (
            <BookCardSkeleton key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
