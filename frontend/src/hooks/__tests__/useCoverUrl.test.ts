import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCoverUrlCache,
  getCoverCacheSizeForTests,
  scheduleCoverFetch,
} from '@/hooks/useCoverUrl';

describe('cover fetch queue', () => {
  afterEach(() => {
    clearCoverUrlCache();
  });

  it('cancels a queued job before it starts', async () => {
    const slow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 50);
        })
    );

    // Saturate the concurrency pool with long jobs.
    const blockers = Array.from({ length: 6 }, () =>
      scheduleCoverFetch(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      })
    );

    const cancelQueued = scheduleCoverFetch(async () => {
      slow();
    });
    cancelQueued();

    await new Promise((resolve) => window.setTimeout(resolve, 120));
    blockers.forEach((cancel) => cancel());

    expect(slow).not.toHaveBeenCalled();
  });

  it('aborts an in-flight fetch via signal', async () => {
    let sawAbort = false;

    const cancel = scheduleCoverFetch(async (signal) => {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 200);
        signal.addEventListener('abort', () => {
          sawAbort = true;
          window.clearTimeout(timer);
          resolve();
        });
      });
    });

    await new Promise((resolve) => window.setTimeout(resolve, 10));
    cancel();
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(sawAbort).toBe(true);
  });

  it('tracks cache size after clear', () => {
    expect(getCoverCacheSizeForTests()).toBe(0);
    clearCoverUrlCache();
    expect(getCoverCacheSizeForTests()).toBe(0);
  });
});
