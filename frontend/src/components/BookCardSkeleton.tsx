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
const MOBILE_COVER_HEIGHT = 210;
const MOBILE_INFO_HEIGHT = 196;

const DESKTOP_CARD_WIDTH = 218;
const DESKTOP_CARD_SCALE = 0.83;
const DESKTOP_COVER_HEIGHT = 242;
const DESKTOP_INFO_HEIGHT = 176;

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
          className="relative flex cursor-default flex-col overflow-hidden rounded-[1.65rem] border border-border/70 bg-card"
          style={{
            width: isMobile ? '100%' : cardWidth,
            boxShadow:
              '0 18px 36px -28px rgba(64,36,20,0.28), 0 10px 22px -20px rgba(64,36,20,0.18), inset 0 1px 0 rgba(255,255,255,0.42)',
          }}
        >
          {/* Cover skeleton */}
          <div
            className="relative overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_62%,white)_38%,color-mix(in_srgb,var(--secondary)_88%,transparent)_100%)]"
            style={{ height: coverHeight }}
          >
            {isMobile && (
              <>
                <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
              </>
            )}
            <div className="relative z-10 flex h-full items-center justify-center p-2 sm:p-3">
              <div
                className="shrink-0"
                style={{ height: bookPreviewHeight, width: bookPreviewWidth }}
              >
                <div className="flex h-full w-full items-center justify-center">
                  <div
                    style={{ transform: `scale(${bookScale})`, transformOrigin: 'center center' }}
                  >
                    <div className="relative aspect-[49/60] h-full w-full overflow-hidden rounded-[4px] bg-muted shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                      <Skeleton className="absolute inset-0 rounded-[4px]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info skeleton */}
          <div
            className="flex flex-col justify-between border-t border-border/65 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,white)_0%,var(--card)_100%)] px-4 py-4 sm:px-[18px] sm:py-4"
            style={isMobile ? { minHeight: infoHeight } : { height: infoHeight }}
          >
            <div className="space-y-3">
              {/* Title skeleton */}
              <div className="relative pr-6 sm:pr-5">
                <Skeleton className="min-h-[3rem] min-w-0 rounded-md sm:min-h-[2.7rem]" />
                <Skeleton className="absolute right-[-6px] top-[-5px] h-8 w-8 rounded-xl sm:right-[-4px] sm:top-[-4px] sm:h-[30px] sm:w-[30px] sm:rounded-xl" />
              </div>

              {/* Author skeleton */}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Skeleton className="h-[15px] w-[15px] shrink-0 rounded-full" />
                  <Skeleton className="h-[15px] w-24 rounded-md" />
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/50 bg-background/55 px-2 py-0.5">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-[13px] w-12 rounded-md" />
                </div>
              </div>

              {/* Progress skeleton */}
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <div className="flex min-w-0 items-center gap-1 rounded-xl bg-muted/28 px-2 py-1">
                  <Skeleton className="h-[13px] w-[13px] rounded-full" />
                  <Skeleton className="h-[13px] w-9 rounded-md" />
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-xl bg-muted/28 px-2 py-1">
                  <Skeleton className="h-[13px] w-[13px] rounded-full" />
                  <Skeleton className="h-[13px] w-10 rounded-md" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-border/65 pt-3 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:pt-3.5">
              <Skeleton className="h-11 w-full rounded-2xl sm:h-10 sm:w-full" />
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
    <div className="relative z-0 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(186px,1fr))] sm:gap-x-6 sm:gap-y-8 lg:grid-cols-[repeat(auto-fill,minmax(204px,1fr))] lg:gap-x-7 lg:gap-y-10">
      {Array.from({ length: count }).map((_, index) => (
        <BookCardSkeleton key={index} isMobile={isMobile} />
      ))}
    </div>
  );
}
