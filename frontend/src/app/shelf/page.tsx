'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api, Book } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function ShelfPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, logout } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadBooks();
    }
  }, [isAuthenticated]);

  async function loadBooks() {
    try {
      const data = await api.listBooks();
      setBooks(data || []);
    } catch {
      setBooks([]);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const book = await api.uploadBook(file);
      setBooks((prev) => [...prev, book]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    }
    setIsUploading(false);
    e.target.value = '';
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
    setDeletingId(null);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Z Reader</h1>
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger className="relative inline-block cursor-pointer">
                <Input
                  type="file"
                  accept=".epub"
                  onChange={handleUpload}
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <span className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50">
                  {isUploading ? 'Uploading...' : 'Upload EPUB'}
                </span>
              </TooltipTrigger>
              <TooltipContent>Upload an EPUB file to your bookshelf</TooltipContent>
            </Tooltip>
            <Button variant="ghost" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {books.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400 mb-4">No books in your shelf</p>
            <p className="text-slate-500 text-sm">Upload an EPUB file to start reading</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onRead={() => router.push(`/read/${book.id}`)}
                onDelete={() => handleDelete(book.id)}
                isDeleting={deletingId === book.id}
                formatSize={formatSize}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function BookCard({
  book,
  onRead,
  onDelete,
  isDeleting,
  formatSize,
}: {
  book: Book;
  onRead: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  formatSize: (bytes: number) => string;
}) {
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

  return (
    <Card className="group relative overflow-hidden bg-slate-800 border-slate-700">
      <div
        className="aspect-[3/4] bg-slate-700 cursor-pointer flex items-center justify-center"
        onClick={onRead}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-4xl text-slate-500">📖</span>
        )}
      </div>
      <CardHeader className="p-3">
        <CardTitle className="text-sm line-clamp-2">{book.title}</CardTitle>
        <CardDescription className="text-xs line-clamp-1">
          {book.author || 'Unknown Author'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{formatSize(book.size)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger className="h-6 px-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded cursor-pointer">
              •••
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRead}>
                Read
              </DropdownMenuItem>
              <Separator className="my-1" />
              <DropdownMenuItem
                onClick={onDelete}
                disabled={isDeleting}
                className="text-red-500 focus:text-red-500"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}