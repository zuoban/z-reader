'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function BookCardSkeleton() {
  return (
    <div className="flex w-full items-stretch">
      <div className="shelf-book-card relative flex w-full flex-col overflow-hidden rounded-2xl">
        <div className="skeleton-shimmer relative aspect-[3/4] overflow-hidden bg-[var(--shelf-card-media)]">
          <div className="absolute inset-0 bg-gradient-to-b from-muted/25 to-muted/10" />
          <div className="absolute left-2.5 top-2.5">
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>

        <div className="flex flex-1 flex-col p-3 sm:p-3.5">
          <div className="mb-2.5 flex-1 sm:mb-3">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-[85%] rounded-md" />
              <Skeleton className="h-4 w-[55%] rounded-md" />
            </div>
          </div>

          <div className="mt-auto space-y-1.5 sm:space-y-2">
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-secondary/60 dark:bg-white/10">
              <Skeleton className="h-full w-[35%] rounded-full bg-muted/40" />
            </div>
            <Skeleton className="h-3 w-[50%] rounded-md" />
          </div>
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
