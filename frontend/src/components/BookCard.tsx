'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, Check } from 'lucide-react';
import type { Book } from '@/lib/api';
import { BookCardDropdown } from '@/components/BookCardDropdown';
import { cn } from '@/lib/utils';
import { useCoverUrl } from '@/hooks/useCoverUrl';

const CategorySelector = dynamic(() => import('@/components/CategorySelector')
  .then((module) => module.CategorySelector));
const ConfirmDialog = dynamic(() => import('@/components/ConfirmDialog')
  .then((module) => module.ConfirmDialog));

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
  categoryLabel: string;
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
  categoryLabel,
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
        className="object-cover"
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
      className="book-cover-fallback relative grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] items-center gap-1 px-[14%] py-4 text-center"
      style={{ '--cover-color': coverColor } as CSSProperties}
    >
      <span className="truncate text-[11px] leading-4">{formatLabel}</span>
      <p className="line-clamp-5 min-h-0 max-h-full [overflow-wrap:anywhere] font-heading text-lg font-medium leading-tight sm:text-xl">
        {titleLabel}
      </p>
      <span className="truncate border-t border-current/25 pt-1 text-[11px] leading-4">
        {categoryLabel || '未分类'}
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
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { coverUrl, ref: coverRef } = useCoverUrl(
    book.id,
    book.cover_thumb_path || book.cover_path,
    'thumb'
  );

  const formatLabel = book.format ? book.format.toUpperCase() : '电子书';
  const authorLabel = book.author?.trim() || '未知作者';
  const sizeLabel = book.size ? formatSize(book.size) : '';
  const titleLabel = book.title?.trim() || '未命名';
  const normalizedProgressValue = progressPercentage !== null
    ? Math.max(0, Math.min(progressPercentage, 100))
    : null;
  const progressValue = normalizedProgressValue ?? 0;
  const progressDisplay = progressValue > 0 && progressValue < 1
    ? '<1'
    : Math.round(progressValue).toString();
  const lastReadLabel = book.last_read_at ? formatRelativeTime(book.last_read_at) : '未开始';
  const progressMetaLabel = progressValue > 0
    ? (book.last_read_at ? `${progressDisplay}% · ${lastReadLabel}` : `已读 ${progressDisplay}%`)
    : lastReadLabel;
  const uploadedAtLabel = formatDateTime(book.created_at);
  const categoryLabel = book.category?.trim() ?? '';
  const readActionLabel = progressValue > 0 ? '继续阅读' : '开始阅读';

  function activateCard() {
    if (selectionMode) {
      onSelectionToggle?.();
      return;
    }

    onRead();
  }

  return (
    <div className="flex h-full w-full items-stretch" ref={coverRef}>
      <article className="shelf-book-card flex min-w-0 flex-1 flex-col" data-selected={selected}>
        <button
          type="button"
          onClick={activateCard}
          aria-label={selectionMode ? `${selected ? '取消选择' : '选择'}《${titleLabel}》` : `阅读《${titleLabel}》`}
          aria-pressed={selectionMode ? selected : undefined}
          className="shelf-book-open flex min-w-0 cursor-pointer flex-col rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div className="shelf-book-cover book-cover-spine">
            <BookCoverFace
              coverUrl={coverUrl}
              titleLabel={titleLabel}
              bookId={book.id}
              formatLabel={formatLabel}
              categoryLabel={categoryLabel}
              priority={index < SHELF_COVER_PRIORITY_COUNT}
            />
            {selectionMode && (
              <div className="shelf-book-selection" aria-hidden="true">
                {selected && <Check className="h-4 w-4" strokeWidth={2} />}
              </div>
            )}
            {book.processing_state === 'pending' && (
              <span className="absolute bottom-2 left-2 rounded-md bg-card/95 px-2 py-1 text-xs font-medium text-foreground">
                正在生成封面
              </span>
            )}
          </div>

          <div className="shelf-book-details">
            <div className="min-w-0">
              <h2
                className="line-clamp-2 [overflow-wrap:anywhere] font-heading text-[15px] font-medium leading-[1.35] text-foreground transition-colors"
                title={titleLabel}
              >
                <HighlightedText text={titleLabel} query={searchQuery} />
              </h2>
              <p className="mt-1 truncate text-xs leading-4 text-muted-foreground">
                <HighlightedText text={authorLabel} query={searchQuery} />
              </p>
            </div>

            <div className="min-w-0 space-y-1.5">
              <div
                className={cn('h-1 overflow-hidden rounded-full bg-border', progressValue <= 0 && 'invisible')}
                aria-hidden="true"
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-300 motion-reduce:transition-none"
                  style={{ transform: `scaleX(${Math.max(progressValue, 2) / 100})` }}
                />
              </div>
              <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs leading-4 text-muted-foreground">
                <p className="truncate" title={categoryLabel || formatLabel}>
                  {categoryLabel || formatLabel}
                </p>
                <p className="min-w-0 max-w-[65%] shrink-0 truncate tabular-nums" title={progressMetaLabel}>
                  {progressMetaLabel}
                </p>
              </div>
            </div>
          </div>
        </button>

        <div className="shelf-book-actions">
          {selectionMode ? (
            <button
              type="button"
              onClick={onSelectionToggle}
              aria-pressed={selected}
              className="inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-1 text-meta transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8"
            >
              <Check
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  selected ? 'text-primary' : 'opacity-50'
                )}
              />
              <span className="truncate">{selected ? '已选择' : '选择图书'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRead}
              aria-label={`${readActionLabel}：${titleLabel}`}
              className="inline-flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-1 text-meta transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.5} />
              <span className="truncate">{readActionLabel}</span>
            </button>
          )}

          {!selectionMode && (
            <BookCardDropdown
              formatLabel={formatLabel}
              sizeLabel={sizeLabel}
              uploadedAtLabel={uploadedAtLabel}
              lastReadLabel={lastReadLabel}
              isDeleting={isDeleting}
              onCategoryClick={() => setCategoryDialogOpen(true)}
              onDeleteClick={() => setDeleteConfirmOpen(true)}
              triggerClassName="size-11 sm:size-8"
            />
          )}
        </div>
      </article>
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
        description="确定删除这本图书吗？删除后将无法恢复。"
        confirmLabel={isDeleting ? '删除中' : '确认删除'}
        confirmDisabled={isDeleting}
        onConfirm={() => {
          onDelete();
          setDeleteConfirmOpen(false);
        }}
      />}
    </div>
  );
});
