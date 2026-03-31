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
          <div className="w-12 h-12 border-2 border-foreground/20 rounded-full animate-subtle-float" 
               style={{ borderRightColor: 'oklch(0.35 0.08 30)' }} />
          <p className="font-heading text-lg text-muted-foreground">正在加载您的书库...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen warm-gradient paper-texture relative">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-6 h-9 sm:w-8 sm:h-12 ink-gradient rounded-sm spine-effect flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-heading text-[10px] sm:text-xs italic">Z</span>
            </div>
            <h1 className="font-heading text-lg sm:text-2xl tracking-tight truncate hidden sm:block">我的书库</h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="relative">
              <Input
                type="file"
                accept=".epub"
                onChange={handleUpload}
                disabled={isUploading}
                className="absolute inset-0 opacity-0 cursor-pointer z-20 w-full h-full"
                title="上传 EPUB 文件到您的收藏"
              />
              <Button 
                variant="outline" 
                className="gap-1.5 sm:gap-2 bg-card/80 border-border/60 hover:bg-accent/10 hover:border-accent/40 transition-all pointer-events-none h-9 sm:h-10 px-2 sm:px-4"
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-foreground/30 rounded-full animate-subtle-float" 
                          style={{ borderRightColor: 'oklch(0.35 0.08 30)' }} />
                    <span className="font-heading text-xs sm:text-sm hidden sm:inline">添加中...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="font-heading text-xs sm:text-sm hidden sm:inline">添加书籍</span>
                  </>
                )}
              </Button>
            </div>
            
            <Button 
              variant="ghost" 
              onClick={logout}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors h-9 sm:h-10 px-2 sm:px-3"
            >
              <span className="font-sans text-xs sm:text-sm">退出</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-6 py-4 sm:py-8">
        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24">
            <div className="w-16 h-22 sm:w-20 sm:h-28 rounded-sm border-2 border-border/40 bg-card flex items-center justify-center mb-4 sm:mb-6 book-shadow">
              <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground/50" />
            </div>
            <p className="font-heading text-lg sm:text-xl text-muted-foreground mb-2">您的书架正在等待</p>
            <p className="font-sans text-xs sm:text-sm text-muted-foreground/70 text-center px-4">
              添加您的第一本书，开始阅读之旅
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 lg:gap-6">
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

      <footer className="fixed bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/40 to-transparent pointer-events-none" />
    </div>
  );
}