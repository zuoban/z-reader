'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock, Tag, Trash2, UserRound } from 'lucide-react';
import { api, Book, Category } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CategorySelector } from '@/components/CategorySelector';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';

// three.js 组件按需加载，避免阻塞首屏
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

const MOBILE_CARD_WIDTH = 160;
const MOBILE_CARD_SCALE = 1;
const MOBILE_COVER_HEIGHT = 192;
const MOBILE_INFO_HEIGHT = 168;

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
      <div className="relative h-full w-full bg-white">
        <Image
          src={coverUrl}
          alt={titleLabel}
          fill
          unoptimized
          sizes="(max-width: 640px) 40vw, (max-width: 1024px) 18vw, 156px"
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,transparent_32%,rgba(15,23,42,0.16)_100%)]" />
      </div>
    );
  }

  // 默认封面 - 白色极简风格
  return (
    <div className="relative flex size-full flex-col bg-zinc-50 p-4 text-slate-800">
      <h3 className="line-clamp-4 text-[13px] font-semibold leading-[1.35] tracking-[-0.01em] text-slate-900">
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
          className="text-slate-400"
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
  const category = useMemo(
    () => categories.find((item) => item.id === book.category_id) ?? null,
    [book.category_id, categories]
  );
  const infoItems = [
    category?.name,
    formatLabel,
    sizeLabel,
    progress !== null ? `${progress}%` : null,
  ].filter(Boolean) as string[];
  const cardWidth = isMobile ? MOBILE_CARD_WIDTH : DESKTOP_CARD_WIDTH;
  const cardScale = isMobile ? MOBILE_CARD_SCALE : DESKTOP_CARD_SCALE;
  const cardFrameWidth = Math.round(cardWidth * cardScale);
  const coverHeight = isMobile ? MOBILE_COVER_HEIGHT : DESKTOP_COVER_HEIGHT;
  const infoHeight = isMobile ? MOBILE_INFO_HEIGHT : DESKTOP_INFO_HEIGHT;
  const bookScale = isMobile ? 0.86 : 1;
  const bookPreviewWidth = Math.round(SPELL_BOOK_WIDTH * bookScale);
  const bookPreviewHeight = Math.round(SPELL_BOOK_HEIGHT * bookScale);
  const cardShadow =
    '0 14px 30px -24px rgba(15, 23, 42, 0.34), 0 10px 18px -22px rgba(15, 23, 42, 0.18)';

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

  const animationDelay = `${index * 0.05}s`;

  return (
    <div
      className="flex items-center justify-start opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
      style={{
        animationDelay,
        width: cardFrameWidth,
      }}
    >
      <div style={{ transform: `scale(${cardScale})`, transformOrigin: 'center' }}>
        <Card
          style={{
            width: cardWidth,
          }}
          className="group/card relative flex cursor-default flex-col overflow-hidden rounded-[18px] border border-black/10 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.3)] transition-[border-color,box-shadow,transform] duration-300 ease-out hover:border-black/20 hover:shadow-[0_20px_40px_-28px_rgba(15,23,42,0.38)] active:scale-[0.98] active:shadow-[0_8px_20px_-18px_rgba(15,23,42,0.32)] motion-reduce:transition-none sm:rounded-[20px] cursor-pointer"
        >
          <div
            className="relative overflow-hidden"
            style={{ height: coverHeight }}
          >
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

            <Tooltip>
              <TooltipTrigger
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCategoryDialogOpen(true);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute left-2 top-2 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_10px_22px_-16px_rgba(15,23,42,0.55)] backdrop-blur-md transition-[background-color,transform] duration-200 ease-out hover:bg-black/70 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:left-3 sm:top-3 sm:h-11 sm:w-11 sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100 cursor-pointer"
                aria-label="设置分类"
                title="设置分类"
              >
                <Tag className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top" align="center">
                点击设置分类
              </TooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isDeleting}
              className="absolute right-2 top-2 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_10px_22px_-16px_rgba(15,23,42,0.55)] backdrop-blur-md transition-[background-color,transform] duration-200 hover:bg-black/70 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:right-3 sm:top-3 sm:h-11 sm:w-11 sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100 cursor-pointer disabled:pointer-events-none disabled:opacity-40"
              aria-label="删除图书"
              title="删除图书"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div
            className="flex flex-col justify-between border-t border-black/5 bg-white px-3 py-3 sm:px-4 sm:py-3.5"
            style={{ height: infoHeight }}
          >
            <div className="space-y-2 sm:space-y-2.5">
              <h3
                className="min-h-[2.8rem] text-[15px] font-semibold leading-[1.35rem] tracking-[-0.01em] text-foreground sm:min-h-[2.6rem] sm:text-[14px] sm:leading-[1.3rem]"
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                title={titleLabel}
              >
                {titleLabel}
              </h3>
              {infoItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-[10px] font-medium leading-none tracking-[0.01em] text-foreground/70 sm:text-[11px]">
                  {infoItems.map((item, index) => (
                    <span key={`${item}-${index}`} className="inline-flex items-center whitespace-nowrap">
                      {index > 0 && <span className="mx-0.5 text-foreground/40">/</span>}
                      {item}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex min-w-0 items-center gap-1.5 text-[12px] leading-[1.15rem] text-foreground/78 sm:text-[13px] sm:leading-[1.2rem]">
                <UserRound className="h-[15px] w-[15px] shrink-0 text-muted-foreground/65" />
                <span className="line-clamp-1 font-medium tracking-[0.01em]">{authorLabel}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 border-t border-black/5 pt-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:pt-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                  最近阅读
                </div>
                <div className="flex items-center gap-1.5 text-[12px] leading-[1.15rem] text-foreground/82 sm:text-[13px] sm:leading-[1.2rem]">
                  <Clock className="h-[15px] w-[15px] shrink-0 text-muted-foreground/65" />
                  {book.last_read_at ? (
                    <span className="line-clamp-1 font-medium tracking-[0.01em]">
                      {formatRelativeTime(book.last_read_at)}
                    </span>
                  ) : (
                    <span className="line-clamp-1 font-medium tracking-[0.01em]">未开始</span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRead();
                }}
                className="h-11 w-full shrink-0 rounded-full bg-foreground px-4 text-[13px] font-medium text-background shadow-[0_10px_22px_-18px_rgba(15,23,42,0.65)] transition-[transform,shadow] duration-200 hover:scale-[1.02] hover:shadow-[0_14px_28px_-20px_rgba(15,23,42,0.7)] active:scale-[0.96] sm:h-8 sm:w-auto sm:px-3.5 sm:text-[12px] cursor-pointer"
              >
                <BookOpen className="mr-1.5 h-4 w-4 sm:h-3.5 sm:w-3.5" />
                阅读
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
