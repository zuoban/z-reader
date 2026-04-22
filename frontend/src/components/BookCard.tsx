'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  Clock,
  FileText,
  HardDrive,
  MoreHorizontal,
  Tag,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api, Book, Category } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CategorySelector } from '@/components/CategorySelector';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';

// 书本预览组件按需加载，避免阻塞首屏
const PerspectiveBook = dynamic(
  () => import('@/registry/spell-ui/perspective-book').then((m) => ({ default: m.PerspectiveBook })),
  { ssr: false }
);

interface BookCardProps {
  book: Book;
  index: number;
  categories: Category[];
  bookCounts: Record<string, number>;
  onRead: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  isDeleting: boolean;
  formatSize: (bytes: number) => string;
}

const MOBILE_CARD_WIDTH = 172;
const MOBILE_CARD_SCALE = 1;
const MOBILE_COVER_HEIGHT = 210;

const DESKTOP_CARD_WIDTH = 218;
const DESKTOP_CARD_SCALE = 0.83;
const DESKTOP_COVER_HEIGHT = 242;
// 标准书籍封面宽高比（49:60），用于 PerspectiveBook 预览尺寸计算
const SPELL_BOOK_WIDTH = 150;
const SPELL_BOOK_HEIGHT = Math.round((SPELL_BOOK_WIDTH * 60) / 49);

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

  const timeStr = (() => {
    if (diffSecs < 60) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffWeeks < 4) return `${diffWeeks}周前`;
    if (diffMonths < 12) return `${diffMonths}个月前`;
    return `${diffYears}年前`;
  })();

  return timeStr;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return '未知';
  }

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

