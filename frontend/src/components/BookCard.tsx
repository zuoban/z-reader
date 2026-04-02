'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { BookOpen, Clock, MoreVertical, Percent, Tag, Trash2, UserRound } from 'lucide-react';
import { api, Book, Category } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CategorySelector } from '@/components/CategorySelector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BookCardProps {
  book: Book;
  index: number;
  categories: Category[];
  onRead: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  isDeleting: boolean;
  formatSize: (bytes: number) => string;
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

export function BookCard({ book, index, categories, onRead, onDelete, onUpdate, isDeleting, formatSize }: BookCardProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const formatLabel = book.format ? book.format.toUpperCase() : 'BOOK';
  const authorLabel = book.author?.trim() || '未知作者';
  const sizeLabel = book.size ? formatSize(book.size) : '';
  const titleLabel = book.title?.trim() || '未命名';

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
      className="opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
      style={{ animationDelay }}
    >
      <Card
        className="group/card relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[20px] border border-black/10 bg-white/92 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.3)] transition-all duration-300 hover:-translate-y-1.5 hover:border-black/15 hover:shadow-[0_20px_40px_-28px_rgba(15,23,42,0.38)]"
        onClick={onRead}
      >
        <div className="relative aspect-[0.78] overflow-hidden bg-gradient-to-br from-stone-100 via-white to-stone-200">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={book.title}
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 20vw, 16vw"
              className="object-cover transition-transform duration-500 group-hover/card:scale-[1.02]"
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
          <span className="pointer-events-none absolute right-1 top-1 z-20 rounded-[5px] border border-black/10 bg-white/55 px-1.5 py-[1px] text-[6px] font-mono font-semibold uppercase tracking-[0.14em] text-foreground/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.12)] backdrop-blur-[1px] ring-1 ring-black/5">
            {formatLabel}
          </span>
          {sizeLabel && (
            <span className="pointer-events-none absolute right-1 bottom-1 z-20 rounded-[5px] border border-black/10 bg-white/55 px-1.5 py-[1px] text-[6px] font-mono font-semibold uppercase tracking-[0.14em] text-foreground/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.12)] backdrop-blur-[1px] ring-1 ring-black/5">
              {sizeLabel}
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              className="absolute right-1.5 top-10 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-white/92 text-foreground opacity-100 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.38)] transition-colors hover:bg-white sm:opacity-0 sm:group-hover/card:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-xl border-border/70 bg-popover shadow-sm"
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRead();
                }}
                className="gap-2 rounded-lg transition-colors"
              >
                <BookOpen className="h-4 w-4" />
                <span>阅读</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setCategoryDialogOpen(true);
                }}
                className="gap-2 rounded-lg transition-colors"
              >
                <Tag className="h-4 w-4" />
                <span>设置分类</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={isDeleting}
                className="gap-2 rounded-lg text-destructive transition-colors focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? '删除中' : '删除'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="border-t border-black/5 bg-gradient-to-b from-white to-stone-50/70 px-3 py-2.5">
          <h3 className="mb-2 text-sm font-semibold leading-[1.25rem] text-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '2.5rem' }} title={titleLabel}>
            {titleLabel}
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 items-center gap-1.5 text-[9px] leading-[1rem] text-foreground/82">
              <UserRound className="h-3 w-3 shrink-0 text-muted-foreground/70" />
              <span className="line-clamp-1 font-medium tracking-[0.01em]">{authorLabel}</span>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[9px] leading-[1rem] text-foreground/82">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground/70" />
              {book.last_read_at ? (
                <span className="font-medium tracking-[0.01em]">{formatRelativeTime(book.last_read_at)}</span>
              ) : (
                <span className="font-medium tracking-[0.01em]">未开始</span>
              )}
            </div>
            {progress !== null && (
              <span className="text-[9px] font-semibold tracking-[0.02em] text-foreground/82">
                {progress}%
              </span>
            )}
          </div>
        </div>
      </Card>
      <CategorySelector
        bookId={book.id}
        currentCategoryId={book.category_id}
        categories={categories}
        onUpdate={onUpdate}
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
      />
    </div>
  );
}
