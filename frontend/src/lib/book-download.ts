import { DEFAULT_TIMEOUT, isAbortLikeError } from '@/lib/config';
import {
  createPartialBookDownloadWriter,
  clearPartialBookDownload,
  getOfflineBookEntry,
  getPartialBookDownload,
} from '@/lib/offline-books';
import { bookDownloadAborted, shareBookDownload } from '@/lib/shared-book-download';
import type { Book, FetchBookOptions } from '@/lib/api';

interface BookDownloadContext {
  library: string;
  generation: () => string | null;
  getBook: (id: string, signal?: AbortSignal) => Promise<Book>;
  fetchBook: (id: string, options: FetchBookOptions) => Promise<Blob>;
  requestFile: (path: string, options: RequestInit) => Promise<Response>;
  isApiError: (error: unknown) => boolean;
  authChangedError: () => Error;
}

function parseContentRange(value: string | null): { start: number; totalBytes: number | null } | null {
  if (!value) return null;
  const match = /^bytes\s+(\d+)-\d+\/(\d+|\*)$/i.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const totalBytes = match[2] === '*' ? null : Number(match[2]);
  if (!Number.isFinite(start) || (totalBytes !== null && !Number.isFinite(totalBytes))) {
    return null;
  }
  return { start, totalBytes };
}

function contentLength(response: Response): number | null {
  const header = response.headers.get('Content-Length');
  if (header === null) return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function createDownloadProgressReporter(
  onProgress: FetchBookOptions['onProgress'],
  initialBytes: number,
  totalBytes: number | null,
  resumed: boolean
) {
  const startedAt = performance.now();
  let lastReportedAt = 0;

  return (downloadedBytes: number, force = false) => {
    if (!onProgress) return;
    const now = performance.now();
    if (!force && now - lastReportedAt < 160) return;
    lastReportedAt = now;
    const elapsedMs = now - startedAt;
    const transferredBytes = Math.max(0, downloadedBytes - initialBytes);
    const bytesPerSecond = elapsedMs > 0 && transferredBytes > 0
      ? (transferredBytes * 1000) / elapsedMs
      : null;
    const percentage = totalBytes && totalBytes > 0
      ? Math.min(100, (downloadedBytes / totalBytes) * 100)
      : null;
    onProgress({
      downloadedBytes,
      totalBytes,
      percentage,
      bytesPerSecond,
      resumed,
    });
  };
}

async function waitForDownload<T>(pending: Promise<T>, cancel: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('书籍下载超时，请重试以继续下载'));
      cancel();
    }, DEFAULT_TIMEOUT);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function getBookFileResponse(
  context: BookDownloadContext,
  id: string,
  startAt: number,
  signal?: AbortSignal,
  etag?: string
): Promise<Response> {
  return context.requestFile(`/api/books/${encodeURIComponent(id)}/file`, {
    credentials: 'include',
    headers: startAt > 0 ? {
      Range: `bytes=${startAt}-`,
      ...(etag ? { 'If-Range': etag } : {}),
    } : undefined,
    signal,
  });
}

