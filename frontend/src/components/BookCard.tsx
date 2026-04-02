'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { BookOpen, MoreVertical, Trash2, UserRound } from 'lucide-react';
import { api, Book } from '@/lib/api';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BookCardProps {
  book: Book;
  index: number;
  onRead: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  formatSize: (bytes: number) => string;
}

export function BookCard({ book, index, onRead, onDelete, isDeleting, formatSize }: BookCardProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const formatLabel = book.format ? book.format.toUpperCase() : 'BOOK';
  const authorLabel = book.author?.trim() || '未知作者';
  const sizeLabel = formatSize(book.size);
  const titleLabel = book.title?.trim() || '未命名';

  useEffect(() => {
    let url: string | null = null;

    api.fetchCover(book.id).then((blob) => {
      if (blob) {
        url = URL.createObjectURL(blob);
        setCoverUrl(url);
      }
    });

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [book.cover_path, book.format, book.id]);

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
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-stone-200 via-white to-stone-100">
              <BookOpen className="h-7 w-7 text-muted-foreground/35" />
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/10" />
          <span className="pointer-events-none absolute right-1 top-1 z-20 rounded-[5px] border border-black/10 bg-white/55 px-1.5 py-[1px] text-[6px] font-mono font-semibold uppercase tracking-[0.14em] text-foreground/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.12)] backdrop-blur-[1px] ring-1 ring-black/5">
            {formatLabel}
          </span>
          <div className="paper-texture pointer-events-none absolute inset-y-0 left-0 z-10 flex w-[28px] flex-col items-center justify-center border-r-[3px] border-l border-black/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,245,244,0.95)_100%)] px-[3px] py-2 shadow-[inset_1px_0_0_rgba(255,255,255,0.7),inset_-1px_0_0_rgba(0,0,0,0.05)] backdrop-blur-[2px]">
            <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden">
              <p
                className="whitespace-nowrap text-[12px] font-bold leading-none tracking-[0.02em] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.42)]"
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                }}
              >
                {titleLabel}
              </p>
            </div>
          </div>

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

        <div className="border-t border-black/5 bg-gradient-to-b from-white to-stone-50/70 px-3 py-2.5 pl-[30px]">
          <h3 className="mb-2 text-sm font-semibold leading-[1.25rem] text-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '2.5rem' }} title={titleLabel}>
            {titleLabel}
          </h3>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 items-center gap-1.5 text-[9px] leading-[1rem] text-foreground/82">
              <UserRound className="h-3 w-3 shrink-0 text-muted-foreground/70" />
              <span className="line-clamp-1 font-medium tracking-[0.01em]">{authorLabel}</span>
            </div>
            <span className="justify-self-end rounded-full bg-muted/55 px-2 py-[1px] text-[8px] font-mono tabular-nums tracking-[0.03em] text-muted-foreground/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              {sizeLabel}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
