'use client';

import { useCallback, useRef, useState } from 'react';
import {
  type TTSSleepTimer,
  type TTSVisibleStatus,
} from '@/lib/tts-helpers';

interface UseTTSSleepTimerOptions {
  /** Invoked when the timer fires; typically stop TTS. */
  onExpire: () => void;
  updateVisibleStatus: (status: TTSVisibleStatus) => void;
}

export function useTTSSleepTimer({
  onExpire,
  updateVisibleStatus,
}: UseTTSSleepTimerOptions) {
  const [sleepTimer, setSleepTimer] = useState<TTSSleepTimer>({
    mode: 'off',
    label: '未设置',
  });
  const sleepTimerRef = useRef<TTSSleepTimer>({ mode: 'off', label: '未设置' });
  const sleepTimerTimeoutRef = useRef<number | null>(null);

  const clearSleepTimerTimeout = useCallback(() => {
    if (sleepTimerTimeoutRef.current !== null) {
      window.clearTimeout(sleepTimerTimeoutRef.current);
      sleepTimerTimeoutRef.current = null;
    }
  }, []);

  const clearSleepTimer = useCallback(() => {
    clearSleepTimerTimeout();
    const nextTimer: TTSSleepTimer = { mode: 'off', label: '未设置' };
    sleepTimerRef.current = nextTimer;
    setSleepTimer(nextTimer);
  }, [clearSleepTimerTimeout]);

  const setSleepTimerForMinutes = useCallback(
    (minutes: number) => {
      clearSleepTimerTimeout();
      const endsAt = Date.now() + minutes * 60 * 1000;
      const nextTimer: TTSSleepTimer = {
        mode: 'minutes',
        minutes,
        endsAt,
        label: `${minutes} 分钟后停止`,
      };
      sleepTimerRef.current = nextTimer;
      setSleepTimer(nextTimer);
      sleepTimerTimeoutRef.current = window.setTimeout(() => {
        updateVisibleStatus({
          headline: '睡眠定时已结束',
          detail: '已自动停止朗读',
          tone: 'idle',
        });
        clearSleepTimer();
        onExpire();
      }, Math.max(0, endsAt - Date.now()));
      updateVisibleStatus({
        headline: '已设置睡眠定时',
        detail: `${minutes} 分钟后自动停止`,
        tone: 'active',
      });
    },
    [clearSleepTimer, clearSleepTimerTimeout, onExpire, updateVisibleStatus]
  );

  return {
    sleepTimer,
    sleepTimerRef,
    setSleepTimerForMinutes,
    clearSleepTimer,
    clearSleepTimerTimeout,
  };
}
