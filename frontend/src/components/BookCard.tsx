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
  const [isHovered, setIsHovered] = useState(false);

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
  }, [book.id]);

  const animationDelay = `${index * 0.05}s`;

  return (
    <div
      className="opacity-0 animate-[fadeIn_0.45s_ease-out_forwards]"
      style={{ animationDelay }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Card
        className={`group relative overflow-hidden rounded-[24px] border border-border/55 bg-card/78 cursor-pointer transition-all duration-300 ${
          isHovered
            ? 'book-shadow-hover border-border/80'
            : 'book-shadow'
        }`}
        onClick={onRead}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-white/14 to-transparent sm:h-24" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-2.5 spine-effect opacity-70 sm:w-3" />

        <div className="relative aspect-[0.74] overflow-hidden border-b border-border/45 bg-muted/55 sm:aspect-[0.76]">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={book.title}
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 20vw, 16vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-card via-muted/40 to-card px-6 text-center">
              <BookOpen className="h-9 w-9 text-muted-foreground/35" />
              <p className="mt-4 line-clamp-3 text-sm font-medium leading-6 text-foreground/75">
                {book.title}
              </p>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-18 bg-gradient-to-t from-black/30 via-black/10 to-transparent sm:h-24" />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="absolute right-2.5 top-2.5 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/22 bg-background/86 text-foreground opacity-100 backdrop-blur-md transition-all duration-200 hover:scale-105 hover:bg-background sm:right-3 sm:top-3 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-2xl border-border/60 bg-popover/96 backdrop-blur-xl"
            >
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRead(); }} className="gap-2 rounded-xl">
                <BookOpen className="h-4 w-4" />
                <span>阅读</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                disabled={isDeleting}
                className="gap-2 rounded-xl text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? '删除中' : '删除'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-1.5 p-2.5 sm:space-y-2.5 sm:p-4">
          <div className="space-y-0.5 sm:space-y-1">
            <h3 className="line-clamp-2 text-[12px] font-semibold leading-4.5 tracking-tight text-foreground sm:text-sm sm:leading-6">
              {book.title}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground sm:gap-2 sm:text-xs">
              <UserRound className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
              <span className="truncate">{book.author || '未知作者'}</span>
            </div>
          </div>

          <p className="text-[9px] font-mono tabular-nums text-muted-foreground sm:text-[11px]">
            {formatSize(book.size)}
          </p>
        </div>
      </Card>
    </div>
  );
}
