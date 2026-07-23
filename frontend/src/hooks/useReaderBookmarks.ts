'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { api, type Bookmark } from '@/lib/api';
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

  const loadBookmarks = useCallback(async () => {
    try {
      const items = await api.listBookmarks(bookId);
      setBookmarks(items);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    }
  }, [bookId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    queueMicrotask(() => {
      void loadBookmarks();
    });
  }, [isAuthenticated, loadBookmarks]);

  const handleCreateBookmark = useCallback(async () => {
    if (!currentCFI || isSavingBookmark) return;

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
      setBookmarks((items) => [...items, bookmark]);
      toast.success('书签已添加');
    } catch (err) {
      console.error('Failed to create bookmark:', err);
      toast.error('添加书签失败');
    } finally {
      setIsSavingBookmark(false);
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
      setBookmarks((items) => items.filter((item) => item.id !== bookmarkId));
      try {
        await api.deleteBookmark(bookId, bookmarkId);
      } catch (err) {
        console.error('Failed to delete bookmark:', err);
        void loadBookmarks();
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
