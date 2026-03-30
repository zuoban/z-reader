'use client';

import { api } from '@/lib/api';
import { useEffect, useRef, useState, useCallback } from 'react';

interface UseProgressOptions {
  bookId: string;
  autoSaveInterval?: number;
}

export function useProgress({ bookId, autoSaveInterval = 5000 }: UseProgressOptions) {
  const [progress, setProgress] = useState<{ cfi: string; percentage: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastSavedRef = useRef<{ cfi: string; percentage: number } | null>(null);
  const pendingSaveRef = useRef<{ cfi: string; percentage: number } | null>(null);
  const savingRef = useRef(false);

  const saveProgress = useCallback(async (data: { cfi: string; percentage: number }) => {
    if (savingRef.current) return;
    savingRef.current = true;

    try {
      await api.saveProgress(bookId, data.cfi, data.percentage);
      lastSavedRef.current = data;
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
    savingRef.current = false;
  }, [bookId]);

  useEffect(() => {
    loadProgress();
  }, [bookId]);

  // 定时保存
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingSaveRef.current && !savingRef.current) {
        const pending = pendingSaveRef.current;
        // 只在进度变化超过 1% 时保存
        if (!lastSavedRef.current || Math.abs(pending.percentage - lastSavedRef.current.percentage) >= 1) {
          saveProgress(pending);
        }
      }
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [autoSaveInterval, saveProgress]);

  // 页面隐藏/关闭时保存
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingSaveRef.current) {
        saveProgress(pendingSaveRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [saveProgress]);

  async function loadProgress() {
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
  }

  function updateProgress(cfi: string, percentage: number) {
    setProgress({ cfi, percentage });
    pendingSaveRef.current = { cfi, percentage };
  }

  function saveNow() {
    if (pendingSaveRef.current) {
      saveProgress(pendingSaveRef.current);
    }
  }

  return { progress, isLoading, updateProgress, saveNow };
}