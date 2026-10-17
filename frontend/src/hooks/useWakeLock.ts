'use client';

import { useCallback, useRef } from 'react';

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  released?: boolean;
  addEventListener?: (event: 'release', listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (pendingRef.current) return pendingRef.current;
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (wakeLockRef.current?.released) wakeLockRef.current = null;
    if (!wakeLock || wakeLockRef.current) return;
    const request = async () => {
      try {
        const sentinel = await wakeLock.request('screen');
        if (document.visibilityState !== 'visible') { await sentinel.release(); return; }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener?.('release', () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
      } catch (err) {
        if (process.env.NODE_ENV === 'development') console.warn('Wake Lock request failed:', err);
      } finally { pendingRef.current = null; }
    };
    pendingRef.current = request();
    return pendingRef.current;
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await pendingRef.current;
      const sentinel = wakeLockRef.current;
      if (sentinel) {
        await sentinel.release();
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.warn('Wake Lock release failed:', err);
    }
  }, []);

  return {
    requestWakeLock,
    releaseWakeLock,
  };
}
