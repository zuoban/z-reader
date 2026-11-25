import { describe, expect, it, vi } from 'vitest';
import type { TTSAudioFetcher } from '@/lib/tts/fetcher';
import { TTSPreloadManager } from '@/lib/tts/preloader';

interface DeferredFetch {
  ssml: string;
  controller: AbortController;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
}

function createControllableFetcher() {
  const calls: DeferredFetch[] = [];
  const fetchWithController = vi.fn(
    (ssml: string, controller: AbortController) =>
      new Promise<Blob>((resolve, reject) => {
        calls.push({ ssml, controller, resolve, reject });
      }),
  );

  return {
    fetcher: { fetchWithController } as unknown as TTSAudioFetcher,
    fetchWithController,
    calls,
  };
}

describe('TTSPreloadManager.cleanupIrrelevantPreloads', () => {
  it('aborts in-flight irrelevant preload requests and prevents them from landing in the preloaded queue', async () => {
    const { fetcher, calls } = createControllableFetcher();
    const logMetric = vi.fn();
    const manager = new TTSPreloadManager(fetcher, logMetric);

    const relevant = '<speak>relevant-sentence</speak>';
    const stale = '<speak>stale-sentence</speak>';

    const relevantPromise = manager.preload(relevant);
    const stalePromise = manager.preload(stale);

    expect(calls).toHaveLength(2);
    expect(manager.hasInFlight(relevant)).toBe(true);
    expect(manager.hasInFlight(stale)).toBe(true);

    // Clean up while both requests are still in flight
    manager.cleanupIrrelevantPreloads([relevant]);

    const relevantCall = calls.find((c) => c.ssml === relevant)!;
    const staleCall = calls.find((c) => c.ssml === stale)!;

    expect(staleCall.controller.signal.aborted).toBe(true);
    expect(relevantCall.controller.signal.aborted).toBe(false);
    expect(manager.hasInFlight(stale)).toBe(false);
    expect(manager.hasInFlight(relevant)).toBe(true);
    expect(logMetric).toHaveBeenCalledWith('preload.cleanup-inflight', { removed: 1 });

    // Even if the stale fetch ignores abort and resolves with a Blob, it must NOT enter preloadedQueue
    staleCall.resolve(new Blob(['stale-audio']));
    relevantCall.resolve(new Blob(['relevant-audio']));
    await Promise.all([relevantPromise, stalePromise]);

    expect(manager.hasAudio(stale)).toBe(false);
    expect(manager.hasAudio(relevant)).toBe(true);
    expect(manager.getPreloadQueueLength()).toBe(1);
    expect(manager.takePreloaded(relevant)?.ssml).toBe(relevant);
  });

  it('cleans up ready queue, in-flight requests, and pending tasks together while preserving relevant work', async () => {
    const { fetcher, calls } = createControllableFetcher();
    const logMetric = vi.fn();
    const manager = new TTSPreloadManager(fetcher, logMetric);

    const readyStale = '<speak>ready-stale</speak>';
    const readyRelevant = '<speak>ready-relevant</speak>';
    const inflightStale = '<speak>inflight-stale</speak>';
    const inflightRelevant = '<speak>inflight-relevant</speak>';
    const pendingStale = '<speak>pending-stale</speak>';
    const pendingRelevant = '<speak>pending-relevant</speak>';

    // First populate two completed items in the ready queue
    const p1 = manager.preload(readyStale);
    const p2 = manager.preload(readyRelevant);
    calls[0].resolve(new Blob(['a']));
    calls[1].resolve(new Blob(['b']));
    await Promise.all([p1, p2]);
    expect(manager.getPreloadQueueLength()).toBe(2);

    // Start 2 in-flight requests (maxPreloadConcurrency = 2) and queue 2 pending tasks
    const pInflightStale = manager.preload(inflightStale);
    const pInflightRelevant = manager.preload(inflightRelevant);
    const pPendingStale = manager.preload(pendingStale);
    const pPendingRelevant = manager.preload(pendingRelevant);

    expect(calls).toHaveLength(4);
    expect(manager.getQueueMetrics()).toEqual({
      preloaded: 2,
      queued: 2,
      activePreloads: 2,
    });

    manager.cleanupIrrelevantPreloads([
      readyRelevant,
      inflightRelevant,
      pendingRelevant,
    ]);

    // Ready stale item removed, ready relevant item kept
    expect(manager.hasAudio(readyStale)).toBe(false);
    expect(manager.hasAudio(readyRelevant)).toBe(true);

    // In-flight stale request aborted, in-flight relevant request untouched
    const inflightStaleCall = calls.find((c) => c.ssml === inflightStale)!;
    const inflightRelevantCall = calls.find((c) => c.ssml === inflightRelevant)!;
    expect(inflightStaleCall.controller.signal.aborted).toBe(true);
    expect(inflightRelevantCall.controller.signal.aborted).toBe(false);
    expect(manager.hasInFlight(inflightStale)).toBe(false);
    expect(manager.hasInFlight(pendingStale)).toBe(false);

    // Pending stale task removed immediately and resolved
    await pPendingStale;
    expect(manager.getQueueMetrics().queued).toBe(1);

    // Rejecting aborted in-flight stale request frees a concurrency slot for pendingRelevant
    inflightStaleCall.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    await pInflightStale;

    const pendingRelevantCall = calls.find((c) => c.ssml === pendingRelevant);
    expect(pendingRelevantCall).toBeDefined();
    expect(calls.some((c) => c.ssml === pendingStale)).toBe(false);

    inflightRelevantCall.resolve(new Blob(['c']));
    pendingRelevantCall!.resolve(new Blob(['d']));
    await Promise.all([pInflightRelevant, pPendingRelevant]);

    expect(manager.hasAudio(readyRelevant)).toBe(true);
    expect(manager.hasAudio(inflightRelevant)).toBe(true);
    expect(manager.hasAudio(pendingRelevant)).toBe(true);
    expect(manager.hasAudio(inflightStale)).toBe(false);
    expect(manager.hasAudio(pendingStale)).toBe(false);
    expect(manager.getPreloadQueueLength()).toBe(3);
  });
});
