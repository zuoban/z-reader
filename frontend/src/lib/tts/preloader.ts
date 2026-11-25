import { createAbortController } from '@/lib/config';
import { classifyTTSError } from '@/lib/tts-request';
import { LRUCache } from './audio-cache';
import type { TTSAudioFetcher } from './fetcher';
import { getUTF8ByteLength, isSSMLTooLarge, stripSSML } from './ssml';
import {
  TTS_REQUEST_TIMEOUT_MS,
  type AdaptivePreloadConfig,
  type CachedAudio,
  type PreloadedAudio,
  type PreloadTask,
  type TTSMark,
  type TTSMetricDetail,
} from './types';

export interface PreloadQueueMetrics {
  preloaded: number;
  queued: number;
  activePreloads: number;
}

export class TTSPreloadManager {
  private preloadedQueue: PreloadedAudio[] = [];
  private maxPreloadCount = 6;
  private maxPreloadConcurrency = 2;
  private activePreloadCount = 0;
  private pendingPreloadTasks: PreloadTask[] = [];
  private queuedPreloadKeys: Set<string> = new Set();
  private preloadAbortControllers: Map<string, AbortController> = new Map();
  private preloadPromises = new Map<string, Promise<void>>();
  private audioCache: LRUCache<CachedAudio> = new LRUCache(10);

  private preloadProgressThreshold = 0.28;
  private preloadRemainingSeconds = 12;
  private synthesisLatencySamples: number[] = [];
  private maxSynthesisLatencySamples = 8;
  private consecutivePreloadMisses = 0;

  constructor(
    private readonly fetcher: TTSAudioFetcher,
    private readonly logMetric: (event: string, detail?: TTSMetricDetail) => void,
  ) {}

  getQueueMetrics(): PreloadQueueMetrics {
    return {
      preloaded: this.preloadedQueue.length,
      queued: this.pendingPreloadTasks.length,
      activePreloads: this.activePreloadCount,
    };
  }

  getPreloadQueueLength(): number {
    return this.preloadedQueue.length;
  }

  hasAudio(ssml: string): boolean {
    return this.audioCache.has(ssml) || this.preloadedQueue.some((item) => item.ssml === ssml);
  }

  getCached(ssml: string): CachedAudio | undefined {
    return this.audioCache.get(ssml);
  }

  setCached(ssml: string, entry: CachedAudio): void {
    this.audioCache.set(ssml, entry);
  }

  deleteCorruptEntry(ssml: string, entry: CachedAudio): void {
    this.audioCache.delete(ssml, entry);
    this.preloadedQueue = this.preloadedQueue.filter(
      (item) => item.ssml !== ssml || item.blob !== entry.blob,
    );
  }

  takePreloaded(ssml: string): PreloadedAudio | undefined {
    const index = this.preloadedQueue.findIndex((item) => item.ssml === ssml);
    return index >= 0 ? this.preloadedQueue.splice(index, 1)[0] : undefined;
  }

  hasInFlight(ssml: string): boolean {
    return this.preloadPromises.has(ssml);
  }

