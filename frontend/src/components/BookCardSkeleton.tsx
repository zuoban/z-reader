'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function BookCardSkeleton() {
  return (
    <div className="flex w-full items-stretch">
      <div className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-border/45 bg-card shadow-[0_14px_38px_-34px_var(--paper-shadow)] dark:border-white/8 dark:bg-[linear-gradient(180deg,#1a1f27_0%,#151920_100%)] dark:shadow-[0_20px_56px_-46px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,244,220,0.045)]">
        {/* Cover area */}
        <div className="relative aspect-[3/4] overflow-hidden bg-secondary/50 dark:bg-[#11151b]">
          {/* Shimmer overlay */}
          <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-muted/20 to-muted/10" />
          {/* Category badge */}
          <div className="absolute left-2.5 top-2.5">
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>

        {/* Info area */}
        <div className="flex flex-1 flex-col p-3 sm:p-3.5">
          {/* Title */}
          <div className="mb-2.5 sm:mb-3 flex-1">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-[85%] rounded-md" />
              <Skeleton className="h-4 w-[55%] rounded-md" />
            </div>
          </div>

          {/* Progress bar */}
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
    <div className="relative z-0 grid grid-cols-2 gap-3 py-2 sm:grid-cols-[repeat(auto-fit,minmax(11rem,12.5rem))] sm:justify-start sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(12rem,13rem))]">
      {Array.from({ length: count }).map((_, index) => (
        <BookCardSkeleton key={index} />
      ))}
    </div>
  );
}
