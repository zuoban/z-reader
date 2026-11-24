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
  const wantedRef = useRef(false);
  const releasesRef = useRef(new Set<Promise<void>>());

  const releaseSentinel = useCallback((sentinel: WakeLockSentinelLike) => {
    const releases = releasesRef.current;
    const release = Promise.resolve().then(() => sentinel.release()).catch((err) => {
      if (process.env.NODE_ENV === 'development') console.warn('Wake Lock release failed:', err);
    });
    releases.add(release);
    void release.then(() => releases.delete(release));
    return release;
  }, []);

  const requestWakeLock = useCallback(async () => {
    wantedRef.current = true;
    if (pendingRef.current) return pendingRef.current;
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (wakeLockRef.current?.released) wakeLockRef.current = null;
    if (!wakeLock || wakeLockRef.current) return;

    const request = async () => {
      let sentinel: WakeLockSentinelLike;
      try {
        sentinel = await Promise.resolve().then(() => wakeLock.request('screen'));
      } catch (err) {
        if (process.env.NODE_ENV === 'development') console.warn('Wake Lock request failed:', err);
        return;
      } finally {
        pendingRef.current = null;
      }

      if (!wantedRef.current || document.visibilityState !== 'visible') {
        await releaseSentinel(sentinel);
        return;
      }
      wakeLockRef.current = sentinel;
      sentinel.addEventListener?.('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      });
    };
    pendingRef.current = request();
    return pendingRef.current;
  }, [releaseSentinel]);

  const releaseWakeLock = useCallback(async () => {
    wantedRef.current = false;
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel) releaseSentinel(sentinel);
    await Promise.all([pendingRef.current, ...releasesRef.current]);
  }, [releaseSentinel]);

  return {
    requestWakeLock,
    releaseWakeLock,
  };
}
