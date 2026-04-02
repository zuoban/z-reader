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
      className="opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]"
      style={{ animationDelay }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Card
        className={`group relative overflow-hidden rounded-[20px] border border-border/50 bg-card/85 cursor-pointer transition-all duration-500 ${
          isHovered
            ? 'book-shadow-hover border-primary/30 scale-[1.02]'
            : 'book-shadow border-border/50'
        }`}
        onClick={onRead}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-white/20 to-transparent sm:h-28" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 spine-effect opacity-60 sm:w-3.5" />

        <div className="relative aspect-[0.75] overflow-hidden border-b border-border/40 bg-muted/50 sm:aspect-[0.77]">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={book.title}
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 20vw, 16vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-card via-muted/35 to-card px-5 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/40 sm:h-11 sm:w-11" />
              <p className="mt-4 line-clamp-3 text-sm font-medium leading-6 text-foreground/80">
                {book.title}
              </p>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 via-black/12 to-transparent sm:h-24" />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-background/90 text-foreground opacity-0 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-background sm:right-2.5 sm:top-2.5 sm:h-8 sm:w-8 sm:group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-2xl border-border/50 bg-popover/95 backdrop-blur-xl shadow-card-xl"
            >
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRead(); }} className="gap-2 rounded-xl transition-colors">
                <BookOpen className="h-4 w-4" />
                <span>阅读</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                disabled={isDeleting}
                className="gap-2 rounded-xl text-destructive transition-colors focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? '删除中' : '删除'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-1.5 p-3 sm:space-y-2 sm:p-4">
          <div className="space-y-1 sm:space-y-1.5">
            <h3 className="line-clamp-2 text-xs font-semibold leading-4 tracking-tight text-foreground sm:text-sm sm:leading-5">
              {book.title}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:gap-2 sm:text-xs">
              <UserRound className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span className="truncate">{book.author || '未知作者'}</span>
            </div>
          </div>

          <p className="text-[10px] font-mono tabular-nums text-muted-foreground/80 sm:text-[11px]">
            {formatSize(book.size)}
          </p>
        </div>
      </Card>
    </div>
  );
}
