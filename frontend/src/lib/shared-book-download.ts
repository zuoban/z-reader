import type { BookDownloadProgress, FetchBookOptions } from '@/lib/api';

interface DownloadSubscriber {
  onProgress?: FetchBookOptions['onProgress'];
}

interface SharedDownload {
  controller: AbortController;
  promise: Promise<Blob>;
  subscribers: Set<DownloadSubscriber>;
  latestProgress?: BookDownloadProgress;
}

const downloads = new Map<string, SharedDownload>();

export function bookDownloadAborted(): DOMException {
  return new DOMException('书籍下载已取消', 'AbortError');
}

export function shareBookDownload(
  key: string,
  options: FetchBookOptions,
  start: (options: FetchBookOptions) => Promise<Blob>
): Promise<Blob> {
  if (options.signal?.aborted) return Promise.reject(bookDownloadAborted());

  let shared = downloads.get(key);
  if (shared?.controller.signal.aborted) {
    // A cancelled transfer may still be committing its last partial batch.
    // Let it finish before opening another writer for the same cache entry.
    const previous = shared.promise;
    return new Promise((resolve, reject) => {
      let cancelled = false;
      const detach = () => options.signal?.removeEventListener('abort', abort);
      const abort = () => {
        cancelled = true;
        detach();
        reject(bookDownloadAborted());
      };
      const restart = () => {
        detach();
        if (!cancelled) resolve(shareBookDownload(key, options, start));
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      previous.then(restart, restart);
    });
  }
  if (!shared) {
    const controller = new AbortController();
    const subscribers = new Set<DownloadSubscriber>();
    const entry: SharedDownload = {
      controller,
      subscribers,
      promise: Promise.resolve().then(() => start({
        signal: controller.signal,
        onProgress(progress) {
          entry.latestProgress = progress;
          for (const subscriber of subscribers) subscriber.onProgress?.(progress);
        },
      })).finally(() => {
        if (downloads.get(key) === entry) downloads.delete(key);
      }),
    };
    shared = entry;
    downloads.set(key, entry);
  }
  const entry = shared;

  return new Promise((resolve, reject) => {
    const subscriber: DownloadSubscriber = { onProgress: options.onProgress };
    const detach = () => {
      entry.subscribers.delete(subscriber);
      options.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      detach();
      reject(bookDownloadAborted());
      if (entry.subscribers.size === 0) {
        entry.controller.abort();
      }
    };
    entry.subscribers.add(subscriber);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (entry.latestProgress) options.onProgress?.(entry.latestProgress);
    entry.promise.then(
      (blob) => { detach(); resolve(blob); },
      (error) => { detach(); reject(error); }
    );
  });
}
