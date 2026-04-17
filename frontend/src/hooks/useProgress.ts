'use client';

import { api } from '@/lib/api';
import { useEffect, useRef, useState, useCallback } from 'react';

interface UseProgressOptions {
  bookId: string;
  autoSaveInterval?: number;
  debounceDelay?: number;
}

export function useProgress({ bookId, autoSaveInterval = 5000, debounceDelay = 1000 }: UseProgressOptions) {
  const [progress, setProgress] = useState<{ cfi: string; percentage: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastSavedRef = useRef<{ cfi: string; percentage: number } | null>(null);
  const pendingSaveRef = useRef<{ cfi: string; percentage: number } | null>(null);
  const savingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveProgress = useCallback(async (data: { cfi: string; percentage: number }, force = false) => {
    // 强制保存时忽略 1% 变化限制
    if (!force && savingRef.current) return;
    if (!force) {
      // 非强制保存时，检查进度变化是否小于 1%
      if (lastSavedRef.current && Math.abs(data.percentage - lastSavedRef.current.percentage) < 1) {
        return;
      }
    }

    savingRef.current = true;

    try {
      await api.saveProgress(bookId, data.cfi, data.percentage);
      lastSavedRef.current = data;
    } catch (err) {
      console.error('Failed to save progress:', err);
    } finally {
      savingRef.current = false;
    }
  }, [bookId]);

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
      if (data.cfi) {
        setProgress({ cfi: data.cfi, percentage: data.percentage });
        lastSavedRef.current = { cfi: data.cfi, percentage: data.percentage };
      }
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
    setIsLoading(false);
  }, [bookId]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

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
        const lastSaved = lastSavedRef.current;
        if (
          !lastSaved ||
          pending.cfi !== lastSaved.cfi ||
          Math.abs(pending.percentage - lastSaved.percentage) >= 1
        ) {
          api.saveProgressOnUnload(bookId, pending.cfi, pending.percentage);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [bookId]);

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
