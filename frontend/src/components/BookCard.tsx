'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import type { Book } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CategorySelector } from '@/components/CategorySelector';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BookCardDropdown } from '@/components/BookCardDropdown';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
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

const PerspectiveBook = dynamic(
  () => import('@/registry/spell-ui/perspective-book').then((m) => ({ default: m.PerspectiveBook })),
  { ssr: false }
);

interface BookCardProps {
  book: Book;
  index: number;
  categories: string[];
  bookCounts: Record<string, number>;
  onRead: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  isDeleting: boolean;
  formatSize: (bytes: number) => string;
  progressPercentage?: number | null;
  searchQuery?: string;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionToggle?: () => void;
}

function HighlightedText({
  text,
  query,
}: {
  text: string;
  query?: string;
}) {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) return text;

  const normalizedText = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = normalizedText.indexOf(normalizedQuery);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(text.slice(cursor, matchIndex));
    }

    const matchEnd = matchIndex + normalizedQuery.length;
    parts.push(
      <mark
        key={`${matchIndex}-${matchEnd}`}
        className="rounded-[0.35rem] bg-primary/14 px-0.5 text-inherit decoration-primary/40"
      >
        {text.slice(matchIndex, matchEnd)}
      </mark>
    );

    cursor = matchEnd;
    matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  if (diffWeeks < 4) return `${diffWeeks}周前`;
  if (diffMonths < 12) return `${diffMonths}个月前`;
  return `${diffYears}年前`;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

interface BookCoverFaceProps {
  coverUrl: string | null;
  titleLabel: string;
}

