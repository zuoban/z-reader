'use client';

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { api, type Bookmark } from '@/lib/api';
import { getAccessGeneration } from '@/lib/library-access';
import { getBookmarkExcerpt } from '@/lib/reader-page';
import type { FoliateView } from '@/lib/types';

interface UseReaderBookmarksOptions {
  bookId: string;
  isAuthenticated: boolean;
  currentCFI: string;
  percentage: number;
  currentChapter: string;
  viewRef: RefObject<FoliateView | null>;
  onBookmarksOpenChange: (open: boolean) => void;
}

interface BookmarkContext {
  bookId: string;
  signal: AbortSignal;
  generation: string | null;
}

function isCurrentBookmarkContext(context: BookmarkContext): boolean {
  return !context.signal.aborted && context.generation === getAccessGeneration();
}

export function useReaderBookmarks({
  bookId,
  isAuthenticated,
  currentCFI,
  percentage,
  currentChapter,
  viewRef,
  onBookmarksOpenChange,
}: UseReaderBookmarksOptions) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const activeBookRef = useRef<BookmarkContext | null>(null);

  const loadBookmarks = useCallback(async (context: BookmarkContext) => {
    if (!isCurrentBookmarkContext(context)) return;
    try {
      const items = await api.listBookmarks(context.bookId, context.signal);
      if (isCurrentBookmarkContext(context)) setBookmarks(items);
    } catch (err) {
      if (isCurrentBookmarkContext(context)) console.error('Failed to load bookmarks:', err);
    }
  }, []);

  useLayoutEffect(() => {
    // Reset the visible state before painting a different book or session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBookmarks((items) => items.length ? [] : items);
    setIsSavingBookmark(false);
    if (!isAuthenticated) return;
    const controller = new AbortController();
    const context = { bookId, signal: controller.signal, generation: getAccessGeneration() };
    activeBookRef.current = context;
    queueMicrotask(() => { void loadBookmarks(context); });
    return () => {
      activeBookRef.current = null;
      controller.abort();
    };
  }, [bookId, isAuthenticated, loadBookmarks]);

  const handleCreateBookmark = useCallback(async () => {
    const context = activeBookRef.current;
    if (!currentCFI || isSavingBookmark || context?.bookId !== bookId ||
      !isCurrentBookmarkContext(context)) return;

    const isDuplicate = bookmarks.some((item) => item.cfi === currentCFI);
    if (isDuplicate) {
      toast.error('该位置已添加书签');
      return;
    }

    setIsSavingBookmark(true);
    try {
      const bookmark = await api.createBookmark(bookId, {
        cfi: currentCFI,
        percentage,
        chapter: currentChapter,
        note: getBookmarkExcerpt(viewRef.current),
      });
      if (!isCurrentBookmarkContext(context)) return;
      setBookmarks((items) => [...items, bookmark]);
      toast.success('书签已添加');
    } catch (err) {
      if (!isCurrentBookmarkContext(context)) return;
      console.error('Failed to create bookmark:', err);
      toast.error('添加书签失败');
    } finally {
      if (isCurrentBookmarkContext(context)) setIsSavingBookmark(false);
    }
  }, [
    bookId,
    bookmarks,
    currentCFI,
    currentChapter,
    isSavingBookmark,
    percentage,
    viewRef,
  ]);

  const handleGoToBookmark = useCallback(
    (bookmark: Bookmark) => {
      viewRef.current?.goTo?.(bookmark.cfi);
      onBookmarksOpenChange(false);
    },
    [onBookmarksOpenChange, viewRef]
  );

  const handleDeleteBookmark = useCallback(
    async (bookmarkId: string) => {
      const context = activeBookRef.current;
      if (context?.bookId !== bookId || !isCurrentBookmarkContext(context)) return;
      setBookmarks((items) => items.filter((item) => item.id !== bookmarkId));
      try {
        await api.deleteBookmark(bookId, bookmarkId);
      } catch (err) {
        if (!isCurrentBookmarkContext(context)) return;
        console.error('Failed to delete bookmark:', err);
        void loadBookmarks(context);
      }
    },
    [bookId, loadBookmarks]
  );

  return {
    bookmarks,
    isSavingBookmark,
    handleCreateBookmark,
    handleGoToBookmark,
    handleDeleteBookmark,
  };
}
