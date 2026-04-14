'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface BookCardSkeletonProps {
  isMobile?: boolean;
}

// 标准书籍封面宽高比（49:60），用于骨架屏预览尺寸计算
const SPELL_BOOK_WIDTH = 150;
const SPELL_BOOK_HEIGHT = Math.round((SPELL_BOOK_WIDTH * 60) / 49);

export function BookCardSkeleton({ isMobile = false }: BookCardSkeletonProps) {
  const cardWidth = isMobile ? 160 : 182;
  const cardScale = isMobile ? 1 : 0.83;
  const cardFrameWidth = Math.round(cardWidth * cardScale);
  const coverHeight = isMobile ? 192 : 228;
  const infoHeight = isMobile ? 168 : 162;
  const bookScale = isMobile ? 0.86 : 1;
  const bookPreviewWidth = Math.round(SPELL_BOOK_WIDTH * bookScale);
  const bookPreviewHeight = Math.round(SPELL_BOOK_HEIGHT * bookScale);

  return (
    <div
      className="flex items-center justify-start"
      style={{
        width: cardFrameWidth,
      }}
    >
      <div style={{ transform: `scale(${cardScale})`, transformOrigin: 'center' }}>
        <div
          className="relative flex cursor-default flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white/92 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.3)] sm:rounded-[20px]"
          style={{
            width: cardWidth,
          }}
        >
          {/* Cover skeleton */}
          <div
            className="relative overflow-hidden bg-[radial-gradient(circle_at_top,#faf5eb_0%,#ede4d4_46%,#ddd0bd_100%)]"
            style={{ height: coverHeight }}
          >
            <div className="pointer-events-none absolute inset-0 paper-texture opacity-45" />
            <div className="relative flex h-full items-center justify-center px-5 py-4 sm:px-6">
              <div
                className="shrink-0"
                style={{ height: bookPreviewHeight, width: bookPreviewWidth }}
              >
                <div className="flex h-full w-full items-center justify-center">
                  <div
                    style={{ transform: `scale(${bookScale})`, transformOrigin: 'center center' }}
                  >
                    <div className="relative aspect-[49/60] h-full w-full overflow-hidden rounded-[4px] bg-gradient-to-br from-stone-200 to-stone-100 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                      <Skeleton className="absolute inset-0 rounded-[4px]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info skeleton */}
          <div
            className="flex flex-col justify-between border-t border-black/5 bg-gradient-to-b from-white via-white to-stone-50/70 px-3 py-3 sm:px-4 sm:py-3.5"
            style={{ height: infoHeight }}
          >
            <div className="space-y-2 sm:space-y-2.5">
              {/* Title skeleton */}
              <Skeleton className="h-[2.8rem] w-full rounded-md sm:h-[2.6rem]" />

              {/* Author skeleton */}
              <div className="flex min-w-0 items-center gap-1.5">
                <Skeleton className="h-[15px] w-[15px] shrink-0 rounded-full" />
                <Skeleton className="h-[15px] w-24 rounded-md" />
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-black/5 pt-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:pt-3">
              <div className="min-w-0 flex-1">
                <Skeleton className="mb-1 h-3 w-16 rounded-md" />
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-[15px] w-[15px] shrink-0 rounded-full" />
                  <Skeleton className="h-[15px] w-20 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-11 w-full rounded-full sm:h-8 sm:w-20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BookCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(2,minmax(160px,160px))] justify-between gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(176px,176px))] sm:justify-start sm:gap-x-4 sm:gap-y-5 lg:grid-cols-[repeat(auto-fill,minmax(184px,184px))] lg:gap-x-5 lg:gap-y-6">
      {Array.from({ length: count }).map((_, index) => (
        <BookCardSkeleton key={index} isMobile={false} />
      ))}
    </div>
  );
}
