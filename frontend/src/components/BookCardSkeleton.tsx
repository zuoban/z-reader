'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function BookCardSkeleton() {
  return (
    <div className="flex w-full items-stretch">
      <div
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-2xl border border-border/45 bg-card p-0 shadow-[0_14px_38px_-34px_var(--paper-shadow)]',
          'dark:border-white/8 dark:bg-[linear-gradient(180deg,#1a1f27_0%,#151920_100%)] dark:shadow-[0_20px_56px_-46px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,244,220,0.045)]'
        )}
      >
        {/* Cover Skeleton with aspect-[3/4] */}
        <div className="relative aspect-[3/4] overflow-hidden bg-secondary/50 dark:bg-[#11151b] flex items-center justify-center">
          {/* Shimmer gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-muted/20 to-muted/10 animate-pulse" />
          
          {/* Category/Format Label badge skeleton on top-left */}
          <div className="absolute left-2.5 top-2.5">
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>

          {/* Book icon/design skeleton in the middle of cover */}
          <div className="relative flex flex-col items-center justify-center gap-3.5 px-6 text-center">
            {/* Soft book cover design skeleton */}
            <Skeleton className="h-12 w-9 rounded-sm opacity-50" />
            <div className="space-y-1.5 flex flex-col items-center">
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton className="h-2 w-10 rounded-full" />
            </div>
          </div>
        </div>

        {/* Info Skeleton */}
        <div className="flex flex-1 flex-col p-3 sm:p-3.5">
          {/* Title & Author Skeleton */}
          <div className="mb-2.5 sm:mb-3 flex-1 space-y-2">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-[85%] rounded-md" />
              <Skeleton className="h-4 w-[55%] rounded-md" />
            </div>
            <Skeleton className="h-3.5 w-[40%] rounded-md" />
          </div>

          {/* Progress & Actions Skeleton */}
          <div className="mt-auto space-y-3 sm:space-y-3.5">
            {/* Progress Bar */}
            <div className="space-y-1.5 sm:space-y-2">
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-secondary/60 dark:bg-white/10">
                <Skeleton className="h-full w-[35%] rounded-full bg-muted/40" />
              </div>
              <Skeleton className="h-3 w-[50%] rounded-md" />
            </div>

            {/* Read button & dropdown menu skeleton */}
            <div className="flex items-center gap-1.5">
              {/* Primary button skeleton */}
              <div className="h-11 flex-1 rounded-xl bg-muted/30 animate-pulse sm:h-9 sm:rounded-lg flex items-center justify-center">
                <Skeleton className="h-4 w-12 rounded-md" />
              </div>
              {/* Dropdown button skeleton */}
              <div className="h-11 w-11 shrink-0 rounded-xl bg-muted/30 animate-pulse sm:h-9 sm:w-9 sm:rounded-lg" />
            </div>
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
