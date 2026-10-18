import type { Book } from '@/lib/api';

const CACHE_PREFIX = 'z-reader-offline-books-v1:';
const CACHE_KEY_PREFIX = '/__z-reader-offline-books/';
const PARTIAL_DOWNLOAD_KEY_PREFIX = `${CACHE_KEY_PREFIX}partial/`;
const QUOTA_HEADROOM = 0.9;
const QUOTA_CHECK_INTERVAL = 8 * 1024 * 1024;

export interface PartialBookDownload {
  chunks: Blob[];
  downloadedBytes: number;
  totalBytes: number | null;
  contentType: string;
  etag?: string;
}

interface PartialBookDownloadMeta {
  chunks: number;
  downloadedBytes: number;
  totalBytes: number | null;
  contentType: string;
  etag?: string;
  updatedAt: number;
}

function cacheName(userId: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

function cacheRequest(bookId: string): Request {
  return new Request(`${CACHE_KEY_PREFIX}${encodeURIComponent(bookId)}`);
}

function partialDownloadPath(bookId: string): string {
  return `${PARTIAL_DOWNLOAD_KEY_PREFIX}${encodeURIComponent(bookId)}/`;
}

function partialDownloadMetaRequest(bookId: string): Request {
  return new Request(`${partialDownloadPath(bookId)}meta`);
}

function partialDownloadChunkRequest(bookId: string, chunkIndex: number): Request {
  return new Request(`${partialDownloadPath(bookId)}chunk/${chunkIndex}`);
}

function supportsOfflineBooks(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

async function ensureCapacity(bytes: number) {
  if (!navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  if (!estimate.quota) return;
  if ((estimate.usage ?? 0) + bytes > estimate.quota * QUOTA_HEADROOM) {
    throw new Error('设备离线存储空间不足，请先移除不再需要的离线图书');
  }
}

export async function saveOfflineBook(userId: string, book: Book, file: Blob) {
  if (!supportsOfflineBooks()) {
    throw new Error('当前浏览器不支持离线图书');
  }
  await ensureCapacity(file.size);
  const cache = await caches.open(cacheName(userId));
  await cache.put(cacheRequest(book.id), new Response(file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Z-Reader-Filename': encodeURIComponent(book.filename),
      'X-Z-Reader-Content-Hash': book.content_hash ?? '',
    },
  }));
}

// Cache Storage cannot append to a Response. In-progress downloads are instead
// stored as numbered chunks and reassembled only after the remaining range has
// been received. This keeps interrupted downloads resumable without retaining
// a completed, implicit offline copy after a normal reading session.
export async function getPartialBookDownload(
  userId: string,
  bookId: string
): Promise<PartialBookDownload | null> {
  if (!userId || !supportsOfflineBooks()) return null;

  try {
    const cache = await caches.open(cacheName(userId));
    const metaResponse = await cache.match(partialDownloadMetaRequest(bookId));
    if (!metaResponse) return null;

    const meta = await metaResponse.json() as PartialBookDownloadMeta;
    if (
      !Number.isInteger(meta.chunks) ||
      meta.chunks <= 0 ||
      !Number.isFinite(meta.downloadedBytes) ||
      meta.downloadedBytes <= 0
    ) {
      await clearPartialBookDownload(userId, bookId);
      return null;
    }

    const chunks: Blob[] = [];
    for (let index = 0; index < meta.chunks; index += 1) {
      const response = await cache.match(partialDownloadChunkRequest(bookId, index));
      if (!response) {
        await clearPartialBookDownload(userId, bookId);
        return null;
      }
      chunks.push(await response.blob());
    }

    const chunkBytes = chunks.reduce((total, chunk) => total + chunk.size, 0);
    if (chunkBytes !== meta.downloadedBytes) {
      await clearPartialBookDownload(userId, bookId);
      return null;
    }

    return {
      chunks,
      downloadedBytes: meta.downloadedBytes,
      totalBytes: Number.isFinite(meta.totalBytes) ? meta.totalBytes : null,
      contentType: meta.contentType || 'application/octet-stream',
      etag: typeof meta.etag === 'string' ? meta.etag : undefined,
    };
  } catch {
    return null;
  }
}

export async function appendPartialBookDownload(
  userId: string,
  bookId: string,
  chunk: Blob,
  totalBytes: number | null,
  contentType: string
): Promise<void> {
  if (!userId || !supportsOfflineBooks() || chunk.size === 0) return;

  const writer = await createPartialBookDownloadWriter(userId, bookId, totalBytes, contentType);
  await writer.append(chunk);
}

export interface PartialBookDownloadWriter {
  append: (chunk: Blob) => Promise<void>;
}

// A download owns one writer and serializes append calls. Commit metadata only
// after its chunk is durable, so any storage failure leaves a resumable prefix.
export async function createPartialBookDownloadWriter(
  userId: string,
  bookId: string,
  totalBytes: number | null,
  contentType: string,
  initialDownload?: PartialBookDownload | null,
  etag?: string
): Promise<PartialBookDownloadWriter> {
  if (!userId || !supportsOfflineBooks()) return { append: async () => {} };
  const cache = await caches.open(cacheName(userId));
  let chunks = initialDownload?.chunks.length ?? 0;
  let downloadedBytes = initialDownload?.downloadedBytes ?? 0;
  if (initialDownload === undefined) {
    const response = await cache.match(partialDownloadMetaRequest(bookId));
    if (response) {
      const previous = await response.json() as PartialBookDownloadMeta;
      chunks = previous.chunks;
      downloadedBytes = previous.downloadedBytes;
    }
  }
  let bytesSinceQuotaCheck = QUOTA_CHECK_INTERVAL;

  return {
    async append(chunk) {
      if (!chunk.size) return;
      if (bytesSinceQuotaCheck >= QUOTA_CHECK_INTERVAL) {
        await ensureCapacity(chunk.size);
        bytesSinceQuotaCheck = 0;
      }
      const meta: PartialBookDownloadMeta = {
        chunks: chunks + 1,
        downloadedBytes: downloadedBytes + chunk.size,
        totalBytes,
        contentType: contentType || 'application/octet-stream',
        etag: etag || initialDownload?.etag,
        updatedAt: Date.now(),
      };
      await cache.put(partialDownloadChunkRequest(bookId, chunks), new Response(chunk));
      await cache.put(
        partialDownloadMetaRequest(bookId),
        new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } })
      );
      chunks = meta.chunks;
      downloadedBytes = meta.downloadedBytes;
      bytesSinceQuotaCheck += chunk.size;
    },
  };
}

