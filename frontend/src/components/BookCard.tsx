'use client';

import { useEffect, useState } from 'react';
import { api, Book } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { BookOpen, Trash2, MoreVertical } from 'lucide-react';

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

  const animationDelay = `${index * 0.08}s`;

  return (
    <div
      className="opacity-0 animate-[fadeIn_0.4s_ease-out_forwards]"
      style={{ animationDelay }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Card
        className={`group relative bg-card border-border/50 overflow-hidden cursor-pointer transition-all duration-200 ${isHovered ? 'book-shadow-hover' : 'book-shadow'}`}
        onClick={onRead}
      >
        <div className="aspect-[2/3] relative overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              className="absolute top-2 right-2 z-20 h-7 w-7 flex items-center justify-center rounded-full bg-background/90 backdrop-blur-sm border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRead(); }} className="gap-2">
                <BookOpen className="w-4 h-4" />
                <span>阅读</span>
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                disabled={isDeleting}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? '删除中' : '删除'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CardHeader className="p-3 space-y-1">
          <CardTitle className="text-sm font-medium line-clamp-2 leading-snug">
            {book.title}
          </CardTitle>
          <CardDescription className="text-xs line-clamp-1">
            {book.author || '未知作者'}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}