import type { Book } from '@/lib/api';

const CACHE_PREFIX = 'z-reader-offline-books-v1:';
const CACHE_KEY_PREFIX = '/__z-reader-offline-books/';
const QUOTA_HEADROOM = 0.9;

function cacheName(userId: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

function cacheRequest(bookId: string): Request {
  return new Request(`${CACHE_KEY_PREFIX}${encodeURIComponent(bookId)}`);
}

function supportsOfflineBooks(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

async function ensureCapacity(bytes: number) {
  if (!navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  if (!estimate.quota || !estimate.usage) return;
  if (estimate.usage + bytes > estimate.quota * QUOTA_HEADROOM) {
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

export async function getOfflineBook(userId: string, bookId: string): Promise<File | Blob | null> {
  if (!userId || !supportsOfflineBooks()) return null;
  const cache = await caches.open(cacheName(userId));
  const response = await cache.match(cacheRequest(bookId));
  if (!response) return null;

  const blob = await response.blob();
  const encodedFilename = response.headers.get('X-Z-Reader-Filename');
  const filename = encodedFilename ? decodeURIComponent(encodedFilename) : `${bookId}.epub`;
  try {
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  } catch {
    return blob;
  }
}

export async function removeOfflineBook(userId: string, bookId: string) {
  if (!userId || !supportsOfflineBooks()) return;
  const cache = await caches.open(cacheName(userId));
  await cache.delete(cacheRequest(bookId));
}

// Explicit downloads are stored in a per-account cache and removed at logout
// so another account in the same browser profile can never discover them.
export async function clearOfflineBooks(userId: string | undefined) {
  if (!userId || !supportsOfflineBooks()) return;
  await caches.delete(cacheName(userId));
}