export async function clearPartialBookDownload(userId: string, bookId: string): Promise<void> {
  if (!userId || !supportsOfflineBooks()) return;

  const cache = await caches.open(cacheName(userId));
  const prefix = partialDownloadPath(bookId);
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((request) => new URL(request.url).pathname.startsWith(prefix))
      .map((request) => cache.delete(request))
  );
}

export interface OfflineBookEntry {
  file: File | Blob;
  contentHash: string;
}

export async function getOfflineBookEntry(
  userId: string,
  bookId: string,
  expectedContentHash?: string
): Promise<OfflineBookEntry | null> {
  if (!userId || !supportsOfflineBooks()) return null;
  const cache = await caches.open(cacheName(userId));
  const response = await cache.match(cacheRequest(bookId));
  if (!response) return null;
  const contentHash = response.headers.get('X-Z-Reader-Content-Hash') ?? '';
  if (expectedContentHash !== undefined && (
    !expectedContentHash || contentHash !== expectedContentHash
  )) return null;

  const blob = await response.blob();
  const encodedFilename = response.headers.get('X-Z-Reader-Filename');
  const filename = encodedFilename ? decodeURIComponent(encodedFilename) : `${bookId}.epub`;
  try {
    return {
      file: new File([blob], filename, { type: blob.type || 'application/octet-stream' }),
      contentHash,
    };
  } catch {
    return { file: blob, contentHash };
  }
}

export async function getOfflineBook(
  userId: string,
  bookId: string,
  expectedContentHash?: string
): Promise<File | Blob | null> {
  return (await getOfflineBookEntry(userId, bookId, expectedContentHash))?.file ?? null;
}

export async function removeOfflineBook(userId: string, bookId: string) {
  if (!userId || !supportsOfflineBooks()) return;
  const cache = await caches.open(cacheName(userId));
  await cache.delete(cacheRequest(bookId));
  await clearPartialBookDownload(userId, bookId);
}

// Explicit downloads are stored in a per-account cache and removed at logout
// so another account in the same browser profile can never discover them.
export async function clearOfflineBooks(userId: string | undefined) {
  if (!userId || !supportsOfflineBooks()) return;
  await caches.delete(cacheName(userId));
}