async function downloadBookFile(
  id: string, options: FetchBookOptions, context: BookDownloadContext
): Promise<Blob> {
  const generation = context.generation();
  const throwIfAborted = () => {
    if (options.signal?.aborted) throw bookDownloadAborted();
    if (context.generation() !== generation) throw context.authChangedError();
  };
  throwIfAborted();
  const userId = context.library;
  let partialDownload = await getPartialBookDownload(userId, id);
  let downloadedBytes = partialDownload?.downloadedBytes ?? 0;
  throwIfAborted();
  let response = await getBookFileResponse(
    context, id, downloadedBytes, options.signal, partialDownload?.etag
  );

  let range = parseContentRange(response.headers.get('Content-Range'));
  const canAppend = downloadedBytes > 0 &&
    response.status === 206 &&
    range?.start === downloadedBytes;

  if (downloadedBytes > 0 && !canAppend) {
    const needsFreshResponse = response.status !== 200;
    if (needsFreshResponse) {
      // Start releasing the discarded body without making retry wait on it.
      void response.body?.cancel().catch(() => {});
    }
    await clearPartialBookDownload(userId, id);
    partialDownload = null;
    downloadedBytes = 0;

    if (needsFreshResponse) {
      response = await getBookFileResponse(context, id, 0, options.signal);
      range = parseContentRange(response.headers.get('Content-Range'));
    }
  }

  try {
    throwIfAborted();
  } catch (error) {
    void response.body?.cancel().catch(() => {});
    throw error;
  }
  if (!response.ok) {
    throw new Error(`加载书籍失败：${response.status} ${response.statusText}`);
  }

  const responseLength = contentLength(response);
  const totalBytes = range?.totalBytes ?? (
    responseLength === null
      ? partialDownload?.totalBytes ?? null
      : downloadedBytes + responseLength
  );
  const contentType = response.headers.get('Content-Type') ||
    partialDownload?.contentType ||
    'application/octet-stream';
  const initialBytes = downloadedBytes;
  const reportProgress = createDownloadProgressReporter(
    options.onProgress,
    initialBytes,
    totalBytes,
    initialBytes > 0
  );
  const parts = partialDownload?.chunks ?? [];
  const responseEtag = response.headers.get('ETag') ?? undefined;
  let writerPromise: Promise<Awaited<ReturnType<typeof createPartialBookDownloadWriter>> | null> | null = null;
  let writerDisabled = false;
  let completed = false;
  let wrotePartialChunk = false;
  let pendingChunks: Uint8Array[] = [];
  let pendingBytes = 0;
  let writeChain = Promise.resolve();
  const pendingWrites: Promise<void>[] = [];

  const getWriter = () => {
    if (writerDisabled || completed) return Promise.resolve(null);
    if (!writerPromise) {
      writerPromise = createPartialBookDownloadWriter(
        userId, id, totalBytes, contentType, partialDownload, responseEtag
      ).catch(() => {
        writerDisabled = true;
        return null;
      });
    }
    return writerPromise;
  };

  const persistChunk = async (chunk: Blob) => {
    parts.push(chunk);
    if (writerDisabled || completed) return;
    writeChain = writeChain.then(async () => {
      if (completed || writerDisabled || context.generation() !== generation) return;
      const writer = await getWriter();
      if (!writer || completed || context.generation() !== generation) return;
      try {
        wrotePartialChunk = true;
        await writer.append(chunk);
      } catch {
        // Keep the last committed prefix for retry, even when temporary
        // storage fails. The current read can still finish in memory.
        writerDisabled = true;
      }
    });
    pendingWrites.push(writeChain);
    if (pendingWrites.length >= 2) await pendingWrites.shift();
  };
  const persistPendingChunks = async () => {
    if (pendingBytes === 0) return;
    // Blob snapshots the bytes; do not allocate another copy of each network
    // buffer before building it. Only two batches may await cache writes.
    const chunk = new Blob(pendingChunks as BlobPart[], { type: contentType });
    pendingChunks = [];
    pendingBytes = 0;
    await persistChunk(chunk);
  };

  reportProgress(downloadedBytes, true);
  try {
    if (!response.body) {
      const file = await response.blob();
      throwIfAborted();
      if (file.size === 0) throw new Error('书籍文件为空');
      downloadedBytes += file.size;
      parts.push(file);
    } else {
      const reader = response.body.getReader();
      const cancelReader = () => { void reader.cancel().catch(() => {}); };
      if (options.signal?.aborted) cancelReader();
      else options.signal?.addEventListener('abort', cancelReader, { once: true });
      try {
        while (true) {
          throwIfAborted();
          const { done, value } = await waitForDownload(reader.read(), cancelReader);
          throwIfAborted();
          if (done) break;
          if (!value?.byteLength) continue;
          pendingChunks.push(value);
          pendingBytes += value.byteLength;
          downloadedBytes += value.byteLength;
          reportProgress(downloadedBytes);

          if (pendingBytes >= 1024 * 1024) await persistPendingChunks();
        }
      } finally {
        options.signal?.removeEventListener('abort', cancelReader);
        reader.releaseLock();
      }
    }

    throwIfAborted();
    if (downloadedBytes === 0) throw new Error('书籍文件为空');
    if (totalBytes !== null && downloadedBytes < totalBytes) {
      throw new Error('书籍下载未完成，请重试以继续下载');
    }

    completed = true;
    if (pendingBytes > 0) {
      parts.push(new Blob(pendingChunks as BlobPart[], { type: contentType }));
      pendingChunks = [];
      pendingBytes = 0;
    }

    reportProgress(downloadedBytes, true);
    if (partialDownload !== null) {
      await writeChain;
      await clearPartialBookDownload(userId, id).catch(() => {});
    } else if (wrotePartialChunk || pendingWrites.length > 0) {
      void writeChain
        .then(() => (wrotePartialChunk ? clearPartialBookDownload(userId, id) : undefined))
        .catch(() => {});
    }
    return new Blob(parts, { type: contentType });
  } catch (error) {
    // Include the final short batch before rejecting an interrupted read.
    await persistPendingChunks();
    await writeChain;
    throw error;
  }
}

