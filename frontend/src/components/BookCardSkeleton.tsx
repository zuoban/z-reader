'use client';

import type { CSSProperties } from 'react';
import { Skeleton } from '@mantine/core';
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
      <div className="shelf-book-cover skeleton-shimmer" />
      <div className="shelf-book-details">
        <div className="space-y-1.5">
          <Skeleton height={16} width="80%" radius="xs" aria-hidden="true" />
          <Skeleton height={12} width="50%" radius="xs" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <div className="flex h-4 items-center justify-between gap-2">
            <Skeleton height={12} width={40} radius="xs" aria-hidden="true" />
            <Skeleton height={12} width={32} radius="xs" aria-hidden="true" />
          </div>
          <Skeleton height={4} width="100%" radius="xl" aria-hidden="true" />
        </div>
      </div>
      <div className="shelf-book-actions">
        <Skeleton height={14} width={64} radius="xs" aria-hidden="true" />
        <Skeleton height={14} width={14} radius="xs" aria-hidden="true" />
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
