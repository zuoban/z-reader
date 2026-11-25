import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  offlineProgressKey,
  offlineProgressQueueKey,
  readOfflineQueue,
  transitionOfflineProgress,
} from '@/lib/offline-progress-storage';

const EXPIRED_PROGRESS_KEY = 'z-reader-expired-progress-generation';

describe('offline-progress-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('storage key helpers', () => {
    it('builds unprefixed keys when generation is null', () => {
      expect(offlineProgressKey('book-1', null)).toBe('z-reader-offline-progress:book-1');
      expect(offlineProgressQueueKey(null)).toBe('z-reader-offline-pending-sync-books');
    });

    it('scopes keys by access generation when present', () => {
      expect(offlineProgressKey('book-1', 'gen-2')).toBe(
        'z-reader-access:gen-2:z-reader-offline-progress:book-1',
      );
      expect(offlineProgressQueueKey('gen-2')).toBe(
        'z-reader-access:gen-2:z-reader-offline-pending-sync-books',
      );
    });
  });

  describe('readOfflineQueue', () => {
    it('returns an empty array when the key is missing', () => {
      expect(readOfflineQueue('missing-key')).toEqual([]);
    });

    it('returns valid string IDs and filters out non-string items', () => {
      localStorage.setItem(
        'queue-key',
        JSON.stringify(['book-1', 42, null, 'book-2', true, { id: 'book-3' }]),
      );
      expect(readOfflineQueue('queue-key')).toEqual(['book-1', 'book-2']);
    });

    it('returns an empty array for non-array JSON or malformed JSON', () => {
      localStorage.setItem('obj-key', JSON.stringify({ id: 'book-1' }));
      localStorage.setItem('str-key', JSON.stringify('book-1'));
      localStorage.setItem('null-key', 'null');
      localStorage.setItem('bad-json', '{not valid json');

      expect(readOfflineQueue('obj-key')).toEqual([]);
      expect(readOfflineQueue('str-key')).toEqual([]);
      expect(readOfflineQueue('null-key')).toEqual([]);
      expect(readOfflineQueue('bad-json')).toEqual([]);
    });

    it('returns an empty array when localStorage.getItem throws', () => {
      const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('storage blocked');
      });
      expect(readOfflineQueue('any-key')).toEqual([]);
      expect(getItemSpy).toHaveBeenCalledWith('any-key');
    });
  });

  describe('transitionOfflineProgress', () => {
    it('records the expired generation only when pending offline progress exists', () => {
      transitionOfflineProgress('gen-1', 'gen-2', 'expired');
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBeNull();

      localStorage.setItem(offlineProgressQueueKey('gen-1'), JSON.stringify(['book-1']));
      transitionOfflineProgress('gen-1', 'gen-2', 'expired');
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBe(JSON.stringify('gen-1'));
    });

    it('preserves the original expired generation across repeated expirations', () => {
      localStorage.setItem(offlineProgressQueueKey(null), JSON.stringify(['book-1']));
      transitionOfflineProgress(null, 'gen-1', 'expired');
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBe('null');

      localStorage.setItem(offlineProgressQueueKey('gen-1'), JSON.stringify(['book-2']));
      transitionOfflineProgress('gen-1', 'gen-2', 'expired');
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBe('null');
    });

    it('migrates queued snapshots on login from a prior generation and cleans up old keys', () => {
      const snap1 = JSON.stringify({ cfi: 'cfi-1', percentage: 25 });
      const snap2 = JSON.stringify({ cfi: 'cfi-2', percentage: 80 });
      localStorage.setItem(offlineProgressQueueKey('gen-1'), JSON.stringify(['book-1', 'book-2']));
      localStorage.setItem(offlineProgressKey('book-1', 'gen-1'), snap1);
      localStorage.setItem(offlineProgressKey('book-2', 'gen-1'), snap2);

      transitionOfflineProgress('gen-1', 'gen-2', 'expired');
      transitionOfflineProgress('gen-2', 'gen-3', 'login');

      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBeNull();
      expect(localStorage.getItem(offlineProgressQueueKey('gen-1'))).toBeNull();
      expect(localStorage.getItem(offlineProgressKey('book-1', 'gen-1'))).toBeNull();
      expect(localStorage.getItem(offlineProgressKey('book-2', 'gen-1'))).toBeNull();

      expect(readOfflineQueue(offlineProgressQueueKey('gen-3'))).toEqual(['book-1', 'book-2']);
      expect(localStorage.getItem(offlineProgressKey('book-1', 'gen-3'))).toBe(snap1);
      expect(localStorage.getItem(offlineProgressKey('book-2', 'gen-3'))).toBe(snap2);
    });

    it('migrates queued snapshots from null generation on login', () => {
      const snapshot = JSON.stringify({ cfi: 'cfi-null', percentage: 10 });
      localStorage.setItem(offlineProgressQueueKey(null), JSON.stringify(['book-null']));
      localStorage.setItem(offlineProgressKey('book-null', null), snapshot);

      transitionOfflineProgress(null, 'gen-1', 'expired');
      transitionOfflineProgress('gen-1', 'gen-2', 'login');

      expect(readOfflineQueue(offlineProgressQueueKey('gen-2'))).toEqual(['book-null']);
      expect(localStorage.getItem(offlineProgressKey('book-null', 'gen-2'))).toBe(snapshot);
      expect(localStorage.getItem(offlineProgressQueueKey(null))).toBeNull();
      expect(localStorage.getItem(offlineProgressKey('book-null', null))).toBeNull();
    });

    it('skips queued book IDs that have no snapshot and omits empty next queue', () => {
      const snap = JSON.stringify({ cfi: 'cfi-present', percentage: 50 });
      localStorage.setItem(
        offlineProgressQueueKey('gen-1'),
        JSON.stringify(['missing-book', 'present-book']),
      );
      localStorage.setItem(offlineProgressKey('present-book', 'gen-1'), snap);

      transitionOfflineProgress('gen-1', 'gen-2', 'expired');
      transitionOfflineProgress('gen-2', 'gen-3', 'login');

      expect(readOfflineQueue(offlineProgressQueueKey('gen-3'))).toEqual(['present-book']);
      expect(localStorage.getItem(offlineProgressKey('present-book', 'gen-3'))).toBe(snap);
      expect(localStorage.getItem(offlineProgressKey('missing-book', 'gen-3'))).toBeNull();

      // When none of the queued IDs have snapshots, do not create an empty queue key
      localStorage.setItem(offlineProgressQueueKey('gen-4'), JSON.stringify(['ghost-book']));
      transitionOfflineProgress('gen-4', 'gen-5', 'expired');
      transitionOfflineProgress('gen-5', 'gen-6', 'login');

      expect(localStorage.getItem(offlineProgressQueueKey('gen-6'))).toBeNull();
      expect(localStorage.getItem(offlineProgressQueueKey('gen-4'))).toBeNull();
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBeNull();
    });

    it('clears the expired marker on logout so later login does not migrate', () => {
      localStorage.setItem(offlineProgressQueueKey('gen-1'), JSON.stringify(['book-1']));
      localStorage.setItem(offlineProgressKey('book-1', 'gen-1'), '{"cfi":"a"}');

      transitionOfflineProgress('gen-1', 'gen-2', 'expired');
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).not.toBeNull();

      transitionOfflineProgress('gen-2', 'gen-3', 'logout');
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBeNull();

      transitionOfflineProgress('gen-3', 'gen-4', 'login');
      expect(localStorage.getItem(offlineProgressQueueKey('gen-4'))).toBeNull();
      expect(localStorage.getItem(offlineProgressKey('book-1', 'gen-4'))).toBeNull();
    });

    it('is a no-op on login when no expired marker exists or marker is invalid', () => {
      const setItemSpy = vi.spyOn(localStorage, 'setItem');
      const removeItemSpy = vi.spyOn(localStorage, 'removeItem');

      transitionOfflineProgress('gen-1', 'gen-2', 'login');
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(removeItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
      removeItemSpy.mockRestore();

      localStorage.setItem(EXPIRED_PROGRESS_KEY, JSON.stringify({ bad: true }));
      transitionOfflineProgress('gen-1', 'gen-2', 'login');
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBe(JSON.stringify({ bad: true }));

      localStorage.setItem(EXPIRED_PROGRESS_KEY, JSON.stringify(123));
      transitionOfflineProgress('gen-1', 'gen-2', 'login');
      expect(localStorage.getItem(EXPIRED_PROGRESS_KEY)).toBe('123');

      localStorage.setItem(EXPIRED_PROGRESS_KEY, '{corrupt');
      expect(() => transitionOfflineProgress('gen-1', 'gen-2', 'login')).not.toThrow();
    });

    it('swallows browser storage quota and security errors', () => {
      localStorage.setItem(offlineProgressQueueKey('gen-1'), JSON.stringify(['book-1']));
      localStorage.setItem(offlineProgressKey('book-1', 'gen-1'), '{"cfi":"a"}');

      const expiredSetSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(() => transitionOfflineProgress('gen-1', 'gen-2', 'expired')).not.toThrow();
      expect(expiredSetSpy).toHaveBeenCalledTimes(1);
      expiredSetSpy.mockRestore();

      transitionOfflineProgress('gen-1', 'gen-2', 'expired');
      const loginSetSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(() => transitionOfflineProgress('gen-2', 'gen-3', 'login')).not.toThrow();
      expect(loginSetSpy).toHaveBeenCalledTimes(1);
      loginSetSpy.mockRestore();

      const logoutRemoveSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(() => transitionOfflineProgress('gen-2', 'gen-3', 'logout')).not.toThrow();
      expect(logoutRemoveSpy).toHaveBeenCalledWith(EXPIRED_PROGRESS_KEY);
    });
  });
});
