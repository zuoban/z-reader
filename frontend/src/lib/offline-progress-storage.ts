import { accessStorageKey } from '@/lib/library-access';

const EXPIRED_PROGRESS_KEY = 'z-reader-expired-progress-generation';

export function offlineProgressKey(bookId: string, generation: string | null) {
  return accessStorageKey(`z-reader-offline-progress:${bookId}`, generation);
}

export function offlineProgressQueueKey(generation: string | null) {
  return accessStorageKey('z-reader-offline-pending-sync-books', generation);
}

export function readOfflineQueue(key: string): string[] {
  try {
    const queue: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(queue) ? queue.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function transitionOfflineProgress(
  current: string | null, next: string, reason: 'expired' | 'login' | 'logout',
): void {
  try {
    const expired = localStorage.getItem(EXPIRED_PROGRESS_KEY);
    if (reason === 'expired') {
      if (expired === null && readOfflineQueue(offlineProgressQueueKey(current)).length > 0) {
        localStorage.setItem(EXPIRED_PROGRESS_KEY, JSON.stringify(current));
      }
    } else if (reason === 'logout') {
      localStorage.removeItem(EXPIRED_PROGRESS_KEY);
    } else if (expired !== null) {
      const previous: unknown = JSON.parse(expired);
      if (previous !== null && typeof previous !== 'string') return;
      const previousQueue = offlineProgressQueueKey(previous);
      const moved: string[] = [];
      for (const id of readOfflineQueue(previousQueue)) {
        const snapshot = localStorage.getItem(offlineProgressKey(id, previous));
        if (snapshot === null) continue;
        localStorage.setItem(offlineProgressKey(id, next), snapshot);
        moved.push(id);
      }
      if (moved.length > 0) localStorage.setItem(offlineProgressQueueKey(next), JSON.stringify(moved));
      localStorage.removeItem(EXPIRED_PROGRESS_KEY);
      localStorage.removeItem(previousQueue);
      for (const id of moved) localStorage.removeItem(offlineProgressKey(id, previous));
    }
  } catch {
    // Browser storage can be blocked or full. Authentication must still complete.
  }
}
