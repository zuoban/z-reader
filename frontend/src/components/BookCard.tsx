'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock, GripVertical, MoreVertical, Tag, Trash2, UserRound } from 'lucide-react';
import { api, Book, Category } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CategorySelector } from '@/components/CategorySelector';
import { Button } from '@/components/ui/button';

// three.js 组件按需加载，避免阻塞首屏
const PerspectiveBook = dynamic(
  () => import('@/registry/spell-ui/perspective-book').then((m) => ({ default: m.PerspectiveBook })),
  { ssr: false }
);
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';

interface BookCardProps {
  book: Book;
  index: number;
  categories: Category[];
  onRead: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  isDeleting: boolean;
  isDragging?: boolean;
  onDragStart?: (payload: {
    bookId: string;
    anchorX: number;
    anchorY: number;
    pointerX: number;
    pointerY: number;
  }) => void;
  onDragMove?: (payload: { pointerX: number; pointerY: number }) => void;
  onDragEnd?: () => void;
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
  authorLabel: string;
  coverUrl: string | null;
  formatLabel: string;
  titleLabel: string;
}

function BookCoverFace({
  authorLabel,
  coverUrl,
  formatLabel,
  titleLabel,
}: BookCoverFaceProps) {
  if (coverUrl) {
    return (
      <div className="relative h-full w-full bg-[#f3ece3]">
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

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[linear-gradient(160deg,#fffdf7_0%,#f4ecde_54%,#eadfcb_100%)] px-4 py-4 text-slate-800">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(214,190,154,0.4),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(92,117,146,0.16),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-4 top-4 h-px bg-[linear-gradient(90deg,transparent,rgba(71,85,105,0.28),transparent)]" />
      <div className="pointer-events-none absolute inset-x-4 bottom-4 h-px bg-[linear-gradient(90deg,transparent,rgba(71,85,105,0.2),transparent)]" />
      <div className="pointer-events-none absolute right-3 top-3 h-16 w-16 rounded-full bg-white/30 blur-2xl" />
      <div className="relative z-10 flex h-full flex-col">
        <div className="inline-flex w-fit rounded-full border border-slate-700/10 bg-white/75 px-2.5 py-1 text-[9px] font-semibold tracking-[0.22em] text-slate-600 backdrop-blur-sm">
          {formatLabel}
        </div>
        <div className="mt-5 flex-1">
          <div className="mb-3 h-1 w-10 rounded-full bg-slate-700/70" />
          <h3 className="line-clamp-4 text-[15px] font-semibold leading-[1.25] tracking-[-0.02em] text-slate-900">
            {titleLabel}
          </h3>
        </div>
        <div className="space-y-2">
          <div className="h-px w-full bg-slate-900/10" />
          <p className="line-clamp-2 text-[11px] font-medium tracking-[0.08em] text-slate-600 uppercase">
            {authorLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

export function BookCard({
  book,
  index,
  categories,
  onRead,
  onDelete,
  onUpdate,
  isDeleting,
  isDragging = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  formatSize,
}: BookCardProps) {
  const isMobile = useIsMobile();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const dragHandleRef = useRef<HTMLButtonElement>(null);
  const dragPointerIdRef = useRef<number | null>(null);
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

  function handleDragStart(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || !dragHandleRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    dragPointerIdRef.current = e.pointerId;
    dragHandleRef.current.setPointerCapture(e.pointerId);

    const rect = dragHandleRef.current.getBoundingClientRect();
    onDragStart?.({
      bookId: book.id,
      anchorX: rect.left + rect.width / 2,
      anchorY: rect.top + rect.height / 2,
      pointerX: e.clientX,
      pointerY: e.clientY,
    });
  }

  function handleDragEnd() {
    onDragEnd?.();
  }

  const animationDelay = `${index * 0.05}s`;
  const dragScale = isDragging ? 0.94 : 1;
  const dragOpacity = isDragging ? 0.52 : 1;
  const dragSaturation = isDragging ? 0.88 : 1;
  const dragBrightness = isDragging ? 0.99 : 1;
  const dragRotateZ = isDragging ? -1.2 : 0;
  const dragShadow = isDragging
    ? '0 10px 22px -20px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.45) inset'
    : cardShadow;

  useEffect(() => {
    if (!isDragging) return;

    function handleGlobalPointerMove(event: PointerEvent) {
      onDragMove?.({ pointerX: event.clientX, pointerY: event.clientY });
    }

    function handleGlobalPointerUp() {
      if (dragPointerIdRef.current === null) return;
      dragPointerIdRef.current = null;
      onDragEnd?.();
    }

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isDragging, onDragEnd, onDragMove]);

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
          data-dragging={isDragging ? 'true' : undefined}
          style={{
            transform: `scale(${dragScale}) rotateZ(${dragRotateZ}deg)`,
            willChange: 'transform',
            boxShadow: dragShadow,
            opacity: dragOpacity,
            filter: `saturate(${dragSaturation}) brightness(${dragBrightness})`,
            width: cardWidth,
          }}
          className="group/card relative flex cursor-default flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white/92 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.3)] transition-[border-color,box-shadow,transform] duration-300 ease-out hover:border-black/20 hover:shadow-[0_20px_40px_-28px_rgba(15,23,42,0.38)] active:scale-[0.98] active:shadow-[0_8px_20px_-18px_rgba(15,23,42,0.32)] motion-reduce:transition-none sm:rounded-[20px] cursor-pointer"
        >
          <div
            className="relative overflow-hidden bg-[radial-gradient(circle_at_top,#faf5eb_0%,#ede4d4_46%,#ddd0bd_100%)]"
            style={{ height: coverHeight }}
          >
            <div className="pointer-events-none absolute inset-0 paper-texture opacity-45" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0)_36%,rgba(15,23,42,0.08)_100%)]" />
            <div className="pointer-events-none absolute right-2.5 bottom-2.5 z-30 inline-flex max-w-[calc(100%-1.25rem)] items-center justify-end overflow-hidden rounded-full border border-black/10 bg-black/82 px-2.5 py-1 text-right text-[10px] font-medium leading-none tracking-[0.01em] text-white/95 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.5)] backdrop-blur-sm sm:right-3 sm:bottom-3 sm:max-w-[calc(100%-1.5rem)] sm:px-2.5 sm:text-[11px]">
              {infoItems.map((item, index) => (
                <span key={`${item}-${index}`} className="inline-flex items-center whitespace-nowrap">
                  {index > 0 && <span className="mx-1 text-white/55">/</span>}
                  {item}
                </span>
              ))}
            </div>
            <div className={`pointer-events-none absolute inset-0 z-[15] rounded-none border border-dashed border-foreground/10 transition-opacity duration-200 ${isDragging ? 'opacity-100' : 'opacity-0'}`} />
            <div className="relative z-10 flex h-full items-center justify-center px-5 py-4 sm:px-6">
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
                        authorLabel={authorLabel}
                        coverUrl={coverUrl}
                        formatLabel={formatLabel}
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
                ref={dragHandleRef}
                type="button"
                onPointerDown={handleDragStart}
                onPointerUp={(e) => {
                  e.stopPropagation();

                  if (
                    dragPointerIdRef.current !== null &&
                    dragHandleRef.current?.hasPointerCapture(dragPointerIdRef.current)
                  ) {
                    dragHandleRef.current.releasePointerCapture(dragPointerIdRef.current);
                  }

                  if (dragPointerIdRef.current !== null) {
                    dragPointerIdRef.current = null;
                    onDragEnd?.();
                  }
                }}
                onPointerCancel={handleDragEnd}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className={`group/drag-handle absolute left-2 top-2 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_10px_22px_-16px_rgba(15,23,42,0.55)] backdrop-blur-md transition-[background-color,transform] duration-200 ease-out hover:bg-black/70 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:left-3 sm:top-3 sm:h-11 sm:w-11 sm:hover:scale-105 cursor-grab active:cursor-grabbing ${
                  isDragging
                    ? 'opacity-100 scale-100'
                    : 'opacity-100 scale-100 sm:opacity-0 sm:scale-[0.98] sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100'
                }`}
                aria-label="拖动分类"
                title="拖动分类"
              >
                <GripVertical className="h-4.5 w-4.5 sm:h-4 sm:w-4" />
              </TooltipTrigger>
              <TooltipContent side="top" align="center">
                按住并滑向分类，松手完成归类
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="absolute right-2 top-2 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_10px_22px_-16px_rgba(15,23,42,0.55)] backdrop-blur-md transition-[background-color,transform] duration-200 hover:bg-black/70 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:right-3 sm:top-3 sm:h-11 sm:w-11 sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
                aria-label="更多操作"
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                alignOffset={-4}
                className="w-44 rounded-[18px] border border-border/70 bg-popover/96 p-1.5 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl"
              >
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategoryDialogOpen(true);
                  }}
                  className="gap-2.5 rounded-[14px] px-2.5 py-2 transition-colors"
                >
                  <Tag className="h-4 w-4 text-foreground/80" />
                  <span>设置分类</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmOpen(true);
                  }}
                  disabled={isDeleting}
                  className="gap-2.5 rounded-[14px] px-2.5 py-2 text-destructive transition-colors focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{isDeleting ? '删除中' : '删除'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div
            className="flex flex-col justify-between border-t border-black/5 bg-gradient-to-b from-white via-white to-stone-50/70 px-3 py-3 sm:px-4 sm:py-3.5"
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
