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
          className="paper-panel paper-stack relative flex cursor-default flex-col overflow-hidden rounded-[1.75rem] border border-border/65 bg-card"
          style={{
            width: isMobile ? '100%' : cardWidth,
            boxShadow:
              '0 12px 24px -24px rgba(64,36,20,0.24), 0 6px 16px -18px rgba(64,36,20,0.14)',
          }}
        >
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.82),transparent)]" />
          {/* Cover skeleton */}
          <div
            className="relative overflow-hidden bg-muted/45 dark:bg-muted/30"
            style={{ height: coverHeight }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_24%,transparent_74%,rgba(66,43,25,0.08))]" />
            {isMobile && (
              <>
                <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-border/60" />
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
                    <div className="paper-cover-frame relative aspect-[49/60] h-full w-full overflow-hidden rounded-[4px] border border-border/50 bg-muted/80 shadow-[0_10px_18px_-18px_rgba(64,36,20,0.18)]">
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
            </div>
          </div>

          {/* Info skeleton */}
          <div
            className="flex flex-col justify-between border-t border-border/65 bg-card px-4 pb-3.5 pt-4 sm:px-[18px] sm:pb-4 sm:pt-4.5"
            style={isMobile ? { minHeight: infoHeight - 70 } : { height: infoHeight - 70 }}
          >
            <div className="space-y-2.5">
              {/* Title skeleton */}
              <div className="relative pr-7 sm:pr-6">
                <Skeleton className="min-h-[44px] min-w-0 rounded-md sm:min-h-[44px]" />
                <Skeleton className="absolute right-[-4px] top-[-4px] h-8 w-8 rounded-[0.95rem] sm:h-[30px] sm:w-[30px] sm:rounded-[0.9rem]" />
              </div>

              {/* Author skeleton */}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="paper-chip flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1">
                  <Skeleton className="h-[15px] w-[15px] shrink-0 rounded-full" />
                  <Skeleton className="h-[15px] w-24 rounded-md" />
                </div>
                <Skeleton className="h-9 w-[74px] shrink-0 rounded-xl sm:h-8 sm:w-[68px]" />
              </div>
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
    <div className="relative z-0 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(186px,1fr))] sm:gap-x-7 sm:gap-y-10 lg:grid-cols-[repeat(auto-fill,minmax(204px,1fr))] lg:gap-x-8 lg:gap-y-12">
      {Array.from({ length: count }).map((_, index) => (
        <BookCardSkeleton key={index} isMobile={isMobile} />
      ))}
    </div>
  );
}
