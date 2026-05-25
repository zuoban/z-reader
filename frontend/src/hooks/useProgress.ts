'use client';

import { ApiError, api } from '@/lib/api';
import { useEffect, useRef, useState, useCallback } from 'react';

type ProgressSnapshot = {
  cfi: string;
  percentage: number;
  updated_at?: string;
  device_id?: string;
  remote?: boolean;
};

interface UseProgressOptions {
  bookId: string;
  autoSaveInterval?: number;
  debounceDelay?: number;
}

export function useProgress({ bookId, autoSaveInterval = 5000, debounceDelay = 1000 }: UseProgressOptions) {
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastSavedRef = useRef<ProgressSnapshot | null>(null);
  const pendingSaveRef = useRef<{ cfi: string; percentage: number } | null>(null);
  const savingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceIdRef = useRef<string | null>(null);

  function getDeviceId() {
    if (deviceIdRef.current) return deviceIdRef.current;
    const storageKey = 'z-reader-device-id';
    const existing = localStorage.getItem(storageKey);
    if (existing) {
      deviceIdRef.current = existing;
      return existing;
    }

    const next =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, next);
    deviceIdRef.current = next;
    return next;
  }

  const applyLoadedProgress = useCallback((data: {
    cfi: string;
    percentage: number;
    updated_at?: string;
    device_id?: string;
  }) => {
    if (!data.cfi) return;
    const snapshot = {
      cfi: data.cfi,
      percentage: data.percentage,
      updated_at: data.updated_at,
      device_id: data.device_id,
      remote: true,
    };
    setProgress(snapshot);
    lastSavedRef.current = snapshot;
  }, []);

  const hasMeaningfulChange = useCallback((data: { cfi: string; percentage: number }) => {
    const lastSaved = lastSavedRef.current;
    if (!lastSaved) return true;
    return (
      data.cfi !== lastSaved.cfi ||
      Math.abs(data.percentage - lastSaved.percentage) >= 1
    );
  }, []);

  const saveProgress = useCallback(async (data: { cfi: string; percentage: number }, force = false) => {
    // 强制保存时忽略 1% 变化限制
    if (!force && savingRef.current) return;
    if (!force && !hasMeaningfulChange(data)) {
      return;
    }

    savingRef.current = true;

    try {
      const saved = await api.saveProgress(bookId, data.cfi, data.percentage, {
        expectedUpdatedAt: lastSavedRef.current?.updated_at,
        deviceId: getDeviceId(),
      });
      const snapshot = {
        cfi: saved.cfi,
        percentage: saved.percentage,
        updated_at: saved.updated_at,
        device_id: saved.device_id,
        remote: false,
      };
      lastSavedRef.current = snapshot;
      setProgress(snapshot);
      if (
        pendingSaveRef.current?.cfi === data.cfi &&
        pendingSaveRef.current.percentage === data.percentage
      ) {
        pendingSaveRef.current = null;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const latest = await api.getProgress(bookId);
          applyLoadedProgress(latest);
          pendingSaveRef.current = null;
        } catch (loadErr) {
          console.error('Failed to load latest progress after conflict:', loadErr);
        }
        return;
      }

      console.error('Failed to save progress remotely, using offline backup:', err);

      // Handle offline queuing if the error is not a server logic conflict
      if (!(err instanceof ApiError)) {
        const offlineSnapshot = {
          cfi: data.cfi,
          percentage: data.percentage,
          updated_at: new Date().toISOString(),
          device_id: getDeviceId() || 'offline-device',
          remote: false,
        };

        // Cache locally for this book
        localStorage.setItem(`z-reader-offline-progress:${bookId}`, JSON.stringify(offlineSnapshot));

        // Add to pending sync queue
        try {
          const queueRaw = localStorage.getItem('z-reader-offline-pending-sync-books');
          const queue: string[] = queueRaw ? JSON.parse(queueRaw) : [];
          if (!queue.includes(bookId)) {
            queue.push(bookId);
            localStorage.setItem('z-reader-offline-pending-sync-books', JSON.stringify(queue));
          }
        } catch {
          // ignore
        }

        // Apply offline snapshot to state so interface updates instantly
        lastSavedRef.current = offlineSnapshot;
        setProgress(offlineSnapshot);

        if (
          pendingSaveRef.current?.cfi === data.cfi &&
          pendingSaveRef.current.percentage === data.percentage
        ) {
          pendingSaveRef.current = null;
        }
      }
    } finally {
      savingRef.current = false;
    }
  }, [applyLoadedProgress, bookId, hasMeaningfulChange]);

  // 防抖保存 - 避免快速翻页时频繁请求
  const debouncedSave = useCallback((data: { cfi: string; percentage: number }) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      saveProgress(data);
    }, debounceDelay);
  }, [saveProgress, debounceDelay]);

  const syncOfflineProgressQueue = useCallback(async () => {
    try {
      const queueRaw = localStorage.getItem('z-reader-offline-pending-sync-books');
      if (!queueRaw) return;
      const queue: string[] = JSON.parse(queueRaw);
      if (queue.length === 0) return;

      const nextQueue = [...queue];
      for (const id of queue) {
        const cachedRaw = localStorage.getItem(`z-reader-offline-progress:${id}`);
        if (!cachedRaw) {
          const index = nextQueue.indexOf(id);
          if (index !== -1) nextQueue.splice(index, 1);
          continue;
        }

        const cached = JSON.parse(cachedRaw);
        try {
          // Sync with server
          await api.saveProgress(id, cached.cfi, cached.percentage, {
            deviceId: cached.device_id || getDeviceId(),
          });

          // Successfully synced, remove local backups
          localStorage.removeItem(`z-reader-offline-progress:${id}`);
          const index = nextQueue.indexOf(id);
          if (index !== -1) nextQueue.splice(index, 1);
        } catch (err) {
          console.error(`Failed to background sync progress for book ${id}:`, err);
          if (err instanceof ApiError) {
            // Discard unrecoverable format or logic failures
            localStorage.removeItem(`z-reader-offline-progress:${id}`);
            const index = nextQueue.indexOf(id);
            if (index !== -1) nextQueue.splice(index, 1);
          } else {
            // Break loop on network connection failure to retry later
            break;
          }
        }
      }

      localStorage.setItem('z-reader-offline-pending-sync-books', JSON.stringify(nextQueue));
    } catch (err) {
      console.error('Error in background sync progress queue:', err);
    }
  }, []);

  const loadProgress = useCallback(async () => {
    try {
      const data = await api.getProgress(bookId);
      applyLoadedProgress(data);

      // Verify if there is a newer offline-cached progress that was not synced yet
      const cachedRaw = localStorage.getItem(`z-reader-offline-progress:${bookId}`);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw);
          const remoteTime = data.updated_at ? Date.parse(data.updated_at) : 0;
          const cachedTime = cached.updated_at ? Date.parse(cached.updated_at) : 0;
          if (cachedTime > remoteTime) {
            applyLoadedProgress(cached);
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error('Failed to load progress from server:', err);

      // Fallback: load offline progress from localStorage if server fails offline
      const cachedRaw = localStorage.getItem(`z-reader-offline-progress:${bookId}`);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw);
          applyLoadedProgress(cached);
        } catch {
          // ignore
        }
      }
    }
    setIsLoading(false);
  }, [applyLoadedProgress, bookId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProgress();
    });
  }, [loadProgress]);

  useEffect(() => {
    // Trigger synchronization of any pending progress on mount
    void syncOfflineProgressQueue();
  }, [syncOfflineProgressQueue]);

  useEffect(() => {
    // Automatically trigger queue sync when internet connection is restored
    const handleOnline = () => {
      void syncOfflineProgressQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncOfflineProgressQueue]);

  useEffect(() => {
    const refreshRemoteProgress = async () => {
      if (!lastSavedRef.current || savingRef.current || pendingSaveRef.current) return;
      try {
        const latest = await api.getProgress(bookId);
        if (!latest.cfi || !latest.updated_at) return;

        const lastSaved = lastSavedRef.current;
        const latestTime = Date.parse(latest.updated_at);
        const lastSavedTime = lastSaved?.updated_at ? Date.parse(lastSaved.updated_at) : 0;
        if (
          latestTime > lastSavedTime &&
          latest.device_id !== getDeviceId()
        ) {
          applyLoadedProgress(latest);
        }
      } catch (err) {
        console.error('Failed to refresh remote progress:', err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshRemoteProgress();
      }
    };

    window.addEventListener('focus', refreshRemoteProgress);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshRemoteProgress);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [applyLoadedProgress, bookId]);

  // 定时保存 - 低频检查
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingSaveRef.current && !savingRef.current) {
        debouncedSave(pendingSaveRef.current);
      }
    }, autoSaveInterval);

    return () => {
      clearInterval(interval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [autoSaveInterval, debouncedSave]);

  // 页面隐藏时立即保存（使用更低延迟）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingSaveRef.current) {
        // 页面隐藏时直接同步保存
        saveProgress(pendingSaveRef.current, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [saveProgress]);

  // 页面卸载前保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        if (hasMeaningfulChange(pending)) {
          api.saveProgressOnUnload(bookId, pending.cfi, pending.percentage, {
            expectedUpdatedAt: lastSavedRef.current?.updated_at,
            deviceId: getDeviceId(),
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [bookId, hasMeaningfulChange]);

  function updateProgress(cfi: string, percentage: number) {
    setProgress({ cfi, percentage });
    pendingSaveRef.current = { cfi, percentage };
  }

  function saveNow() {
    // 清理防抖计时器，立即保存
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingSaveRef.current) {
      saveProgress(pendingSaveRef.current, true);
    }
  }

  return { progress, isLoading, updateProgress, saveNow };
}
