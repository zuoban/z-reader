'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, Check, Loader2 } from 'lucide-react';
import type { Book } from '@/lib/api';
import { BookCardDropdown } from '@/components/BookCardDropdown';
import { cn } from '@/lib/utils';
import { useCoverUrl } from '@/hooks/useCoverUrl';

const BookMetadataDialog = dynamic(() => import('@/components/BookMetadataDialog')
  .then((module) => module.BookMetadataDialog));
const CategorySelector = dynamic(() => import('@/components/CategorySelector')
  .then((module) => module.CategorySelector));
const ConfirmDialog = dynamic(() => import('@/components/ConfirmDialog')
  .then((module) => module.ConfirmDialog));

interface BookCardProps {
  book: Book;
  index: number;
  categories: string[];
  bookCounts: Record<string, number>;
  onRead: (bookId: string) => void;
  onPrefetch?: (bookId: string) => void;
  onDelete: (bookId: string) => void | Promise<void>;
  onUpdate: () => void;
  isDeleting: boolean;
  formatSize: (bytes: number) => string;
  progressPercentage?: number | null;
  searchQuery?: string;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionToggle?: (bookId: string) => void;
}

function HighlightedText({
  text,
  query,
}: {
  text: string;
  query?: string;
}) {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) return <>{text}</>;

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
        className="rounded-[4px] bg-primary/14 px-0.5 text-inherit"
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

const BOOK_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '未知';
  return BOOK_DATE_TIME_FORMATTER.format(date);
}

/** Match shelf grid density: 2 cols mobile, ~3–4 sm, denser on desktop. */
export const SHELF_COVER_SIZES =
  '(max-width: 640px) 45vw, (max-width: 1024px) 28vw, (max-width: 1536px) 16vw, 200px';

/** Prefer eager decode for the first row or two above the fold. */
export const SHELF_COVER_PRIORITY_COUNT = 6;

interface BookCoverFaceProps {
  coverUrl: string | null;
  titleLabel: string;
  bookId: string;
  formatLabel: string;
  priority?: boolean;
}

// Pair each cloth color with the same warm paper lettering in both themes.
const fallbackCoverColors = [
  '#2e5249', '#3e5368', '#775035', '#713e49',
  '#505837', '#365c61', '#66513f', '#524665',
];

function BookCoverFace({
  coverUrl,
  titleLabel,
  bookId,
  formatLabel,
  priority = false,
}: BookCoverFaceProps) {
  if (coverUrl) {
    return (
      <Image
        src={coverUrl}
        alt={titleLabel}
        fill
        unoptimized
        priority={priority}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        sizes={SHELF_COVER_SIZES}
        className="shelf-book-cover-media object-cover"
      />
    );
  }

  // Keep the same binding when a book moves between sorts or filters.
  let hash = 0;
  for (let i = 0; i < bookId.length; i += 1) {
    hash = Math.imul(31, hash) + bookId.charCodeAt(i);
  }
  const coverColor = fallbackCoverColors[(hash >>> 0) % fallbackCoverColors.length];

  return (
    <div
      aria-hidden="true"
      className="book-cover-fallback shelf-book-cover-media relative grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] items-center gap-1.5 py-4 pl-[calc(11%+6px)] pr-[11%] text-center"
      style={{ '--cover-color': coverColor } as CSSProperties}
    >
      <span className="mx-auto h-px w-5 bg-current/35" />
      <p className="line-clamp-4 min-h-0 max-h-full [overflow-wrap:anywhere] text-balance font-heading text-base font-normal leading-[1.38] sm:text-lg">
        {titleLabel}
      </p>
      <span className="mx-auto max-w-full truncate border-t border-current/20 px-2 pt-1 text-[11px] leading-4 opacity-80">
        {formatLabel}
      </span>
    </div>
  );
}