function BookCoverFace({ coverUrl, titleLabel }: BookCoverFaceProps) {
  const isMobile = useIsMobile();
  if (coverUrl) {
    return (
      <div className="relative h-full w-full">
        <Image
          src={coverUrl}
          alt={titleLabel}
          fill
          unoptimized
          sizes="(max-width: 640px) 40vw, (max-width: 1024px) 18vw, 156px"
          className="object-cover"
        />
        {coverUrl && !isMobile && (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_25%,rgba(8,12,24,0.22)_100%)]" />
        )}
        {coverUrl && !isMobile && (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(107,139,250,0.06),transparent_12%,transparent_88%,rgba(0,0,0,0.08))]" />
        )}
      </div>
    );
  }

  return (
    <div className="paper-cover-frame relative flex size-full flex-col p-4 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(107,139,250,0.12)_0%,rgba(155,141,249,0.06)_50%,rgba(6,182,212,0.04)_100%)]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className="paper-badge rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-primary/70">
            BOOK
          </span>
          <span className="text-[10px] font-semibold tracking-[0.24em] text-foreground/30 uppercase">
            Z
          </span>
        </div>
        <div className="mt-5 space-y-3">
          <div className="h-px w-9 bg-primary/20" />
          <h3 className="line-clamp-4 text-[13px] font-semibold leading-[1.5] tracking-[-0.01em] text-foreground/85">
            {titleLabel}
          </h3>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-primary/50 uppercase">
              Z Reader
            </div>
            <div className="h-px w-12 bg-primary/15" />
          </div>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary/35"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function BookCard({
  book,
  index,
  categories,
  bookCounts,
  onRead,
  onDelete,
  onUpdate,
  isDeleting,
  formatSize,
  progressPercentage = null,
  searchQuery,
  selectionMode = false,
  selected = false,
  onSelectionToggle,
}: BookCardProps) {
  const isMobile = useIsMobile();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const formatLabel = book.format ? book.format.toUpperCase() : 'BOOK';
  const authorLabel = book.author?.trim() || '未知作者';
  const sizeLabel = book.size ? formatSize(book.size) : '';
  const titleLabel = book.title?.trim() || '未命名';
  const normalizedProgressValue = progressPercentage !== null
    ? Math.max(0, Math.min(progressPercentage, 100))
    : null;
  const progressValue = normalizedProgressValue ?? 0;
  const progressDisplay = progressValue.toFixed(1);
  const lastReadLabel = book.last_read_at ? formatRelativeTime(book.last_read_at) : '未开始';
  const uploadedAtLabel = formatDateTime(book.created_at);
  const categoryLabel = book.category?.trim() ?? '';

  const cardWidth = isMobile ? MOBILE_CARD_WIDTH : DESKTOP_CARD_WIDTH;
  const coverHeight = isMobile ? MOBILE_COVER_HEIGHT : DESKTOP_COVER_HEIGHT;
  const bookScale = isMobile ? MOBILE_BOOK_SCALE : DESKTOP_BOOK_SCALE;
  const progressMeter = (
    <div className="flex items-center gap-2.5">
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-border/70">
        <div
          className="h-full rounded-full bg-primary/75 transition-[width] duration-500 ease-out"
          style={{ width: `${progressValue}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums text-[10px] font-semibold text-muted-foreground">
        {progressDisplay}%
      </span>
    </div>
  );

  function isNestedInteractiveTarget(target: EventTarget | null, currentTarget: Element) {
    if (!(target instanceof Element)) return false;

    const interactiveTarget = target.closest(
      'a, button, input, select, textarea, [role="button"], [role="menuitem"]'
    );

    return Boolean(interactiveTarget && interactiveTarget !== currentTarget);
  }

  function activateCard() {
    if (selectionMode) {
      onSelectionToggle?.();
      return;
    }

    onRead();
  }

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
    activateCard();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    activateCard();
  }

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    api.fetchCover(book.id).then((blob) => {
      if (blob && !cancelled) {
        url = URL.createObjectURL(blob);
        setCoverUrl(url);
      }
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [book.id]);

  return (
    <div
      className="flex items-center justify-start lg:justify-center"
    >
      <Card
        className={cn(
          "group/card paper-reveal-soft relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/55 bg-card/78 p-0 shadow-[0_12px_32px_-28px_var(--paper-shadow)] ring-1 ring-white/45 transition-[border-color,box-shadow,transform,background-color] duration-200 dark:ring-white/10",
          !isMobile && "hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_18px_46px_-30px_var(--paper-shadow)]",
          selected && "border-primary/65 bg-primary/5 ring-primary/20"
        )}
        style={{
          width: isMobile ? '100%' : cardWidth,
          '--paper-delay': `${Math.min(index, 10) * 28}ms`,
        } as CSSProperties}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
        aria-label={selectionMode ? `${selected ? '取消选择' : '选择'}《${titleLabel}》` : `阅读《${titleLabel}》`}
        aria-pressed={selectionMode ? selected : undefined}
      >
          {selectionMode && (
            <div
              className={cn(
                "absolute right-3 top-3 z-30 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                selected
                  ? "border-primary bg-primary text-white"
                  : "border-border/80 bg-card/90"
              )}
              aria-hidden="true"
            >
              <Check className={cn("h-3 w-3", selected ? "opacity-100" : "opacity-0")} />
            </div>
          )}
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
                <PerspectiveBook size="sm" textured={!coverUrl}>
                  <BookCoverFace coverUrl={coverUrl} titleLabel={titleLabel} />
                </PerspectiveBook>
              </div>
            </div>

            {!isMobile && (
              <div className="absolute inset-x-3 bottom-3 z-20 rounded-full border border-border/55 bg-card/88 px-3 py-2 shadow-[0_10px_26px_-22px_var(--paper-shadow)] backdrop-blur-sm">
                {progressMeter}
              </div>
            )}
          </div>

          {isMobile && (
            <div className="border-t border-border/45 bg-card/86 px-3.5 py-2.5">
              {progressMeter}
            </div>
          )}

          <div className="flex flex-col bg-card/92 px-3.5 pb-4 pt-3.5 sm:px-4 sm:pb-4 sm:pt-3.5">
            <div className="space-y-1">
              <div className="relative pr-6 sm:pr-5">
                <h3
                  className="min-w-0 font-heading text-[14px] font-semibold leading-[1.4] text-foreground/92"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    height: 'calc(14px * 1.4 * 2)',
                  }}
                  title={titleLabel}
                >
                  <HighlightedText text={titleLabel} query={searchQuery} />
                </h3>

                <div className="mt-2 flex min-h-5 items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground/88">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="truncate">
                      <HighlightedText text={authorLabel} query={searchQuery} />
                    </span>
                  </span>

                  {categoryLabel && (
                    <span className="shrink-0 items-center gap-1 rounded-full bg-muted/58 px-2 py-0.5 text-[10px] sm:inline-flex">
                      <span className="max-w-[5.5rem] truncate">
                        <HighlightedText text={categoryLabel} query={searchQuery} />
                      </span>
                    </span>
                  )}
                </div>
                {!selectionMode && (
                  <BookCardDropdown
                    formatLabel={formatLabel}
                    sizeLabel={sizeLabel}
                    uploadedAtLabel={uploadedAtLabel}
                    lastReadLabel={lastReadLabel}
                    isDeleting={isDeleting}
                    onCategoryClick={() => setCategoryDialogOpen(true)}
                    onDeleteClick={() => setDeleteConfirmOpen(true)}
                  />
                )}
              </div>
            </div>
          </div>
        </Card>
      <CategorySelector
        bookId={book.id}
        currentCategory={book.category}
        categories={categories}
        bookCounts={bookCounts}
        onUpdate={onUpdate}
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="删除图书"
        description="确定删除这本图书吗？删除后将无法恢复。"
        confirmLabel={isDeleting ? '删除中' : '确认删除'}
        confirmDisabled={isDeleting}
        onConfirm={() => {
          onDelete();
          setDeleteConfirmOpen(false);
        }}
      />
    </div>
  );
}
