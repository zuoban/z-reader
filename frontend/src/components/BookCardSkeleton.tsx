'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function BookCardSkeleton() {
  return (
    <div className="flex w-full items-stretch">
      <div className="shelf-book-card relative flex w-full flex-col overflow-hidden rounded-xl">
        <div className="skeleton-shimmer relative aspect-[5/6] overflow-hidden bg-[var(--shelf-card-media)]">
          <div className="absolute left-2.5 top-2.5">
            <Skeleton className="h-5 w-12 rounded-md" />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 p-3 pb-2.5 sm:px-3.5">
          <div className="flex-1">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-[85%] rounded-md" />
              <Skeleton className="h-3.5 w-[55%] rounded-md" />
            </div>
          </div>

          <div className="mt-auto space-y-1.5">
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-secondary">
              <Skeleton className="h-full w-[35%] rounded-full bg-muted/60" />
            </div>
            <Skeleton className="h-3 w-[45%] rounded-md" />
          </div>
        </div>
        <div className="flex h-10 items-center justify-between border-t border-border/60 px-3">
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="h-4 w-4 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function BookCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      className="relative z-0 grid grid-cols-2 gap-3 py-2 sm:grid-cols-[repeat(auto-fit,minmax(11rem,12.5rem))] sm:justify-start sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(12rem,13rem))]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="正在加载书库"
    >
      <span className="sr-only">正在加载书库…</span>
      {Array.from({ length: count }).map((_, index) => (
        <BookCardSkeleton key={index} />
      ))}
    </div>
  );
}
