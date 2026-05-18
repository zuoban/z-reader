'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  MOBILE_CARD_WIDTH,
  MOBILE_COVER_HEIGHT,
  MOBILE_BOOK_SCALE,
  DESKTOP_CARD_WIDTH,
  DESKTOP_COVER_HEIGHT,
  DESKTOP_BOOK_SCALE,
  SPELL_BOOK_WIDTH,
  SPELL_BOOK_HEIGHT,
} from '@/lib/card-constants';

interface BookCardSkeletonProps {
  isMobile?: boolean;
}

export function BookCardSkeleton({ isMobile = false }: BookCardSkeletonProps) {
  const cardWidth = isMobile ? MOBILE_CARD_WIDTH : DESKTOP_CARD_WIDTH;
  const coverHeight = isMobile ? MOBILE_COVER_HEIGHT : DESKTOP_COVER_HEIGHT;
  const bookScale = isMobile ? MOBILE_BOOK_SCALE : DESKTOP_BOOK_SCALE;

  return (
    <div
      className="flex w-full items-center justify-start"
    >
      <div
        className="shelf-book-card relative flex cursor-default flex-col overflow-hidden rounded-2xl border border-border/55 bg-card/70 shadow-[0_12px_32px_-28px_var(--paper-shadow)] ring-1 ring-white/45 dark:ring-white/10"
        style={{ width: isMobile ? '100%' : cardWidth }}
      >
          {/* Cover skeleton */}
          <div
            className="relative overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--muted)_32%,var(--card))_0%,var(--card)_100%)]"
            style={{ height: coverHeight }}
          >
            <div className="relative z-10 flex h-full items-start justify-center px-4 pt-5">
              <div
                className="relative shrink-0"
                style={{
                  height: SPELL_BOOK_HEIGHT,
                  width: SPELL_BOOK_WIDTH,
                  transform: `scale(${bookScale})`,
                  transformOrigin: 'center center'
                }}
              >
                <div className="flex h-full w-full items-center justify-center">
                    <div 
                      className="paper-cover-frame relative overflow-hidden rounded-[4px] border border-border/50 bg-muted/80 shadow-[0_10px_18px_-18px_rgba(64,36,20,0.18)]"
                      style={{ width: SPELL_BOOK_WIDTH, height: SPELL_BOOK_HEIGHT }}
                    >
                      <div className="absolute inset-x-3 top-3 flex items-center justify-between">
                        <Skeleton className="h-4 w-11 rounded-full" />
                        <Skeleton className="h-3 w-4 rounded-sm" />
                      </div>
                      <div className="absolute inset-x-3 top-12 space-y-2">
                        <Skeleton className="h-1 w-10 rounded-full" />
                        <Skeleton className="h-4 w-[78%] rounded-md" />
                        <Skeleton className="h-4 w-[64%] rounded-md" />
                        <Skeleton className="h-4 w-[58%] rounded-md" />
                      </div>
                      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between">
                        <div className="space-y-1">
                          <Skeleton className="h-3 w-12 rounded-sm" />
                          <Skeleton className="h-1 w-10 rounded-full" />
                        </div>
                        <Skeleton className="h-5 w-5 rounded-sm" />
                      </div>
                      <div className="absolute inset-0 rounded-[4px] bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_20%,transparent_84%,rgba(71,46,28,0.07))]" />
                    </div>
                </div>
              </div>
            </div>
            {!isMobile && (
              <div className="absolute inset-x-3 bottom-3 z-20 rounded-full border border-border/55 bg-card/88 px-3 py-2 shadow-[0_10px_26px_-22px_var(--paper-shadow)] backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-1 w-full rounded-full" />
                  <Skeleton className="h-3 w-8 shrink-0 rounded-md" />
                </div>
              </div>
            )}
          </div>

          {/* Info skeleton */}
          <div
            className="flex flex-col bg-card/92 px-3.5 pb-4 pt-3.5 sm:px-4 sm:pb-4 sm:pt-3.5"
          >
            <div className="space-y-2">
              {/* Title skeleton */}
              <div className="relative pr-6 sm:pr-5">
                <Skeleton className="min-h-[42px] min-w-0 rounded-md sm:min-h-[42px]" />
                <Skeleton className="absolute right-[-8px] top-[-7px] h-8 w-8 rounded-full" />
              </div>

              {/* Author skeleton */}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}

export function BookCardSkeletonGrid({ count = 6 }: { count?: number }) {
  const isMobile = useIsMobile();

  return (
    <div className="relative z-0 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(184px,1fr))] sm:gap-x-6 sm:gap-y-10 lg:grid-cols-[repeat(auto-fill,minmax(196px,1fr))] lg:gap-x-8 lg:gap-y-12">
      {Array.from({ length: count }).map((_, index) => (
        <BookCardSkeleton key={index} isMobile={isMobile} />
      ))}
    </div>
  );
}
