"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type BookDownloadProgress } from "@/lib/api";
import { getOfflineLibrary } from "@/lib/library-access";
import { hasOfflineBook, saveOfflineBook } from "@/lib/offline-books";
import { formatOfflineDownloadLabel } from "@/lib/reader-page";

interface UseReaderOfflineOptions {
  bookId: string;
  library: string;
  authLoading: boolean;
  isAuthenticated: boolean;
  isOffline: boolean;
  checkAuth: () => Promise<string>;
}

export function useReaderOffline({
  bookId,
  library,
  authLoading,
  isAuthenticated,
  isOffline,
  checkAuth,
}: UseReaderOfflineOptions) {
  const [isRetryingAuth, setIsRetryingAuth] = useState(false);
  const [offlineAvailability, setOfflineAvailability] = useState<{
    bookId: string;
    available: boolean;
  } | null>(null);
  const [isSavingOffline, setIsSavingOffline] = useState(false);
  const [offlineDownloadProgress, setOfflineDownloadProgress] =
    useState<BookDownloadProgress | null>(null);
  const savingOfflineRef = useRef(false);
  const saveGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      const wasSaving = savingOfflineRef.current;
      saveGenerationRef.current += 1;
      savingOfflineRef.current = false;
      if (wasSaving && mountedRef.current) {
        setOfflineDownloadProgress(null);
        setIsSavingOffline(false);
      }
    };
  }, [bookId]);

  useEffect(() => {
    if (!isOffline || isRetryingAuth) return;
    const handleOnline = () => {
      void checkAuth();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [checkAuth, isOffline, isRetryingAuth]);

  useEffect(() => {
    if (authLoading || !isOffline || !bookId) return;
    let cancelled = false;
    void hasOfflineBook(library, bookId).then((available) => {
      if (!cancelled && library === getOfflineLibrary()) {
        setOfflineAvailability({ bookId, available });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, bookId, isOffline, library]);

  const offlineCheckedForBook = offlineAvailability?.bookId === bookId;
  const hasLocalOfflineCopy =
    isOffline && offlineCheckedForBook && offlineAvailability.available;
  const offlineMissingCopy =
    isOffline && offlineCheckedForBook && !offlineAvailability.available;

  const handleRetryConnection = useCallback(async () => {
    if (isRetryingAuth) return;
    setIsRetryingAuth(true);
    try {
      const status = await checkAuth();
      if (status === "offline") {
        toast.error("仍无法连接服务器，请检查网络后再试");
      }
    } finally {
      setIsRetryingAuth(false);
    }
  }, [checkAuth, isRetryingAuth]);

  const saveBookOffline = useCallback(
    async (loadedFile: File | Blob | null) => {
      if (
        !isAuthenticated ||
        savingOfflineRef.current ||
        library !== getOfflineLibrary()
      ) {
        return;
      }

      const saveGeneration = saveGenerationRef.current;
      const isCurrentSave = () => saveGenerationRef.current === saveGeneration;

      savingOfflineRef.current = true;
      setIsSavingOffline(true);
      setOfflineDownloadProgress(null);
      try {
        const [book, file] = await Promise.all([
          api.getBook(bookId),
          loadedFile
            ? Promise.resolve(loadedFile)
            : api.fetchBook(bookId, {
                onProgress: (progress) => {
                  if (isCurrentSave()) {
                    setOfflineDownloadProgress(progress);
                  }
                },
              }),
        ]);
        if (!isCurrentSave() || library !== getOfflineLibrary()) return;
        await saveOfflineBook(
          library,
          book,
          file,
          () => isCurrentSave() && library === getOfflineLibrary(),
        );
        if (!isCurrentSave() || library !== getOfflineLibrary()) return;
        toast.success("图书已保存到此设备，可在断网时继续阅读");
      } catch (err) {
        if (isCurrentSave()) {
          toast.error(err instanceof Error ? err.message : "保存离线图书失败");
        }
      } finally {
        if (isCurrentSave()) {
          savingOfflineRef.current = false;
          setOfflineDownloadProgress(null);
          setIsSavingOffline(false);
        }
      }
    },
    [bookId, isAuthenticated, library],
  );

  return {
    isRetryingAuth,
    isSavingOffline,
    offlineCheckedForBook,
    hasLocalOfflineCopy,
    offlineMissingCopy,
    offlineDownloadLabel: formatOfflineDownloadLabel(offlineDownloadProgress),
    handleRetryConnection,
    saveBookOffline,
  };
}
