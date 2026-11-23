'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ApiError, api } from '@/lib/api';
import type { Progress } from '@/lib/api';

type ProgressSnapshot = {
  cfi: string;
  percentage: number;
  updated_at?: string;
  device_id?: string;
  remote?: boolean;
};

type OfflineProgress = ProgressSnapshot & { expected_updated_at?: string | null };
type PendingProgress = Pick<ProgressSnapshot, 'cfi' | 'percentage'> & {
  bookId: string;
  offlineBase?: { expectedUpdatedAt: string | null };
};

const offlineQueueKey = 'z-reader-offline-pending-sync-books';
const replayingBooks = new Set<string>();

interface UseProgressOptions {
  bookId: string;
  autoSaveInterval?: number;
  debounceDelay?: number;
  remoteSyncEnabled?: boolean;
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function offlineProgressKey(bookId: string) {
  return `z-reader-offline-progress:${bookId}`;
}

function parseOfflineProgress(raw: string | null): OfflineProgress | null {
  try {
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<OfflineProgress>;
    if (!cached?.cfi) return null;
    return { ...cached, cfi: cached.cfi, percentage: cached.percentage ?? 0, remote: false };
  } catch {
    return null;
  }
}

function readOfflineProgressSnapshot(bookId: string) {
  if (typeof window === 'undefined') return null;
  try {
    return parseOfflineProgress(localStorage.getItem(offlineProgressKey(bookId)));
  } catch {
    return null;
  }
}

function readOfflineQueue(): string[] {
  try {
    const queue = JSON.parse(localStorage.getItem(offlineQueueKey) ?? '[]');
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

// Persist the server version independently of the reading position, including across reloads.
function confirmedVersionKey(bookId: string) {
  return `z-reader-progress-server-version:${bookId}`;
}

function rememberServerVersion(bookId: string, progress: Progress | null) {
  if (progress?.cfi && progress.updated_at) {
    localStorage.setItem(confirmedVersionKey(bookId), progress.updated_at);
  } else if (!progress?.cfi) {
    localStorage.removeItem(confirmedVersionKey(bookId));
  }
}

function progressPrecondition(version: string | null | undefined) {
  return version ? { expectedUpdatedAt: version } : { createOnly: true };
}

function getDeviceId() {
  const storageKey = 'z-reader-device-id';
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const next =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(storageKey, next);
  return next;
}

function isPermanentProgressError(error: unknown) {
  return error instanceof ApiError && [400, 404, 410, 413, 422].includes(error.status);
}

async function loadProgressAfterConflict(bookId: string, error: ApiError) {
  const details = error.details as { progress?: Progress | null } | undefined;
  if (details?.progress === null || (details?.progress?.cfi && details.progress.updated_at)) {
    return details.progress;
  }
  return api.getProgress(bookId);
}

export function useProgress({
  bookId,
  autoSaveInterval = 5000,
  debounceDelay = 1000,
  remoteSyncEnabled = true,
}: UseProgressOptions) {
  // Hydrate offline progress synchronously so the reader can open without waiting on network.
  const [progress, setProgress] = useState<ProgressSnapshot | null>(() => {
    const offline = readOfflineProgressSnapshot(bookId);
    return offline;
  });
  const [isLoading, setIsLoading] = useState(() => {
    // If we already have offline progress, treat progress as ready for open; still refresh remote.
    return !readOfflineProgressSnapshot(bookId);
  });
  const lastSavedRef = useRef<ProgressSnapshot | null>(progress);
  const pendingSaveRef = useRef<PendingProgress | null>(null);
  const savingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const persistOfflineProgress = useCallback((
    data: PendingProgress,
    version = localStorage.getItem(confirmedVersionKey(bookId)),
  ) => {
    const key = offlineProgressKey(bookId);
    const cached = parseOfflineProgress(localStorage.getItem(key));
    const queue = readOfflineQueue();
    const alreadyQueued = queue.includes(bookId);
    const offlineSnapshot: OfflineProgress = {
      cfi: data.cfi,
      percentage: data.percentage,
      updated_at: new Date().toISOString(),
      device_id: getDeviceId(),
      remote: false,
      // Keep the original base even if a later GET has observed a newer version.
      expected_updated_at: data.offlineBase
        ? data.offlineBase.expectedUpdatedAt
        : alreadyQueued && cached ? cached.expected_updated_at ?? null : version,
    };

    localStorage.setItem(key, JSON.stringify(offlineSnapshot));
    if (!alreadyQueued) {
      localStorage.setItem(offlineQueueKey, JSON.stringify([...queue, bookId]));
    }

    lastSavedRef.current = offlineSnapshot;
    setProgress(offlineSnapshot);
    if (pendingSaveRef.current === data) pendingSaveRef.current = null;
  }, [bookId]);

  const syncOfflineProgressQueue = useCallback(async () => {
    if (!remoteSyncEnabled || isBrowserOffline()) return;
    const queue = readOfflineQueue();
    for (const id of queue) {
      if (isBrowserOffline()) break;
      if (replayingBooks.has(id)) continue;
      const key = offlineProgressKey(id);
      const raw = localStorage.getItem(key);
      const cached = parseOfflineProgress(raw);
      replayingBooks.add(id);
      try {
        if (cached) {
          const version = cached.expected_updated_at ?? null;
          try {
            // Unversioned entries can create the first record, but cannot replace one.
            const saved = await api.saveProgress(id, cached.cfi, cached.percentage, {
              ...progressPrecondition(version),
              deviceId: cached.device_id || getDeviceId(),
            });
            rememberServerVersion(id, saved);
            const pending = pendingSaveRef.current;
            if (pending?.bookId === id && pending.offlineBase?.expectedUpdatedAt === version) {
              pending.offlineBase.expectedUpdatedAt = saved.updated_at;
            }
            const newerRaw = localStorage.getItem(key);
            const newer = parseOfflineProgress(newerRaw);
            if (newerRaw !== raw && newer && (newer.expected_updated_at ?? null) === version) {
              // A successful upload advances the base of newer local edits in this queue.
              localStorage.setItem(key, JSON.stringify({
                ...newer,
                expected_updated_at: saved.updated_at,
              }));
              queue.push(id);
            }
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              const latest = await loadProgressAfterConflict(id, error);
              rememberServerVersion(id, latest);
              // Preserve the active reading position and keep in-flight edits on the old base.
              const pending = pendingSaveRef.current;
              if (pending?.bookId === id && !pending.offlineBase) {
                pending.offlineBase = { expectedUpdatedAt: version };
              }
            } else if (!isPermanentProgressError(error)) {
              throw error;
            }
          }
        }

        // Another edit may have replaced the snapshot during the request.
        if (localStorage.getItem(key) === raw) {
          localStorage.removeItem(key);
          const remaining = readOfflineQueue().filter(book => book !== id);
          localStorage.setItem(offlineQueueKey, JSON.stringify(remaining));
        }
      } catch (error) {
        console.error(`Failed to background sync progress for book ${id}:`, error);
        break;
      } finally {
        replayingBooks.delete(id);
      }
    }
  }, [remoteSyncEnabled]);

  const saveProgress = useCallback(async (data: PendingProgress, force = false) => {
    if (data.bookId !== bookId || savingRef.current || (!force && !hasMeaningfulChange(data))) return;

    const canSync = remoteSyncEnabled && !isBrowserOffline();
    if (!canSync || data.offlineBase || readOfflineQueue().includes(bookId)) {
      persistOfflineProgress(data);
      if (canSync) void syncOfflineProgressQueue();
      return;
    }

    savingRef.current = true;
    const version = localStorage.getItem(confirmedVersionKey(bookId));
    const latestPending = () => pendingSaveRef.current?.bookId === bookId
      ? pendingSaveRef.current
      : data;
    try {
      const saved = await api.saveProgress(bookId, data.cfi, data.percentage, {
        ...progressPrecondition(version),
        deviceId: getDeviceId(),
      });
      rememberServerVersion(bookId, saved);
      const snapshot = {
        cfi: saved.cfi,
        percentage: saved.percentage,
        updated_at: saved.updated_at,
        device_id: saved.device_id,
        remote: false,
      };
      lastSavedRef.current = snapshot;
      if (pendingSaveRef.current === data) {
        pendingSaveRef.current = null;
        setProgress(snapshot);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const latest = await loadProgressAfterConflict(bookId, err);
          rememberServerVersion(bookId, latest);
          if (pendingSaveRef.current === data) {
            pendingSaveRef.current = null;
            if (latest) applyLoadedProgress(latest);
          }
        } catch (loadErr) {
          console.error('Failed to load latest progress after conflict:', loadErr);
          persistOfflineProgress(latestPending(), version);
        }
        return;
      }

      console.error('Failed to save progress remotely:', err);
      if (!isPermanentProgressError(err)) {
        persistOfflineProgress(latestPending(), version);
      }
    } finally {
      savingRef.current = false;
    }
  }, [applyLoadedProgress, bookId, hasMeaningfulChange, persistOfflineProgress, remoteSyncEnabled, syncOfflineProgressQueue]);

  // 防抖保存 - 避免快速翻页时频繁请求
  const debouncedSave = useCallback((data: PendingProgress) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (pendingSaveRef.current === data) void saveProgress(data);
    }, debounceDelay);
  }, [saveProgress, debounceDelay]);

  const loadProgress = useCallback(async () => {
    if (!remoteSyncEnabled || isBrowserOffline()) {
      const offline = readOfflineProgressSnapshot(bookId);
      if (offline && pendingSaveRef.current?.bookId !== bookId) {
        setProgress(offline);
        lastSavedRef.current = offline;
      }
      setIsLoading(false);
      return;
    }

    const versionKey = confirmedVersionKey(bookId);
    const versionBeforeLoad = localStorage.getItem(versionKey);
    try {
      const data = await api.getProgress(bookId);
      // A save or replay may have completed while this GET was in flight.
      if (localStorage.getItem(versionKey) === versionBeforeLoad) {
        rememberServerVersion(bookId, data);
        if (!pendingSaveRef.current) {
          const cached = readOfflineProgressSnapshot(bookId);
          const remoteTime = data.updated_at ? Date.parse(data.updated_at) : 0;
          const cachedTime = cached?.updated_at ? Date.parse(cached.updated_at) : 0;
          if (cached && (!data.cfi || cachedTime > remoteTime)) {
            setProgress(cached);
            lastSavedRef.current = cached;
          } else {
            applyLoadedProgress(data);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load progress from server:', err);
      const cached = readOfflineProgressSnapshot(bookId);
      if (cached && !pendingSaveRef.current) {
        setProgress(cached);
        lastSavedRef.current = cached;
      }
    }
    setIsLoading(false);
  }, [applyLoadedProgress, bookId, remoteSyncEnabled]);

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
    if (!remoteSyncEnabled) return;
    const refreshRemoteProgress = async () => {
      if (isBrowserOffline()) return;
      if (readOfflineQueue().includes(bookId)) {
        void syncOfflineProgressQueue();
        return;
      }
      if (!lastSavedRef.current || savingRef.current || pendingSaveRef.current) return;
      const versionKey = confirmedVersionKey(bookId);
      const versionBeforeRefresh = localStorage.getItem(versionKey);
      try {
        const latest = await api.getProgress(bookId);
        if (localStorage.getItem(versionKey) !== versionBeforeRefresh) return;
        rememberServerVersion(bookId, latest);
        if (!latest.cfi || !latest.updated_at || readOfflineQueue().includes(bookId)) return;

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
  }, [applyLoadedProgress, bookId, remoteSyncEnabled, syncOfflineProgressQueue]);

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
      if (pendingSaveRef.current?.bookId === bookId) {
        const pending = pendingSaveRef.current;
        if (hasMeaningfulChange(pending)) {
          if (
            !remoteSyncEnabled || isBrowserOffline() || pending.offlineBase ||
            readOfflineQueue().includes(bookId)
          ) {
            persistOfflineProgress(pending);
            return;
          }
          api.saveProgressOnUnload(bookId, pending.cfi, pending.percentage, {
            ...progressPrecondition(localStorage.getItem(confirmedVersionKey(bookId))),
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
  }, [bookId, hasMeaningfulChange, persistOfflineProgress, remoteSyncEnabled]);

  function updateProgress(cfi: string, percentage: number) {
    setProgress({ cfi, percentage });
    const pending: PendingProgress = { bookId, cfi, percentage };
    if (!remoteSyncEnabled || isBrowserOffline()) {
      const cached = readOfflineQueue().includes(bookId)
        ? readOfflineProgressSnapshot(bookId)
        : null;
      const version = localStorage.getItem(confirmedVersionKey(bookId));
      pending.offlineBase = {
        expectedUpdatedAt: cached ? cached.expected_updated_at ?? null : version,
      };
    }
    pendingSaveRef.current = pending;
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
