'use client';

import { useCallback, useRef } from 'react';

type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (err) {
      console.warn('Wake Lock release failed:', err);
    }
  }, []);

  return {
    requestWakeLock,
    releaseWakeLock,
  };
}