  async waitForInFlight(ssml: string, signal: AbortSignal): Promise<void> {
    const prefetch = this.preloadPromises.get(ssml);
    if (!prefetch) return;

    await new Promise<void>((resolve, reject) => {
      const abort = () =>
        reject(Object.assign(new Error('朗读操作已取消'), { name: 'AbortError' }));
      signal.addEventListener('abort', abort, { once: true });
      void prefetch.then(
        () => {
          signal.removeEventListener('abort', abort);
          resolve();
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
    });
  }

  recordPreloadHit(): void {
    this.consecutivePreloadMisses = 0;
  }

  recordPreloadMiss(isContinuous?: boolean): void {
    if (isContinuous) {
      this.consecutivePreloadMisses += 1;
    }
  }

  recordSynthesisLatency(latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs <= 0) return;

    this.synthesisLatencySamples.push(latencyMs);
    if (this.synthesisLatencySamples.length > this.maxSynthesisLatencySamples) {
      this.synthesisLatencySamples.shift();
    }
  }

  getAverageSynthesisLatency(): number {
    if (this.synthesisLatencySamples.length === 0) return 0;

    const total = this.synthesisLatencySamples.reduce((sum, value) => sum + value, 0);
    return total / this.synthesisLatencySamples.length;
  }

  getAdaptivePreloadConfig(duration: number): AdaptivePreloadConfig {
    const averageLatency = this.getAverageSynthesisLatency();
    let progressThreshold = this.preloadProgressThreshold;
    let remainingSeconds = this.preloadRemainingSeconds;
    let reason = 'default';

    if (averageLatency > 5000) {
      progressThreshold = 0.12;
      remainingSeconds = 20;
      reason = 'slow-synthesis';
    } else if (averageLatency > 2500) {
      progressThreshold = 0.2;
      remainingSeconds = 15;
      reason = 'moderate-synthesis';
    } else if (averageLatency > 0 && averageLatency < 1000 && this.consecutivePreloadMisses === 0) {
      progressThreshold = 0.42;
      remainingSeconds = 8;
      reason = 'fast-synthesis';
    }

    if (this.consecutivePreloadMisses >= 2) {
      progressThreshold = Math.min(progressThreshold, 0.16);
      remainingSeconds = Math.max(remainingSeconds, 18);
      reason = 'preload-misses';
    }

    if (duration > 0 && duration <= 18) {
      progressThreshold = 0.05;
      remainingSeconds = Math.max(1, duration - 1);
      reason = 'short-audio';
    }

    return { progressThreshold, remainingSeconds, reason };
  }

  async preload(ssml: string, marks?: TTSMark[]): Promise<void> {
    if (!ssml) return;
    if (isSSMLTooLarge(ssml)) {
      this.logMetric('preload.skipped-too-large', { ssmlBytes: getUTF8ByteLength(ssml) });
      return;
    }

    if (this.audioCache.has(ssml)) return;
    if (this.preloadedQueue.some((p) => p.ssml === ssml)) return;

    const existing = this.preloadPromises.get(ssml);
    if (existing) return existing;

    const promise = new Promise<void>((resolve) => {
      this.queuedPreloadKeys.add(ssml);
      this.pendingPreloadTasks.push({ ssml, marks, resolve });
      this.logMetric('preload.enqueued', { ssmlBytes: ssml.length });
      this.pumpPreloadQueue();
    });
    this.preloadPromises.set(ssml, promise);
    void promise.finally(() => {
      if (this.preloadPromises.get(ssml) === promise) this.preloadPromises.delete(ssml);
    });
    return promise;
  }

  async preloadMultiple(ssmlList: string[]): Promise<void> {
    const validList = ssmlList.filter(
      (ssml) =>
        ssml &&
        !this.audioCache.has(ssml) &&
        !this.preloadedQueue.some((p) => p.ssml === ssml),
    );

    if (validList.length === 0) return;

    const toPreload = validList.slice(0, this.maxPreloadCount - this.preloadedQueue.length);
    if (toPreload.length === 0) return;

    await Promise.allSettled(toPreload.map((ssml) => this.preload(ssml)));
  }

  cleanupIrrelevantPreloads(relevantSSMLs: string[]): void {
    const relevantSet = new Set(relevantSSMLs);
    const toRemove: string[] = [];

    this.preloadedQueue = this.preloadedQueue.filter((p) => {
      const isRelevant = relevantSet.has(p.ssml);
      if (!isRelevant) {
        toRemove.push(p.ssml);
      }
      return isRelevant;
    });

    if (toRemove.length > 0) {
      this.logMetric('preload.cleanup-ready', { removed: toRemove.length });
    }

    let cancelledInFlight = 0;
    for (const ssml of Array.from(this.preloadAbortControllers.keys())) {
      if (!relevantSet.has(ssml)) {
        const controller = this.preloadAbortControllers.get(ssml);
        controller?.abort();
        this.preloadAbortControllers.delete(ssml);
        this.preloadPromises.delete(ssml);
        cancelledInFlight += 1;
      }
    }
    if (cancelledInFlight > 0) {
      this.logMetric('preload.cleanup-inflight', { removed: cancelledInFlight });
    }

    let removedPending = 0;
    this.pendingPreloadTasks = this.pendingPreloadTasks.filter((task) => {
      const isRelevant = relevantSet.has(task.ssml);
      if (!isRelevant) {
        this.queuedPreloadKeys.delete(task.ssml);
        this.preloadPromises.delete(task.ssml);
        task.resolve();
        removedPending += 1;
      }
      return isRelevant;
    });
    if (removedPending > 0) {
      this.logMetric('preload.cleanup-pending', { removed: removedPending });
    }
  }

  cancelPreload(ssml: string): void {
    const controller = this.preloadAbortControllers.get(ssml);
    if (controller) {
      controller.abort();
      this.preloadAbortControllers.delete(ssml);
    }
    this.preloadPromises.delete(ssml);

    this.pendingPreloadTasks = this.pendingPreloadTasks.filter((task) => {
      if (task.ssml !== ssml) return true;
      this.queuedPreloadKeys.delete(task.ssml);
      task.resolve();
      return false;
    });
  }

  cancelAllPreloads(): void {
    for (const [, controller] of this.preloadAbortControllers) {
      controller.abort();
    }
    this.preloadAbortControllers.clear();
    this.preloadPromises.clear();
    this.pendingPreloadTasks.forEach((task) => {
      this.queuedPreloadKeys.delete(task.ssml);
      task.resolve();
    });
    this.pendingPreloadTasks = [];
  }

  clearPreloadQueue(): void {
    this.cancelAllPreloads();
    this.preloadedQueue = [];
  }

  clearAll(): void {
    this.clearPreloadQueue();
    this.audioCache.clear();
  }

  private trimPreloadQueue(): void {
    while (this.preloadedQueue.length > this.maxPreloadCount) {
      this.preloadedQueue.shift();
    }
  }

  private pumpPreloadQueue(): void {
    while (
      this.activePreloadCount < this.maxPreloadConcurrency &&
      this.pendingPreloadTasks.length > 0
    ) {
      const task = this.pendingPreloadTasks.shift();
      if (!task) return;

      this.queuedPreloadKeys.delete(task.ssml);
      this.activePreloadCount += 1;
      this.logMetric('preload.started', { ssmlBytes: task.ssml.length });
      void this.runPreloadTask(task).finally(() => {
        this.activePreloadCount = Math.max(0, this.activePreloadCount - 1);
        task.resolve();
        this.pumpPreloadQueue();
      });
    }
  }

  private async runPreloadTask(task: PreloadTask): Promise<void> {
    const { ssml, marks } = task;

    if (this.audioCache.has(ssml)) return;
    if (this.preloadedQueue.some((p) => p.ssml === ssml)) return;

    const { controller, timeoutId } = createAbortController(TTS_REQUEST_TIMEOUT_MS);
    this.preloadAbortControllers.set(ssml, controller);
    const start = performance.now();

    try {
      const marksArray = marks && marks.length > 0
        ? marks
        : [{ name: '0', text: stripSSML(ssml) }];

      const blob = await this.fetcher.fetchWithController(ssml, controller);
      if (controller.signal.aborted) return;

      const preloaded: PreloadedAudio = {
        blob,
        ssml,
        marks: marksArray,
        timestamp: Date.now(),
      };

      this.preloadedQueue.push(preloaded);
      this.trimPreloadQueue();
      const latencyMs = Math.round(performance.now() - start);
      this.recordSynthesisLatency(latencyMs);
      this.logMetric('preload.complete', {
        bytes: blob.size,
        latencyMs,
        averageLatencyMs: Math.round(this.getAverageSynthesisLatency()),
      });
    } catch (error) {
      if (classifyTTSError(error) === 'cancelled') {
        this.logMetric('preload.abort', {
          latencyMs: Math.round(performance.now() - start),
        });
        return;
      }
      this.logMetric('preload.error', {
        latencyMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : String(error),
      });
      if (process.env.NODE_ENV === 'development') console.error('Preload failed:', error);
    } finally {
      clearTimeout(timeoutId);
      if (this.preloadAbortControllers.get(ssml) === controller) {
        this.preloadAbortControllers.delete(ssml);
      }
    }
  }
}
