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
      console.error('Failed to save progress:', err);
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

  const loadProgress = useCallback(async () => {
    try {
      const data = await api.getProgress(bookId);
      applyLoadedProgress(data);
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
    setIsLoading(false);
  }, [applyLoadedProgress, bookId]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

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
