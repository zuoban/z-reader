'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
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
const MOBILE_COVER_HEIGHT = 200;
const MOBILE_INFO_HEIGHT = 184;

const DESKTOP_CARD_WIDTH = 218;
const DESKTOP_CARD_SCALE = 0.83;
const DESKTOP_COVER_HEIGHT = 228;
const DESKTOP_INFO_HEIGHT = 162;
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
      <div className="relative h-full w-full bg-white dark:bg-neutral-900">
        <Image
          src={coverUrl}
          alt={titleLabel}
          fill
          unoptimized
          sizes="(max-width: 640px) 40vw, (max-width: 1024px) 18vw, 156px"
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,transparent_32%,rgba(15,23,42,0.25)_100%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,transparent_32%,rgba(0,0,0,0.3)_100%)]" />
      </div>
    );
  }

  // 默认封面 - 白色极简风格
  return (
    <div className="relative flex size-full flex-col bg-muted p-4 text-foreground">
      <h3 className="line-clamp-4 text-[13px] font-semibold leading-[1.45] tracking-normal text-foreground">
        {titleLabel}
      </h3>
      <div className="mt-auto flex items-end">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
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
  const lastReadLabel = book.last_read_at ? formatRelativeTime(book.last_read_at) : '未开始';
  const progressLabel = progressValue !== null ? `${progressValue}%` : '未开始';
  const readButtonLabel = progressValue !== null ? '继续阅读' : '开始阅读';
  const category = useMemo(
    () => categories.find((item) => item.id === book.category_id) ?? null,
    [book.category_id, categories]
  );
  const categoryLabel = category?.name ?? '未分类';
  const cardWidth = isMobile ? MOBILE_CARD_WIDTH : DESKTOP_CARD_WIDTH;
  const cardScale = isMobile ? MOBILE_CARD_SCALE : DESKTOP_CARD_SCALE;
  const cardFrameWidth = Math.round(cardWidth * cardScale);
  const coverHeight = isMobile ? MOBILE_COVER_HEIGHT : DESKTOP_COVER_HEIGHT;
  const infoHeight = isMobile ? MOBILE_INFO_HEIGHT : DESKTOP_INFO_HEIGHT;
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
          setProgress(Math.round(progress.percentage));
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

  const animationDelay = `${Math.min(index * 0.05, 0.2)}s`;

  return (
    <div
      className="flex items-center justify-start opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
      style={{
        animationDelay,
        width: isMobile ? '100%' : cardFrameWidth,
      }}
    >
      <div
        style={{
          transform: `scale(${cardScale})`,
          transformOrigin: 'center',
          width: isMobile ? '100%' : cardWidth,
        }}
      >
        <Card
          style={{
            width: isMobile ? '100%' : cardWidth,
          }}
          className="group/card relative flex cursor-default flex-col overflow-hidden rounded-[22px] border border-black/8 bg-white dark:bg-neutral-900 dark:border-white/10 shadow-[0_24px_44px_-34px_rgba(15,23,42,0.38),0_10px_24px_-20px_rgba(15,23,42,0.22)] transition-[border-color,box-shadow,transform] duration-300 ease-out hover:border-black/15 dark:hover:border-white/20 hover:shadow-[0_28px_52px_-34px_rgba(15,23,42,0.42)] active:scale-[0.985] active:shadow-[0_14px_28px_-22px_rgba(15,23,42,0.28)] motion-reduce:transition-none sm:rounded-[20px] cursor-pointer"
        >
          <div
            className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-stone-50 to-zinc-100 dark:from-neutral-800/60 dark:via-neutral-900/80 dark:to-neutral-950"
            style={{ height: coverHeight }}
          >
            {isMobile && (
              <>
                <div className="pointer-events-none absolute inset-x-3 top-0 h-16 rounded-b-[32px] bg-white/40 dark:bg-white/8 blur-3xl" />
                <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-black/8 to-transparent dark:via-white/5" />
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

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/10" />
          </div>
          <div
            className="flex flex-col justify-between border-t border-black/5 dark:border-white/5 bg-gradient-to-b from-white via-white to-stone-50/55 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950/55 px-3.5 py-3.5 sm:px-4 sm:py-3.5"
            style={isMobile ? { minHeight: infoHeight } : { height: infoHeight }}
          >
            <div className="space-y-2.5 sm:space-y-2.5">
              <div className="relative pr-6 sm:pr-5">
                <h3
                  className="min-h-[3rem] min-w-0 text-[15px] font-semibold leading-[1.45] tracking-normal text-foreground sm:min-h-[2.7rem] sm:text-[14.5px]"
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  title={titleLabel}
                >
                  {titleLabel}
                </h3>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="absolute right-[-6px] top-[-5px] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-foreground/48 transition-[background-color,border-color,color,transform,opacity,box-shadow] duration-200 hover:text-foreground/72 active:scale-95 sm:right-[-4px] sm:top-[-4px] sm:h-6.5 sm:w-6.5 sm:rounded-lg sm:bg-transparent sm:text-foreground/34 opacity-60 hover:opacity-100 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:opacity-90" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="w-48 rounded-2xl border border-black/8 bg-white/96 dark:bg-popover/95 dark:border-white/10 p-1.5 shadow-[0_24px_40px_-24px_rgba(15,23,42,0.28),0_12px_24px_-18px_rgba(15,23,42,0.16)] backdrop-blur-xl"
                  >
                    <div className="space-y-1 rounded-xl px-3 py-2.5 text-[12px] text-foreground/72">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-foreground/52" />
                          格式
                        </span>
                        <span className="font-medium text-foreground/88">{formatLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <HardDrive className="h-3.5 w-3.5 text-foreground/52" />
                          大小
                        </span>
                        <span className="font-medium text-foreground/88">
                          {sizeLabel || '未知'}
                        </span>
                      </div>
                    </div>
                    <DropdownMenuSeparator className="my-1.5 bg-black/6" />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoryDialogOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium text-foreground/88 transition-colors hover:bg-stone-100 focus:bg-stone-100 cursor-pointer"
                    >
                      <Tag className="h-3.5 w-3.5 text-foreground/62" />
                      <span>设置分类</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1.5 bg-black/6" />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={isDeleting}
                      variant="destructive"
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium text-destructive transition-colors hover:bg-destructive/7 focus:bg-destructive/7 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isDeleting ? '删除中' : '删除图书'}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="space-y-1.5 text-[12.5px] leading-5 text-foreground/76 sm:text-[13px]">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <UserRound className="h-[15px] w-[15px] shrink-0 text-muted-foreground/65" />
                    <span className="line-clamp-1 font-medium tracking-normal">{authorLabel}</span>
                  </div>
                  <span className="inline-flex max-w-[5.2rem] shrink-0 items-center gap-1 px-1 py-0.5 text-[11px] font-medium leading-5 tracking-normal text-muted-foreground sm:max-w-[5.6rem]">
                    <Tag className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                    <span className="truncate">{categoryLabel}</span>
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2 text-[11.5px] leading-5 text-muted-foreground/82 sm:text-[12px]">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <BookOpen className="h-[13px] w-[13px] shrink-0 text-muted-foreground/65" />
                    <span className="font-medium tracking-normal tabular-nums">{progressLabel}</span>
                  </span>
                  <span className="inline-flex min-w-0 shrink-0 items-center gap-1">
                    <Clock className="h-[13px] w-[13px] shrink-0 text-muted-foreground/65" />
                    <span className="max-w-[4.6rem] truncate font-medium tracking-normal tabular-nums sm:max-w-none">
                      {lastReadLabel}
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 border-t border-black/5 pt-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:pt-3">
              <Button
                type="button"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRead();
                }}
                className="h-10 w-full shrink-0 rounded-[10px] border border-black/7 bg-muted/42 px-4 text-[12px] font-semibold tracking-normal text-foreground/78 shadow-none transition-[transform,background-color,border-color,color] duration-200 hover:border-black/12 hover:bg-muted/62 hover:text-foreground active:scale-[0.98] dark:border-white/8 dark:bg-muted/28 dark:hover:bg-muted/40 sm:h-9 sm:w-full sm:rounded-[10px] sm:px-4 sm:text-[12px] sm:hover:translate-y-[-1px] sm:active:translate-y-0 cursor-pointer"
              >
                <BookOpen className="mr-1.5 h-4 w-4 text-foreground/58 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
                {readButtonLabel}
              </Button>
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
