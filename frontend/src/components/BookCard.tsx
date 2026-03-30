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
      className="animate-book-appear" 
      style={{ animationDelay, animationFillMode: 'backwards' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Card 
        className={`group relative bg-card/95 border-border/30 overflow-visible cursor-pointer transition-all duration-300 ${isHovered ? 'book-shadow-hover' : 'book-shadow'}`}
        onClick={onRead}
      >
        <div className="aspect-[3/4] relative overflow-hidden rounded-t-lg">
          <div className="absolute inset-0 spine-effect z-10" />
          
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={book.title}
              className={`w-full h-full object-cover transition-transform duration-500 ${isHovered ? 'scale-[1.02]' : 'scale-100'}`}
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-muted-foreground/40" />
            </div>
          )}
          
          <div className="absolute inset-x-0 bottom-0 h-1 page-edge opacity-60" />
          
          <DropdownMenu>
            <DropdownMenuTrigger 
              className="absolute top-2 right-2 z-20 h-6 w-6 flex items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border/40 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-3 h-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card/95 border-border/40 backdrop-blur-sm">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRead(); }} className="gap-2">
                <BookOpen className="w-4 h-4" />
                <span className="font-sans text-sm">Read</span>
              </DropdownMenuItem>
              <Separator className="my-1 bg-border/40" />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                disabled={isDeleting}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                <span className="font-sans text-sm">{isDeleting ? 'Removing...' : 'Remove'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <CardHeader className="p-3 pb-0">
          <CardTitle className="font-heading text-sm line-clamp-2 leading-tight tracking-tight">
            {book.title}
          </CardTitle>
          <CardDescription className="font-sans text-xs line-clamp-1 text-muted-foreground/80 mt-1">
            {book.author || 'Unknown Author'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-3 pt-1">
          <p className="font-mono text-xs text-muted-foreground/60 tabular-nums">
            {formatSize(book.size)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}