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
    >
      <Card
        className="group relative cursor-pointer overflow-hidden rounded-[22px] border border-border/70 bg-background transition-all duration-300 hover:-translate-y-1 hover:border-foreground/15 hover:shadow-[0_24px_50px_-32px_rgba(15,23,42,0.35)]"
        onClick={onRead}
      >
        <div className="relative aspect-[0.72] overflow-hidden border-b border-border/60 bg-muted/40">
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
            <div className="flex h-full w-full flex-col items-center justify-center bg-muted/40 px-5 text-center">
              <BookOpen className="h-9 w-9 text-muted-foreground/50 sm:h-10 sm:w-10" />
              <p className="mt-3 line-clamp-3 text-sm font-medium leading-6 text-foreground/80">
                {book.title}
              </p>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/10 via-black/0 to-transparent" />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="absolute right-2.5 top-2.5 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground opacity-100 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)] transition-colors hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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

        <div className="space-y-2.5 p-4 sm:px-4 sm:pb-4 sm:pt-[18px]">
          <div className="space-y-1.5">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-[1.35rem] tracking-[-0.01em] text-foreground">
              {book.title}
            </h3>
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{book.author || '未知作者'}</span>
            </div>
          </div>

          <p className="text-[11px] font-mono tabular-nums tracking-[0.02em] text-muted-foreground/75">
            {formatSize(book.size)}
          </p>
        </div>
      </Card>
    </div>
  );
}
