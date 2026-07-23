'use client';

import Image from 'next/image';
import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, Check } from 'lucide-react';
import { Book } from '@/lib/api';
import { CategorySelector } from '@/components/CategorySelector';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BookCardDropdown } from '@/components/BookCardDropdown';
import { cn } from '@/lib/utils';
import { useCoverUrl } from '@/hooks/useCoverUrl';

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

interface BookCoverFaceProps {
  coverUrl: string | null;
  titleLabel: string;
  authorLabel: string;
  categoryLabel: string;
  index: number;
}

/* Muted parchment-inspired covers — refined, not candy-pastel */
const fallbackCoverGradients = [
  'linear-gradient(155deg, #3d4f5f 0%, #6b8494 48%, #8fa3ad 100%)',
  'linear-gradient(155deg, #4a3f55 0%, #7a6b88 48%, #a094ad 100%)',
  'linear-gradient(155deg, #3f5248 0%, #6a8574 48%, #8fa99a 100%)',
  'linear-gradient(155deg, #5c3f3c 0%, #8f6a64 48%, #b8948c 100%)',
  'linear-gradient(155deg, #5c4e32 0%, #8f7d52 48%, #b8a878 100%)',
  'linear-gradient(155deg, #36555a 0%, #5f8488 48%, #8aadb0 100%)',
  'linear-gradient(155deg, #5a4634 0%, #8a7054 48%, #b49878 100%)',
  'linear-gradient(155deg, #3a4a52 0%, #62757e 48%, #8a9aa3 100%)',
];

function BookCoverFace({
  coverUrl,
  titleLabel,
  authorLabel,
  categoryLabel,
  index,
}: BookCoverFaceProps) {
  if (coverUrl) {
    return (
      <div className="relative h-full w-full">
        <Image
          src={coverUrl}
          alt={titleLabel}
          fill
          unoptimized
          sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 16vw"
          className="object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.035]"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05)_0%,transparent_32%,rgba(0,0,0,0.22)_100%)]" />
        <span className="absolute left-2.5 top-2.5 rounded-full border border-black/5 bg-background/92 px-2.5 py-1 text-[11px] font-semibold leading-none text-foreground shadow-[0_6px_14px_-10px_rgba(0,0,0,0.35)] backdrop-blur-sm dark:border-white/10">
          {categoryLabel}
        </span>
      </div>
    );
  }

  const background = fallbackCoverGradients[index % fallbackCoverGradients.length];

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-5 text-center text-white sm:px-6"
      style={{ background }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_12%,rgba(255,255,255,0.18),transparent_36%),linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.18)_100%)] transition-transform duration-500 ease-out group-hover/card:scale-[1.04]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
      {categoryLabel && (
        <span className="absolute left-2.5 top-2.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] font-semibold leading-none text-white/95 shadow-sm backdrop-blur-sm">
          {categoryLabel}
        </span>
      )}
      <div className="relative mt-6 flex min-h-[7rem] flex-col items-center justify-center gap-2.5">
        <h3 className="line-clamp-4 text-balance font-serif text-[1.18rem] font-semibold leading-[1.28] tracking-[-0.02em] text-white drop-shadow-sm sm:text-[1.28rem]">
          {titleLabel}
        </h3>
        <p className="line-clamp-2 font-serif text-[0.88rem] font-medium leading-tight text-white/80 sm:text-[0.92rem]">
          {authorLabel}
        </p>
      </div>
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
    <div className="flex w-full items-stretch" ref={coverRef}>
      <article
        className={cn(
          'group/card shelf-book-card paper-reveal-soft relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl p-0',
          selected && 'border-primary ring-2 ring-primary/80 dark:border-primary dark:ring-primary/55'
        )}
        style={{
          // Virtual grid only mounts near-viewport rows; skip content-visibility
          // so measureElement gets accurate heights.
          '--paper-delay': `${Math.min(index, 8) * 24}ms`,
        } as CSSProperties}
      >
        <button
          type="button"
          onClick={activateCard}
          aria-label={selectionMode ? `${selected ? '取消选择' : '选择'}《${titleLabel}》` : `阅读《${titleLabel}》`}
          aria-pressed={selectionMode ? selected : undefined}
          className="relative flex min-w-0 flex-1 cursor-pointer flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {selectionMode && (
            <div
              className={cn(
                'pointer-events-none absolute right-3 top-3 z-30 flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/40 bg-white/80 backdrop-blur-sm dark:border-white/12 dark:bg-black/35'
              )}
              aria-hidden="true"
            >
              <Check className={cn('h-3 w-3', selected ? 'opacity-100' : 'opacity-30')} />
            </div>
          )}

          <div className="relative aspect-[3/4] overflow-hidden bg-[var(--shelf-card-media)]">
            <BookCoverFace
              coverUrl={coverUrl}
              titleLabel={titleLabel}
              authorLabel={authorLabel}
              categoryLabel={categoryLabel || formatLabel}
              index={index}
            />
            {book.processing_state === 'pending' && (
              <span className="absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                正在生成封面
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col p-3 pb-2 sm:p-3.5 sm:pb-2">
            <div className="mb-2.5 flex-1 sm:mb-3">
              <h3
                className="line-clamp-2 text-[0.98rem] font-semibold leading-[1.3] tracking-[-0.015em] text-foreground"
                title={titleLabel}
              >
                <HighlightedText text={titleLabel} query={searchQuery} />
              </h3>

              <p className="mt-1.5 line-clamp-1 text-[0.84rem] font-medium text-muted-foreground">
                <HighlightedText text={authorLabel} query={searchQuery} />
              </p>
            </div>

            <div className="mt-auto space-y-2 sm:space-y-3">
              <div className="space-y-1 sm:space-y-1.5">
                <div className="relative h-1 w-full overflow-hidden rounded-full bg-secondary/70 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-primary/90 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(progressValue, progressValue > 0 ? 2 : 0)}%` }}
                  />
                </div>
                {progressValue > 0 ? (
                  <p className="text-meta tabular-nums">
                    {progressDisplay}% · {lastReadLabel}
                  </p>
                ) : (
                  <p className="text-meta">{lastReadLabel}</p>
                )}
              </div>
            </div>
          </div>
        </button>

        <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border/40 px-3 py-2 sm:min-h-10 sm:px-3.5 dark:border-white/8">
          {selectionMode ? (
            <button
              type="button"
              onClick={onSelectionToggle}
              aria-pressed={selected}
              className="touch-control -my-2 inline-flex min-w-0 items-center gap-1.5 rounded-lg text-meta transition-colors hover:text-foreground"
            >
              <Check
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  selected ? 'text-foreground' : 'opacity-55'
                )}
              />
              <span className="truncate">{selected ? '已选择' : '选择图书'}</span>
            </button>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-meta">
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-foreground/72" />
              <span className="truncate">{readActionLabel}</span>
            </span>
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
              triggerClassName="h-9 w-9 shrink-0 rounded-lg border border-border/45 bg-card text-muted-foreground transition-all hover:bg-secondary/60 hover:text-foreground active:scale-[0.95] dark:border-white/8 dark:bg-white/[0.045] dark:hover:bg-white/[0.08]"
            />
          )}
        </div>
      </article>
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
});