export async function fetchBook(
  id: string, options: FetchBookOptions, context: BookDownloadContext
): Promise<Blob> {
  const generation = context.generation();
  const key = JSON.stringify([context.library, generation, id]);
  const file = await shareBookDownload(key, options, (downloadOptions) => {
    if (context.generation() !== generation) throw context.authChangedError();
    return downloadBookFile(id, downloadOptions, context);
  });
  if (context.generation() !== generation) throw context.authChangedError();
  return file;
}

export async function createBookFile(
  id: string, options: FetchBookOptions, context: BookDownloadContext
): Promise<File | Blob> {
  const generation = context.generation();
  let book: Book | undefined;
  let blob: Blob;
  const userId = context.library;
  const metadata = context.getBook(id, options.signal).then(
    (value) => ({ book: value }),
    (error: unknown) => ({ error })
  );
  const cached = await getOfflineBookEntry(userId, id).catch(() => null);
  if (options.signal?.aborted) throw bookDownloadAborted();
  if (context.generation() !== generation) throw context.authChangedError();
  const downloadController = new AbortController();
  const cancelDownload = () => downloadController.abort();
  options.signal?.addEventListener('abort', cancelDownload, { once: true });
  const downloadOptions = { ...options, signal: downloadController.signal };
  // With no explicit offline copy, metadata and content still load together.
  const download = cached ? null : context.fetchBook(id, downloadOptions);
  void download?.catch(() => {});
  try {
    const result = await metadata;
    if ('error' in result) throw result.error;
    book = result.book;
    if (options.signal?.aborted) throw bookDownloadAborted();
    if (context.generation() !== generation) {
      throw context.authChangedError();
    }
    if (cached && book.content_hash && cached.contentHash === book.content_hash) {
      return cached.file;
    }
    blob = await (download ?? context.fetchBook(id, downloadOptions));
    if (context.generation() !== generation) throw context.authChangedError();
  } catch (error) {
    cancelDownload();
    if (options.signal?.aborted) throw bookDownloadAborted();
    if (!context.isApiError(error) && !isAbortLikeError(error) &&
      cached && context.generation() === generation &&
      (!book || (book.content_hash && cached.contentHash === book.content_hash))) {
      return cached.file;
    }
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', cancelDownload);
  }

  // Try using File constructor first, fallback to Blob for compatibility
  let file: File | Blob;
  try {
    file = new File([blob], book.filename, {
      type: blob.type,
      lastModified: Date.parse(book.created_at) || Date.now(),
    });
  } catch (error) {
    console.warn('File constructor not supported, using Blob fallback:', error);
    // Fallback: just return the blob - foliate can work with Blob objects
    file = blob;
  }

  // Ensure arrayBuffer method exists (some older browsers don't have it on Blob)
  if (!file.arrayBuffer || typeof file.arrayBuffer !== 'function') {
    console.warn('Blob.arrayBuffer not supported, adding polyfill');
    (file as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async function() {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }

  // Ensure slice method exists
  if (!file.slice || typeof file.slice !== 'function') {
    console.warn('Blob.slice not supported, adding polyfill');
    (file as Blob & { slice: (start?: number, end?: number) => Blob }).slice = function(
      this: Blob,
      start?: number,
      end?: number
    ) {
      return blob.slice.call(this, start, end);
    };
  }

  return file;
}
