'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { Tag, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import type { Book } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CategorySelector } from '@/components/CategorySelector';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BookCardDropdown } from '@/components/BookCardDropdown';
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
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_30%,rgba(8,12,24,0.28)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(107,139,250,0.08),transparent_15%,transparent_85%,rgba(0,0,0,0.12))]" />
      </div>
    );
  }

  return (
    <div className="paper-cover-frame relative flex size-full flex-col p-4 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(107,139,250,0.15)_0%,rgba(155,141,249,0.08)_50%,rgba(6,182,212,0.06)_100%)]" />
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
}: BookCardProps) {
  const isMobile = useIsMobile();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const formatLabel = book.format ? book.format.toUpperCase() : 'BOOK';
  const authorLabel = book.author?.trim() || '未知作者';
  const sizeLabel = book.size ? formatSize(book.size) : '';
  const titleLabel = book.title?.trim() || '未命名';
  const progressValue = progressPercentage !== null
    ? Math.max(0, Math.min(progressPercentage, 100))
    : null;
  const progressDisplay = progressValue !== null ? progressValue.toFixed(1) : '';
  const hasProgress = progressValue !== null && progressValue > 0;
  const lastReadLabel = book.last_read_at ? formatRelativeTime(book.last_read_at) : '未开始';
  const uploadedAtLabel = formatDateTime(book.created_at);
  const categoryLabel = book.category?.trim() ?? '';

  const cardWidth = isMobile ? MOBILE_CARD_WIDTH : DESKTOP_CARD_WIDTH;
  const coverHeight = isMobile ? MOBILE_COVER_HEIGHT : DESKTOP_COVER_HEIGHT;
  const bookScale = isMobile ? MOBILE_BOOK_SCALE : DESKTOP_BOOK_SCALE;
  const bookPreviewWidth = Math.round(SPELL_BOOK_WIDTH * bookScale);
  const bookPreviewHeight = Math.round(SPELL_BOOK_HEIGHT * bookScale);
  const progressMeter = hasProgress ? (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progressValue}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums text-[10px] font-semibold tracking-tight text-foreground/70">
        {progressDisplay}%
      </span>
    </div>
  ) : null;

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
      className="paper-reveal flex items-center justify-start"
      style={{ '--paper-delay': `${Math.min(index * 55, 260)}ms` } as CSSProperties}
    >
      <Card
        className="group/card shelf-book-card relative flex cursor-pointer flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card p-0 gap-0 transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-1 hover:border-primary/30 hover:bg-card active:translate-y-0 active:scale-[0.995] motion-reduce:transition-none"
        style={{ width: isMobile ? '100%' : cardWidth }}
        onClick={onRead}
      >
          <div
            className="relative overflow-hidden bg-gradient-to-b from-muted/60 to-muted/30 dark:from-muted/40 dark:to-muted/20"
            style={{ height: coverHeight }}
          >
            {isMobile && (
              <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-border/60" />
            )}
            <div className="relative z-10 flex h-full items-center justify-center p-2 sm:p-3">
              <div
                className="relative shrink-0 -translate-y-2"
                style={{ height: bookPreviewHeight, width: bookPreviewWidth }}
              >
                <PerspectiveBook size="sm" textured={!coverUrl}>
                  <BookCoverFace coverUrl={coverUrl} titleLabel={titleLabel} />
                </PerspectiveBook>
              </div>
            </div>
            {hasProgress && !isMobile && (
              <div className="absolute inset-x-0 bottom-0 z-20 px-2.5 pb-2 sm:px-3 sm:pb-2.5">
                {progressMeter}
              </div>
            )}
          </div>
          {hasProgress && isMobile && (
            <div className="border-t border-border/35 bg-card px-3.5 py-2">
              {progressMeter}
            </div>
          )}
          <div className="flex flex-col border-t border-border/40 bg-card px-3.5 pb-3 pt-3 sm:px-4 sm:pb-3.5 sm:pt-3.5">
            <div className="space-y-2">
              <div className="relative pr-6 sm:pr-5">
                <h3
                  className="min-w-0 font-heading text-[14px] font-semibold leading-[21px] tracking-[-0.02em] text-foreground"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    height: '42px',
                  }}
                  title={titleLabel}
                >
                  {titleLabel}
                </h3>
                <div className="-mr-6 mt-1.5 flex min-h-5 items-center justify-between gap-2 text-[10.5px] font-medium leading-4 text-muted-foreground sm:-mr-5">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <UserRound className="h-3 w-3 shrink-0 text-muted-foreground/55" />
                    <span className="truncate">{authorLabel}</span>
                  </span>
                  {categoryLabel && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-foreground/55">
                      <Tag className="h-3 w-3 shrink-0 text-muted-foreground/55" />
                      <span className="max-w-[5.5rem] truncate sm:max-w-[4.5rem]">{categoryLabel}</span>
                    </span>
                  )}
                </div>
                <BookCardDropdown
                  formatLabel={formatLabel}
                  sizeLabel={sizeLabel}
                  uploadedAtLabel={uploadedAtLabel}
                  lastReadLabel={lastReadLabel}
                  isDeleting={isDeleting}
                  onCategoryClick={() => setCategoryDialogOpen(true)}
                  onDeleteClick={() => setDeleteConfirmOpen(true)}
                />
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