function BookCoverFace({
  coverUrl,
  titleLabel,
}: BookCoverFaceProps) {
  if (coverUrl) {
    return (
      <div className="relative h-full w-full bg-[linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(244,238,230,0.96)_100%)] dark:bg-[linear-gradient(160deg,rgba(28,28,28,0.96)_0%,rgba(18,18,18,0.98)_100%)]">
        <Image
          src={coverUrl}
          alt={titleLabel}
          fill
          unoptimized
          sizes="(max-width: 640px) 40vw, (max-width: 1024px) 18vw, 156px"
          className="object-cover saturate-[1.02] contrast-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_26%,rgba(23,23,23,0.22)_100%)] mix-blend-screen dark:bg-[linear-gradient(180deg,transparent_0%,transparent_24%,rgba(0,0,0,0.38)_100%)] dark:mix-blend-normal" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.18),transparent_10%,transparent_90%,rgba(0,0,0,0.14))]" />
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),inset_0_-18px_32px_-24px_rgba(0,0,0,0.55)]" />
      </div>
    );
  }

  // 默认封面 - 纸张质感
  return (
    <div className="paper-cover-frame relative flex size-full flex-col p-4 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_18%,transparent_82%,rgba(71,46,28,0.08))]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className="paper-badge rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-foreground/55">
            BOOK
          </span>
          <span className="text-[10px] font-semibold tracking-[0.24em] text-foreground/32 uppercase">
            Z
          </span>
        </div>
        <div className="mt-5 space-y-3">
          <div className="h-px w-9 bg-foreground/12" />
          <h3 className="line-clamp-4 text-[13px] font-semibold leading-[1.5] tracking-[-0.01em] text-foreground/90">
            {titleLabel}
          </h3>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-foreground/35 uppercase">
              Z Reader
            </div>
            <div className="h-px w-12 bg-foreground/10" />
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
            className="text-foreground/40"
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
}: BookCardProps) {
  const isMobile = useIsMobile();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const formatLabel = book.format ? book.format.toUpperCase() : 'BOOK';
  const authorLabel = book.author?.trim() || '未知作者';
  const sizeLabel = book.size ? formatSize(book.size) : '';
  const titleLabel = book.title?.trim() || '未命名';
  const progressValue = progress !== null ? Math.max(0, Math.min(progress, 100)) : null;
  const progressDisplay = progressValue !== null ? progressValue.toFixed(1) : '';
  const lastReadLabel = book.last_read_at ? formatRelativeTime(book.last_read_at) : '未开始';
  const uploadedAtLabel = formatDateTime(book.created_at);
  const readButtonLabel = '阅读';
  const category = useMemo(
    () => categories.find((item) => item.id === book.category_id) ?? null,
    [book.category_id, categories]
  );
  const categoryLabel = category?.name ?? '未分类';
  const cardWidth = isMobile ? MOBILE_CARD_WIDTH : DESKTOP_CARD_WIDTH;
  const cardScale = isMobile ? MOBILE_CARD_SCALE : DESKTOP_CARD_SCALE;
  const cardFrameWidth = Math.round(cardWidth * cardScale);
  const coverHeight = isMobile ? MOBILE_COVER_HEIGHT : DESKTOP_COVER_HEIGHT;
  const bookScale = isMobile ? 0.86 : 1;
  const bookPreviewWidth = Math.round(SPELL_BOOK_WIDTH * bookScale);
  const bookPreviewHeight = Math.round(SPELL_BOOK_HEIGHT * bookScale);

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

  useEffect(() => {
    let cancelled = false;

    api.getProgress(book.id)
      .then((progress) => {
        if (!cancelled && progress?.percentage !== undefined) {
          setProgress(progress.percentage);
        }
      })
      .catch(() => {
        // 404 或无进度数据时静默处理
        if (!cancelled) {
          setProgress(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [book.id]);

  const animationStyle = {
    '--paper-delay': `${Math.min(index * 55, 260)}ms`,
    width: isMobile ? '100%' : cardFrameWidth,
  } as CSSProperties;

  return (
    <div
      className="paper-reveal flex items-center justify-start"
      style={animationStyle}
    >
      <div
        style={{
          transform: `scale(${cardScale})`,
          transformOrigin: 'center',
          width: isMobile ? '100%' : cardWidth,
        }}
      >
        <Card
          className="group/card paper-stack relative flex cursor-default flex-col overflow-hidden rounded-[1.75rem] border border-border/65 bg-card transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-border/85 hover:shadow-[0_18px_30px_-28px_rgba(64,36,20,0.26)] active:translate-y-0 active:scale-[0.995] active:shadow-[0_12px_20px_-20px_rgba(64,36,20,0.18)] motion-reduce:transition-none cursor-pointer"
          style={{
            width: isMobile ? '100%' : cardWidth,
            boxShadow:
              '0 12px 24px -24px rgba(64,36,20,0.24), 0 6px 16px -18px rgba(64,36,20,0.14)',
          }}
        >
          <div
            className="relative overflow-hidden bg-muted/45 dark:bg-muted/30"
            style={{ height: coverHeight }}
          >
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
                    <PerspectiveBook size="sm" textured={!coverUrl}>
                      <BookCoverFace
                        coverUrl={coverUrl}
                        titleLabel={titleLabel}
                      />
                    </PerspectiveBook>
                  </div>
                </div>
              </div>
            </div>

            {book.category_id && category && (
              <div className="absolute right-2.5 top-2 z-20 sm:right-3 sm:top-2.5">
                <span className="paper-chip inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[10.5px] font-medium leading-4 tracking-[0.01em] text-foreground/80">
                  <Tag className="h-3 w-3 shrink-0" />
                  <span className="max-w-[4.5rem] truncate">{categoryLabel}</span>
                </span>
              </div>
            )}
            {progressValue !== null && progressValue > 0 && (
              <div className="absolute inset-x-0 bottom-0 z-20 px-2.5 pb-2 sm:px-3 sm:pb-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full bg-primary/85 transition-[width] duration-500 ease-out"
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                  <span className="shrink-0 tabular-nums text-[10px] font-semibold tracking-tight text-foreground/70">
                    {progressDisplay}%
                  </span>
                </div>
              </div>
            )}
          </div>
          <div
            className="flex flex-col border-t border-border/50 bg-card px-3.5 pb-3 pt-3 sm:px-4 sm:pb-3.5 sm:pt-3.5"
          >
            <div className="space-y-2">
              <div className="relative pr-6 sm:pr-5">
                <h3
                  className="min-w-0 font-heading text-[14px] font-semibold leading-[21px] tracking-[-0.02em] text-foreground"
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '42px' }}
                  title={titleLabel}
                >
                  {titleLabel}
                </h3>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="paper-control absolute right-[-4px] top-[-4px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.95rem] text-foreground/46 opacity-100 shadow-[0_10px_18px_-18px_rgba(64,36,20,0.2)] transition-[background-color,border-color,color,transform,opacity,box-shadow] duration-200 hover:text-foreground/82 hover:shadow-[0_12px_22px_-20px_rgba(64,36,20,0.24)] active:scale-95 sm:h-[30px] sm:w-[30px] sm:rounded-[0.9rem] sm:opacity-0 sm:group-hover/card:opacity-100 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:opacity-90" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="w-56 rounded-2xl p-1.5"
                  >
                    <div className="paper-field space-y-1.5 rounded-xl px-3 py-2.5 text-[12px] leading-5 text-foreground/72">
                      <div className="grid grid-cols-[auto_3rem_1fr] items-center gap-2">
                        <span className="flex items-center">
                          <FileText className="h-3.5 w-3.5 text-foreground/52" />
                        </span>
                        <span className="whitespace-nowrap">格式</span>
                        <span className="min-w-0 whitespace-nowrap text-right font-medium text-foreground/88">
                          {formatLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-[auto_3rem_1fr] items-center gap-2">
                        <span className="flex items-center">
                          <HardDrive className="h-3.5 w-3.5 text-foreground/52" />
                        </span>
                        <span className="whitespace-nowrap">大小</span>
                        <span className="min-w-0 whitespace-nowrap text-right font-medium text-foreground/88">
                          {sizeLabel || '未知'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[auto_3rem_1fr] items-center gap-2">
                        <span className="flex items-center">
                          <CalendarClock className="h-3.5 w-3.5 text-foreground/52" />
                        </span>
                        <span className="whitespace-nowrap">上传</span>
                        <span className="min-w-0 whitespace-nowrap text-right font-medium tabular-nums text-foreground/88">
                          {uploadedAtLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-[auto_3rem_1fr] items-center gap-2">
                        <span className="flex items-center">
                          <Clock className="h-3.5 w-3.5 text-foreground/52" />
                        </span>
                        <span className="whitespace-nowrap">阅读</span>
                        <span className="min-w-0 whitespace-nowrap text-right font-medium tabular-nums text-foreground/88">
                          {lastReadLabel}
                        </span>
                      </div>
                    </div>
                    <DropdownMenuSeparator className="my-1.5 bg-border/70" />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoryDialogOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium text-foreground/88 transition-colors hover:bg-muted/75 focus:bg-muted/75 cursor-pointer"
                    >
                      <Tag className="h-3.5 w-3.5 text-foreground/62" />
                      <span>设置分类</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1.5 bg-border/70" />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={isDeleting}
                      variant="destructive"
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isDeleting ? '删除中' : '删除图书'}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-1.5 text-[12px] leading-5 text-foreground/70 sm:text-[12.5px]">
                <div className="paper-chip flex min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-foreground/70">
                  <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  <span className="line-clamp-1 font-medium tracking-normal">{authorLabel}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRead();
                  }}
                  className="h-8 shrink-0 gap-1 rounded-lg border border-primary/15 bg-primary px-3 text-[11.5px] font-semibold tracking-[0.03em] text-primary-foreground transition-[transform,background-color,border-color] duration-200 hover:border-primary/20 hover:bg-primary/92 active:scale-[0.985] sm:h-7 sm:px-2.5 sm:text-[11px] cursor-pointer"
                >
                  <BookOpen className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  <span>{readButtonLabel}</span>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
      <CategorySelector
        bookId={book.id}
        currentCategoryId={book.category_id}
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