export const BookCard = memo(function BookCard({
  book,
  index,
  categories,
  bookCounts,
  onRead,
  onPrefetch,
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const hasPotentialCover = Boolean(
    book.cover_thumb_path
    || book.cover_path
    || (
      !book.cover_missing
      && !book.processing_state
      && (!book.format || book.format.toLowerCase() === 'epub')
    )
  );
  const { coverUrl, ref: coverRef } = useCoverUrl(
    book.id,
    book.cover_thumb_path || book.cover_path,
    'thumb',
    hasPotentialCover
  );

  const formatLabel = book.format ? book.format.toUpperCase() : '电子书';
  const authorLabel = book.author?.trim() || '未知作者';
  const sizeLabel = book.size ? formatSize(book.size) : '';
  const titleLabel = book.title?.trim() || '未命名';
  const progressValue = Math.max(0, Math.min(progressPercentage ?? 0, 100));
  const progressDisplay = progressValue > 0 && progressValue < 1
    ? '<1%'
    : `${Math.min(Math.round(progressValue), progressValue === 100 ? 100 : 99)}%`;
  const progressStatus = progressValue === 100
    ? '已读完'
    : book.last_read_at ? formatRelativeTime(book.last_read_at) : progressValue > 0 ? '' : '未读';
  const progressMetaLabel = [progressStatus, progressValue > 0 && progressDisplay]
    .filter(Boolean).join(' · ');
  const uploadedAtLabel = formatDateTime(book.created_at);
  const categoryLabel = book.category?.trim() || '未分类';
  const readActionLabel = progressValue > 0 ? '继续阅读' : '开始阅读';

  function activateCard() {
    if (isDeleting) return;
    if (selectionMode) {
      onSelectionToggle?.(book.id);
      return;
    }

    onRead(book.id);
  }

  function handleRead() {
    if (isDeleting) return;
    onRead(book.id);
  }

  function handlePrefetch() {
    if (isDeleting || selectionMode) return;
    onPrefetch?.(book.id);
  }

  function handleSelectionToggle() {
    if (isDeleting) return;
    onSelectionToggle?.(book.id);
  }

  async function handleConfirmDelete() {
    if (isDeleting) return;
    try {
      await onDelete(book.id);
    } finally {
      setDeleteConfirmOpen(false);
    }
  }

  return (
    <div className="flex h-full w-full items-stretch" ref={coverRef}>
      <article
        className="shelf-book-card flex min-w-0 flex-1 flex-col"
        data-selected={selected}
        data-deleting={isDeleting || undefined}
        aria-busy={isDeleting || undefined}
      >
        <button
          type="button"
          disabled={isDeleting}
          onClick={activateCard}
          onPointerEnter={handlePrefetch}
          onFocus={handlePrefetch}
          aria-label={selectionMode ? `${selected ? '取消选择' : '选择'}《${titleLabel}》` : `阅读《${titleLabel}》`}
          aria-pressed={selectionMode ? selected : undefined}
          className="shelf-book-open flex min-w-0 cursor-pointer flex-col rounded-t-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
        >
          <div className="shelf-book-cover book-cover-spine">
            <BookCoverFace
              coverUrl={coverUrl}
              titleLabel={titleLabel}
              bookId={book.id}
              formatLabel={formatLabel}
              priority={index < SHELF_COVER_PRIORITY_COUNT}
            />
            {selectionMode && (
              <div className="shelf-book-selection" aria-hidden="true">
                {selected && <Check className="h-4 w-4" strokeWidth={1.75} />}
              </div>
            )}
            {book.processing_state === 'pending' && (
              <span className="absolute left-2 top-2 z-10 inline-flex max-w-[calc(100%-3rem)] items-center gap-1 rounded-md border border-border/80 bg-card/92 px-2 py-1 text-[11px] font-medium text-foreground shadow-xs backdrop-blur-xs">
                <Loader2
                  className="h-3 w-3 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="truncate">正在生成封面</span>
              </span>
            )}
          </div>

          <div className="shelf-book-details">
            <div className="min-w-0">
              <h2
                className="line-clamp-2 wrap-anywhere font-sans text-sm font-medium leading-5 text-foreground transition-colors sm:text-[15px]"
                title={titleLabel}
              >
                <HighlightedText text={titleLabel} query={searchQuery} />
              </h2>
              <p
                className="mt-1 truncate text-xs leading-4 text-muted-foreground"
                title={authorLabel}
              >
                <HighlightedText text={authorLabel} query={searchQuery} />
              </p>
            </div>

            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs leading-4 text-muted-foreground">
                <span className="min-w-0 flex-1 truncate" title={categoryLabel}>
                  {categoryLabel}
                </span>
                <p className="flex min-w-0 max-w-[65%] items-baseline gap-1" title={progressMetaLabel}>
                  {progressStatus && <span className="min-w-0 truncate">{progressStatus}</span>}
                  {progressValue > 0 && (
                    <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-primary">
                      {progressDisplay}
                    </span>
                  )}
                </p>
              </div>
              <div className="h-[2px] overflow-hidden rounded-full bg-border" aria-hidden="true">
                <div
                  className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-300 motion-reduce:transition-none"
                  style={{ transform: `scaleX(${progressValue > 0 ? Math.max(progressValue, 3) / 100 : 0})` }}
                />
              </div>
            </div>
          </div>
        </button>

        <div className="shelf-book-actions">
          {selectionMode ? (
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleSelectionToggle}
              aria-pressed={selected}
              className="shelf-book-action"
            >
              <Check
                aria-hidden="true"
                strokeWidth={1.5}
                className={cn(
                  'size-4 shrink-0',
                  selected ? 'text-primary' : 'opacity-50'
                )}
              />
              <span className="truncate">{selected ? '已选择' : '选择图书'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isDeleting}
              aria-busy={isDeleting || undefined}
              onClick={handleRead}
              aria-label={isDeleting ? `正在删除：${titleLabel}` : `${readActionLabel}：${titleLabel}`}
              className="shelf-book-action"
            >
              {isDeleting ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ) : (
                <BookOpen className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              )}
              <span className="truncate">{isDeleting ? '删除中…' : readActionLabel}</span>
            </button>
          )}

          {!selectionMode && (
            <BookCardDropdown
              bookTitle={titleLabel}
              categoryLabel={categoryLabel}
              formatLabel={formatLabel}
              sizeLabel={sizeLabel}
              uploadedAtLabel={uploadedAtLabel}
              isDeleting={isDeleting}
              onEditClick={() => setEditDialogOpen(true)}
              onCategoryClick={() => setCategoryDialogOpen(true)}
              onDeleteClick={() => setDeleteConfirmOpen(true)}
              triggerClassName="size-11 sm:size-9"
            />
          )}
        </div>
      </article>
      {editDialogOpen && <BookMetadataDialog
        bookId={book.id}
        currentTitle={book.title}
        currentAuthor={book.author}
        onUpdate={onUpdate}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />}
      {categoryDialogOpen && <CategorySelector
        bookId={book.id}
        currentCategory={book.category}
        categories={categories}
        bookCounts={bookCounts}
        onUpdate={onUpdate}
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
      />}
      {deleteConfirmOpen && <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="删除图书"
        description={`确定删除《${titleLabel}》吗？删除后将无法恢复。`}
        confirmLabel={isDeleting ? '删除中…' : '确认删除'}
        confirmDisabled={isDeleting}
        loading={isDeleting}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
      />}
    </div>
  );
});
