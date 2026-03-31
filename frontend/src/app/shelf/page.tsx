'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api, Book } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, BookOpen } from 'lucide-react';
import { BookCard } from '@/components/BookCard';

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
      alert(err instanceof Error ? err.message : '上传失败');
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
      alert(err instanceof Error ? err.message : '删除失败');
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
      <div className="min-h-screen warm-gradient paper-texture flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-foreground/20 rounded-full animate-spin"
               style={{ borderTopColor: 'var(--foreground)' }} />
          <p className="text-sm text-muted-foreground font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen warm-gradient paper-texture">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-10 ink-gradient rounded flex items-center justify-center">
              <span className="text-primary-foreground font-semibold text-sm">Z</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight hidden sm:block">书库</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Input
                type="file"
                accept=".epub"
                onChange={handleUpload}
                disabled={isUploading}
                className="absolute inset-0 opacity-0 cursor-pointer z-20"
                title="上传 EPUB"
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2 pointer-events-none"
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-foreground/20 rounded-full animate-spin"
                         style={{ borderTopColor: 'var(--foreground)' }} />
                    <span className="hidden sm:inline">添加中</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">添加</span>
                  </>
                )}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground hover:text-foreground"
            >
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-16 h-20 rounded border-2 border-border bg-card flex items-center justify-center mb-6 book-shadow">
              <BookOpen className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-lg font-medium text-foreground mb-2">书架空空如也</p>
            <p className="text-sm text-muted-foreground">添加您的第一本书开始阅读</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 sm:gap-6">
            {books.map((book, index) => (
              <BookCard
                key={book.id}
                book={book}
                index={index}
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