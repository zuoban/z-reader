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

function safeDecodeHeader(value: string | null): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseHeaderSize(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function titleFromFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\.[^.]+$/, '') || trimmed;
}

export async function saveOfflineBook(
  userId: string, book: Book, file: Blob, isCurrent = () => true,
) {
  if (!supportsOfflineBooks()) {
    throw new Error('当前浏览器不支持离线图书');
  }
  await ensureCapacity(file.size);
  if (!isCurrent()) return;
  const cache = await caches.open(cacheName(userId));
  try {
    if (!isCurrent()) return;
    await cache.put(cacheRequest(book.id), new Response(file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Z-Reader-Filename': encodeURIComponent(book.filename),
        'X-Z-Reader-Content-Hash': book.content_hash ?? '',
        'X-Z-Reader-Title': encodeURIComponent(book.title ?? ''),
        'X-Z-Reader-Author': encodeURIComponent(book.author ?? ''),
        'X-Z-Reader-Size': String(file.size),
        'X-Z-Reader-Saved-At': new Date().toISOString(),
      },
    }));
  } finally {
    if (!isCurrent()) await clearOfflineBooks(userId);
  }
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
  filename?: string;
  title?: string;
  author?: string;
  size?: number;
  savedAt?: string;
}

export interface OfflineBookSummary {
  bookId: string;
  filename: string;
  title: string;
  author: string;
  size: number;
  savedAt: string;
}

export async function hasOfflineBook(userId: string, bookId: string): Promise<boolean> {
  if (!userId || !bookId || !supportsOfflineBooks()) return false;
  try {
    const cache = await caches.open(cacheName(userId));
    const response = await cache.match(cacheRequest(bookId));
    return Boolean(response);
  } catch {
    return false;
  }
}

async function readOfflineBookMetadata(
  response: Response,
  bookId: string,
  fallbackSize?: number,
): Promise<OfflineBookSummary> {
  const filename = safeDecodeHeader(response.headers.get('X-Z-Reader-Filename')) || `${bookId}.epub`;
  const title = safeDecodeHeader(response.headers.get('X-Z-Reader-Title')) || titleFromFilename(filename);
  const author = safeDecodeHeader(response.headers.get('X-Z-Reader-Author'));
  const size = parseHeaderSize(response.headers.get('X-Z-Reader-Size')) ?? fallbackSize ?? (await response.blob()).size;
  const savedAt = response.headers.get('X-Z-Reader-Saved-At') ?? '';
  return { bookId, filename, title, author, size, savedAt };
}

export async function listOfflineBooks(userId: string): Promise<OfflineBookSummary[]> {
  if (!userId || !supportsOfflineBooks()) return [];
  try {
    const cache = await caches.open(cacheName(userId));
    const requests = await cache.keys();
    const entries: OfflineBookSummary[] = [];
    const lookupBatchSize = 4;

    const matchBook = async (request: Request) => {
      let pathname: string;
      try {
        pathname = new URL(request.url).pathname;
      } catch {
        return null;
      }
      if (!pathname.startsWith(CACHE_KEY_PREFIX) || pathname.startsWith(PARTIAL_DOWNLOAD_KEY_PREFIX)) {
        return null;
      }

      const rawId = pathname.slice(CACHE_KEY_PREFIX.length);
      if (!rawId || rawId.includes('/')) return null;
      const bookId = safeDecodeHeader(rawId);
      if (!bookId) return null;

      const response = await cache.match(request);
      return response ? { bookId, response } : null;
    };

    for (let offset = 0; offset < requests.length; offset += lookupBatchSize) {
      const matches = await Promise.all(requests.slice(offset, offset + lookupBatchSize).map(matchBook));
      for (const match of matches) {
        if (!match) continue;
        // Read legacy file bodies one at a time when the size header is missing.
        entries.push(await readOfflineBookMetadata(match.response, match.bookId));
      }
    }

    entries.sort((a, b) => {
      const timeA = a.savedAt ? Date.parse(a.savedAt) : 0;
      const timeB = b.savedAt ? Date.parse(b.savedAt) : 0;
      const safeA = Number.isFinite(timeA) ? timeA : 0;
      const safeB = Number.isFinite(timeB) ? timeB : 0;
      if (safeB !== safeA) return safeB - safeA;
      return a.title.localeCompare(b.title);
    });

    return entries;
  } catch {
    return [];
  }
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
  const { filename, title, author, size, savedAt } = await readOfflineBookMetadata(response, bookId, blob.size);
  const metadata = { contentHash, filename, title, author, size, savedAt };
  try {
    return {
      file: new File([blob], filename, { type: blob.type || 'application/octet-stream' }),
      ...metadata,
    };
  } catch {
    return { file: blob, ...metadata };
  }
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
