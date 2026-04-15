'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';

interface BookCardSkeletonProps {
  isMobile?: boolean;
}

// 标准书籍封面宽高比（49:60），用于骨架屏预览尺寸计算
const SPELL_BOOK_WIDTH = 150;
const SPELL_BOOK_HEIGHT = Math.round((SPELL_BOOK_WIDTH * 60) / 49);

// 与 BookCard 保持一致的卡片尺寸
const MOBILE_CARD_WIDTH = 172;
const MOBILE_CARD_SCALE = 1;
const MOBILE_COVER_HEIGHT = 200;
const MOBILE_INFO_HEIGHT = 184;

const DESKTOP_CARD_WIDTH = 218;
const DESKTOP_CARD_SCALE = 0.83;
const DESKTOP_COVER_HEIGHT = 228;
const DESKTOP_INFO_HEIGHT = 162;

export function BookCardSkeleton({ isMobile = false }: BookCardSkeletonProps) {
  const cardWidth = isMobile ? MOBILE_CARD_WIDTH : DESKTOP_CARD_WIDTH;
  const cardScale = isMobile ? MOBILE_CARD_SCALE : DESKTOP_CARD_SCALE;
  const cardFrameWidth = Math.round(cardWidth * cardScale);
  const coverHeight = isMobile ? MOBILE_COVER_HEIGHT : DESKTOP_COVER_HEIGHT;
  const infoHeight = isMobile ? MOBILE_INFO_HEIGHT : DESKTOP_INFO_HEIGHT;
  const bookScale = isMobile ? 0.86 : 1;
  const bookPreviewWidth = Math.round(SPELL_BOOK_WIDTH * bookScale);
  const bookPreviewHeight = Math.round(SPELL_BOOK_HEIGHT * bookScale);

  return (
    <div
      className="flex w-full items-center justify-start"
      style={{
        width: isMobile ? '100%' : cardFrameWidth,
      }}
    >
      <div style={{ transform: `scale(${cardScale})`, transformOrigin: 'center' }}>
        <div
          className="relative flex cursor-default flex-col overflow-hidden rounded-[22px] border border-black/8 bg-white dark:bg-neutral-900 dark:border-white/10 shadow-[0_24px_44px_-34px_rgba(15,23,42,0.38),0_10px_24px_-20px_rgba(15,23,42,0.22)] sm:rounded-[20px]"
          style={{
            width: isMobile ? '100%' : cardWidth,
          }}
        >
          {/* Cover skeleton */}
          <div
            className="relative overflow-hidden bg-stone-50 dark:bg-neutral-800"
            style={{ height: coverHeight }}
          >
            {isMobile && (
              <>
                <div className="pointer-events-none absolute inset-x-4 top-0 h-14 rounded-b-[26px] bg-white/35 dark:bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
              </>
            )}
            <div className="relative flex h-full items-center justify-center px-5 py-4 sm:px-6">
              <div
                className="shrink-0"
                style={{ height: bookPreviewHeight, width: bookPreviewWidth }}
              >
                <div className="flex h-full w-full items-center justify-center">
                  <div
                    style={{ transform: `scale(${bookScale})`, transformOrigin: 'center center' }}
                  >
                    <div className="relative aspect-[49/60] h-full w-full overflow-hidden rounded-[4px] bg-gradient-to-br from-stone-200 to-stone-100 dark:from-neutral-700 dark:to-neutral-800 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                      <Skeleton className="absolute inset-0 rounded-[4px]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info skeleton */}
          <div
            className="flex flex-col justify-between border-t border-black/5 dark:border-white/5 bg-gradient-to-b from-white via-white to-stone-50/55 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950/55 px-3.5 py-3.5 sm:px-4 sm:py-3.5"
            style={isMobile ? { minHeight: infoHeight } : { height: infoHeight }}
          >
            <div className="space-y-2.5 sm:space-y-2.5">
              {/* Title skeleton */}
              <div className="flex items-start gap-2">
                <Skeleton className="h-[2.8rem] min-w-0 flex-1 rounded-md sm:h-[2.6rem]" />
                <Skeleton className="h-8 w-8 shrink-0 rounded-xl sm:h-7 sm:w-7 sm:rounded-lg" />
              </div>

              {/* Author skeleton */}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Skeleton className="h-[15px] w-[15px] shrink-0 rounded-full" />
                  <Skeleton className="h-[15px] w-24 rounded-md" />
                </div>
                <div className="flex shrink-0 items-center gap-1 px-1 py-0.5">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-[13px] w-12 rounded-md" />
                </div>
              </div>

              {/* Progress skeleton */}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <Skeleton className="h-[13px] w-[13px] rounded-full" />
                  <Skeleton className="h-[13px] w-9 rounded-md" />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Skeleton className="h-[13px] w-[13px] rounded-full" />
                  <Skeleton className="h-[13px] w-10 rounded-md" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-black/5 pt-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:pt-3">
              <Skeleton className="h-10 w-full rounded-[10px] sm:h-9 sm:w-full sm:rounded-[10px]" />
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
    <div className="relative z-0 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-x-5 sm:gap-y-6 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] lg:gap-x-6 lg:gap-y-7">
      {Array.from({ length: count }).map((_, index) => (
        <BookCardSkeleton key={index} isMobile={isMobile} />
      ))}
    </div>
  );
}
