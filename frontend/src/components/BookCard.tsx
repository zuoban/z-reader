'use client';

import Image from 'next/image';
import { useEffect, useState, useRef, useMemo } from 'react';
import { BookOpen, Clock, GripVertical, MoreVertical, Tag, Trash2, UserRound } from 'lucide-react';
import { api, Book, Category } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CategorySelector } from '@/components/CategorySelector';
import { Button } from '@/components/ui/button';
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

function lerp(start: number, end: number, factor: number) {
  return start + (end - start) * factor;
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
  const [isHovering, setIsHovering] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const targetTilt = useRef({ x: 0, y: 0 });
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

  // 使用 useMemo 缓存阴影计算，避免每次渲染时重复计算
  const { tiltMagnitude, cardShadow } = useMemo(() => {
    const tiltMagnitude = Math.hypot(tilt.x, tilt.y);
    const shadowX = Math.round(tilt.y * 1.3);
    const shadowY = Math.round(14 + tiltMagnitude * 1.2);
    const shadowBlur = Math.round(30 + tiltMagnitude * 1.8);
    const shadowOpacity = 0.16 + Math.min(0.1, tiltMagnitude * 0.01);
    const cardShadow = `0 ${shadowY}px ${shadowBlur}px -24px rgba(15, 23, 42, ${shadowOpacity}), ${-shadowX}px ${Math.max(6, shadowY / 2)}px ${Math.round(
      shadowBlur * 0.55
    )}px -34px rgba(0, 0, 0, 0.14)`;
    return { tiltMagnitude, cardShadow };
  }, [tilt]);

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

  function animate() {
    const current = tiltRef.current;
    const newX = lerp(current.x, targetTilt.current.x, 0.12);
    const newY = lerp(current.y, targetTilt.current.y, 0.12);

    tiltRef.current = { x: newX, y: newY };
    setTilt(tiltRef.current);

    // 当接近目标时停止动画，避免在边缘产生细碎抖动
    if (Math.abs(newX - targetTilt.current.x) < 0.1 && Math.abs(newY - targetTilt.current.y) < 0.1) {
      tiltRef.current = { x: targetTilt.current.x, y: targetTilt.current.y };
      setTilt(tiltRef.current);
      rafRef.current = null;
      return;
    }

    rafRef.current = requestAnimationFrame(animate);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!cardRef.current || e.pointerType !== 'mouse') return;

    const rect = cardRef.current.getBoundingClientRect();
    // 将坐标归一化到 -1 到 1 范围，中心为 0
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));

    // 轻微缓动，避免鼠标慢速贴边时出现“卡边抖动”
    const smoothX = nx * (1 - Math.abs(nx) * 0.08);
    const smoothY = ny * (1 - Math.abs(ny) * 0.08);

    // 轻量级倾斜，保留立体感但不夸张
    const maxTilt = 3.8;
    targetTilt.current = {
      x: smoothY * -maxTilt,
      y: smoothX * maxTilt,
    };

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }

  function handlePointerLeave() {
    setIsHovering(false);
    targetTilt.current = { x: 0, y: 0 };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }

  function handlePointerEnter(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    setIsHovering(true);
  }

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

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

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
      <div
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        style={{ transform: `scale(${cardScale})`, transformOrigin: 'center' }}
      >
        <Card
          data-dragging={isDragging ? 'true' : undefined}
          ref={cardRef}
          onPointerMove={handlePointerMove}
          style={{
            transform: `perspective(1200px) translateY(-0.5px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${dragScale}) rotateZ(${dragRotateZ}deg)`,
            transformStyle: 'preserve-3d',
            willChange: 'transform',
            boxShadow: dragShadow,
            opacity: dragOpacity,
            filter: `saturate(${dragSaturation}) brightness(${dragBrightness})`,
            width: cardWidth,
          }}
          className="group/card relative flex cursor-default flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white/92 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.3)] transition-[border-color,box-shadow,transform,opacity,filter] duration-300 ease-out hover:border-black/15 hover:shadow-[0_16px_34px_-26px_rgba(15,23,42,0.34)] motion-reduce:transition-none sm:rounded-[20px]"
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-100 via-white to-stone-200" style={{ height: coverHeight }}>
            <div className="pointer-events-none absolute right-2.5 bottom-2.5 z-30 inline-flex max-w-[calc(100%-1.25rem)] items-center justify-end overflow-hidden rounded-full border border-black/10 bg-black/82 px-2.5 py-1 text-right text-[10px] font-medium leading-none tracking-[0.01em] text-white/95 shadow-[0_8px_18px_-14px_rgba(15,23,42,0.5)] backdrop-blur-sm sm:right-3 sm:bottom-3 sm:max-w-[calc(100%-1.5rem)] sm:px-2.5 sm:text-[11px]">
              {infoItems.map((item, index) => (
                <span key={`${item}-${index}`} className="inline-flex items-center whitespace-nowrap">
                  {index > 0 && <span className="mx-1 text-white/55">/</span>}
                  {item}
                </span>
              ))}
            </div>
            <div className={`pointer-events-none absolute inset-0 z-[15] rounded-none border border-dashed border-foreground/10 transition-opacity duration-200 ${isDragging ? 'opacity-100' : 'opacity-0'}`} />
            {!coverUrl && (
              <>
                <div
                  className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 ease-out"
                  style={{
                    background: isDragging
                      ? 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.02) 100%)'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.06) 35%, rgba(0,0,0,0.025) 100%)',
                    opacity: (0.46 + tiltMagnitude * 0.007) * (isDragging ? 0.8 : 1),
                  }}
                />
                <div
                  className={`${
                    isHovering && !isDragging ? 'motion-safe:animate-[paperSheen_7.5s_ease-in-out_infinite] motion-reduce:animate-none' : ''
                  } pointer-events-none absolute inset-x-0 top-0 z-20 h-full bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.12)_32%,rgba(255,255,255,0.22)_50%,rgba(255,255,255,0.1)_68%,transparent_100%)] mix-blend-screen`}
                />
              </>
            )}
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={book.title}
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 20vw, 16vw"
              className="object-cover"
            />
          ) : (
            <div className="relative flex h-full w-full overflow-hidden shadow-[inset_-1px_0_2px_rgba(0,0,0,0.1)]">
              {/* 书页厚度层 - 右侧边缘 */}
              <div className="absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-stone-300 via-stone-200 to-stone-100 shadow-[-2px_0_4px_rgba(0,0,0,0.08)]" />
              {/* 书页厚度层 - 底部边缘 */}
              <div className="absolute bottom-0 left-8 right-3 h-3 bg-gradient-to-t from-stone-300 via-stone-200 to-stone-100 shadow-[0_-2px_4px_rgba(0,0,0,0.06)]" />
              {/* 书页纹理效果 */}
              <div className="absolute bottom-3 left-8 right-3 h-px bg-stone-300/50" />
              <div className="absolute bottom-5 left-8 right-3 h-px bg-stone-300/40" />
              <div className="absolute bottom-7 left-8 right-3 h-px bg-stone-300/30" />
              {/* 右下角立体阴影 */}
              <div className="absolute bottom-3 right-3 w-16 h-16 bg-gradient-to-tl from-black/15 via-transparent to-transparent" />

              <div className="relative flex w-8 flex-col items-center justify-center border-r-[3px] border-[#002FA7]/30 bg-gradient-to-r from-[#002FA7] via-[#0033B3] to-[#0039C7] shadow-[inset_-3px_0_6px_rgba(0,0,0,0.3),inset_1px_0_1px_rgba(255,255,255,0.15),2px_0_4px_rgba(0,0,0,0.15)]">
                <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-white/25 to-transparent" />
                <div className="absolute inset-y-0 right-1 w-px bg-gradient-to-b from-transparent via-black/25 to-transparent" />
                {/* 书脊高光 */}
                <div className="absolute inset-y-0 left-1 w-0.5 bg-gradient-to-b from-white/10 via-white/30 to-white/10" />
                {/* 书脊纹理线 */}
                <div className="absolute inset-y-4 left-0 right-0 flex flex-col justify-evenly">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-px w-full bg-gradient-to-r from-transparent via-black/10 to-transparent" />
                  ))}
                </div>
                <p className="whitespace-nowrap text-[10px] font-bold tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" style={{ writingMode: 'vertical-rl' }}>
                  {titleLabel.slice(0, 12)}
                </p>
              </div>

              <div className="relative flex flex-1 flex-col items-center justify-center bg-white px-6 py-8 mr-3 mb-3 shadow-[inset_2px_2px_8px_rgba(0,47,167,0.06),inset_-1px_-1px_3px_rgba(0,0,0,0.03)]">
                {/* 封面左上角光照 */}
                <div className="absolute left-0 top-0 h-32 w-32 bg-gradient-to-br from-white/80 via-white/20 to-transparent pointer-events-none" />
                {/* 封面左边缘渐变 */}
                <div className="absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-[#002FA7]/8 via-[#002FA7]/3 to-transparent" />
                {/* 封面底部渐变 */}
                <div className="absolute bottom-0 right-0 h-16 w-full bg-gradient-to-t from-[#002FA7]/6 to-transparent" />
                {/* 封面右上角阴影 */}
                <div className="absolute right-0 top-0 h-20 w-20 bg-gradient-to-bl from-black/5 via-transparent to-transparent" />
                {/* 装饰点 */}
                <div className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[#002FA7]/25 shadow-sm" />
                <div className="absolute bottom-3 left-3 h-1.5 w-1.5 rounded-full bg-[#002FA7]/25 shadow-sm" />

                {/* 顶部装饰边框 */}
                <div className="absolute top-4 left-6 right-6 h-px bg-gradient-to-r from-transparent via-[#002FA7]/20 to-transparent" />
                {/* 底部装饰边框 */}
                <div className="absolute bottom-4 left-6 right-6 h-px bg-gradient-to-r from-transparent via-[#002FA7]/20 to-transparent" />

                <div className="relative z-10 flex flex-col items-center gap-5">
                  {/* 顶部双线条装饰 */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="h-0.5 w-20 rounded-full bg-gradient-to-r from-transparent via-[#002FA7]/80 to-transparent shadow-sm" />
                    <div className="h-0.5 w-14 rounded-full bg-gradient-to-r from-transparent via-[#002FA7]/50 to-transparent" />
                  </div>

                  {/* 书名区域 */}
                  <div className="relative py-2">
                    <div className="absolute -left-2 -right-2 top-1/2 -translate-y-1/2 h-12 bg-gradient-to-r from-transparent via-[#002FA7]/5 to-transparent" />
                    <h3 className="text-center text-sm font-bold leading-tight tracking-wide text-[#002FA7] drop-shadow-sm line-clamp-3">
                      {titleLabel}
                    </h3>
                  </div>

                  {/* 作者 */}
                  {authorLabel && authorLabel !== '未知作者' && (
                    <p className="text-center text-[10px] font-medium tracking-wide text-[#002FA7]/60">
                      {authorLabel}
                    </p>
                  )}

                  {/* 底部双线条装饰 */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="h-0.5 w-14 rounded-full bg-gradient-to-r from-transparent via-[#002FA7]/50 to-transparent" />
                    <div className="h-0.5 w-20 rounded-full bg-gradient-to-r from-transparent via-[#002FA7]/80 to-transparent shadow-sm" />
                  </div>
                </div>
              </div>
            </div>
          )}

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
              className={`group/drag-handle absolute left-2 top-2 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_10px_22px_-16px_rgba(15,23,42,0.55)] backdrop-blur-md transition-all duration-200 ease-out hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:left-3 sm:top-3 sm:h-11 sm:w-11 sm:hover:scale-105 cursor-grab active:cursor-grabbing ${
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
              className="absolute right-2 top-2 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_10px_22px_-16px_rgba(15,23,42,0.55)] backdrop-blur-md transition-all duration-200 hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:right-3 sm:top-3 sm:h-11 sm:w-11 sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100 sm:hover:scale-105 cursor-pointer"
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
                className="h-11 w-full shrink-0 rounded-full bg-[#0f172a] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_-18px_rgba(15,23,42,0.65)] transition-colors duration-200 active:bg-[#1e293b] sm:h-8 sm:w-auto sm:px-3.5 sm:text-[12px] sm:hover:scale-[1.02] sm:hover:bg-[#1e293b]"
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
