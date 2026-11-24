import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOfflineBooks,
  createPartialBookDownloadWriter,
  getOfflineBook,
  getOfflineBookEntry,
  getPartialBookDownload,
  hasOfflineBook,
  listOfflineBooks,
  removeOfflineBook,
  saveOfflineBook,
} from '@/lib/offline-books';
import { deferred } from '@/test/deferred';
import { installBookCache } from './book-cache-fixture';
import type { Book } from '@/lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('partial book download writer', () => {
  it('reuses the cache and metadata while checking quota periodically', async () => {
    const { storage, cache, estimate } = installBookCache();
    const writer = await createPartialBookDownloadWriter('reader', 'book', null, 'application/epub+zip');
    for (let index = 0; index < 10; index += 1) {
      await writer.append(new Blob([new Uint8Array(1024 * 1024)]));
    }

    expect(storage.open).toHaveBeenCalledTimes(1);
    expect(cache.match).toHaveBeenCalledTimes(1);
    expect(estimate.mock.calls.length).toBeGreaterThan(1);
    expect(estimate.mock.calls.length).toBeLessThan(5);
    const partial = await getPartialBookDownload('reader', 'book');
    expect(partial?.downloadedBytes).toBe(10 * 1024 * 1024);
  });

  it('keeps the committed prefix when a later cache write fails', async () => {
    const { cache } = installBookCache();
    const writer = await createPartialBookDownloadWriter('reader', 'book', 12, 'text/plain');
    await writer.append(new Blob(['first ']));
    cache.put.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(writer.append(new Blob(['second']))).rejects.toThrow('quota exceeded');

    const partial = await getPartialBookDownload('reader', 'book');
    expect(partial?.downloadedBytes).toBe(6);
    expect(await partial?.chunks[0].text()).toBe('first ');
  });
});

describe('offline book validation and metadata', () => {
  it('removes an offline write that completes after its access expires', async () => {
    const { cache, entries, storage } = installBookCache();
    let active = true;
    let finishWrite!: () => void;
    const write = new Promise<void>((resolve) => { finishWrite = resolve; });
    const put = cache.put.getMockImplementation()!;
    cache.put.mockImplementation(async (request, response) => {
      await write;
      await put(request, response);
    });
    const book = { id: 'book', filename: 'book.epub' } as Book;
    const save = saveOfflineBook('reader', book, new Blob(['cached book']), () => active);
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce());
    active = false;
    await clearOfflineBooks('reader');
    finishWrite();
    await save;
    expect(entries.size).toBe(0);
    expect(storage.delete).toHaveBeenCalledTimes(2);
  });

  it('only returns a cached book when the requested content hash matches', async () => {
    installBookCache();
    const book = { id: 'book', filename: 'book.epub', content_hash: 'original' } as Book;
    await saveOfflineBook('reader', book, new Blob(['cached book']));

    expect(await getOfflineBook('reader', 'book', 'changed')).toBeNull();
    expect(await (await getOfflineBook('reader', 'book', 'original'))?.text()).toBe('cached book');
  });

  it('writes encoded metadata headers on saveOfflineBook and exposes them via getOfflineBookEntry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:30:00.000Z'));

    const { entries } = installBookCache();
    const book = {
      id: 'book-cn',
      filename: '三体.epub',
      title: '三体：地球往事',
      author: '刘慈欣',
      content_hash: 'hash-123',
    } as Book;
    const blob = new Blob(['book-content-bytes'], { type: 'application/epub+zip' });

    await saveOfflineBook('reader', book, blob);

    const stored = [...entries.values()][0];
    expect(stored).toBeDefined();
    expect(stored.headers.get('X-Z-Reader-Title')).toBe(encodeURIComponent('三体：地球往事'));
    expect(stored.headers.get('X-Z-Reader-Author')).toBe(encodeURIComponent('刘慈欣'));
    expect(stored.headers.get('X-Z-Reader-Size')).toBe(String(blob.size));
    expect(stored.headers.get('X-Z-Reader-Saved-At')).toBe('2026-05-01T12:30:00.000Z');
    expect(stored.headers.get('X-Z-Reader-Filename')).toBe(encodeURIComponent('三体.epub'));
    expect(stored.headers.get('X-Z-Reader-Content-Hash')).toBe('hash-123');

    const entry = await getOfflineBookEntry('reader', 'book-cn', 'hash-123');
    expect(entry).not.toBeNull();
    expect(entry?.title).toBe('三体：地球往事');
    expect(entry?.author).toBe('刘慈欣');
    expect(entry?.filename).toBe('三体.epub');
    expect(entry?.size).toBe(blob.size);
    expect(entry?.savedAt).toBe('2026-05-01T12:30:00.000Z');
  });

  it('rejects saveOfflineBook when storage quota headroom would be exceeded', async () => {
    const { estimate } = installBookCache();
    estimate.mockResolvedValue({ usage: 890, quota: 1000 });
    const book = { id: 'big-book', filename: 'big.epub', content_hash: 'h1' } as Book;

    await expect(
      saveOfflineBook('reader', book, new Blob([new Uint8Array(20)])),
    ).rejects.toThrow('设备离线存储空间不足，请先移除不再需要的离线图书');
  });

  it('rejects saveOfflineBook when Cache Storage is unavailable', async () => {
    const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches');
    Reflect.deleteProperty(window, 'caches');
    try {
      const book = { id: 'book-1', filename: 'book.epub' } as Book;
      await expect(saveOfflineBook('reader', book, new Blob(['abc']))).rejects.toThrow(
        '当前浏览器不支持离线图书',
      );
    } finally {
      if (originalCaches) {
        Object.defineProperty(window, 'caches', originalCaches);
      }
    }
  });
});

describe('offline book management (list, has, remove, clear)', () => {
  it('reads cached book metadata in batches of at most four', async () => {
    const { cache } = installBookCache();
    const releaseReads = deferred<void>();
    for (let index = 0; index < 6; index += 1) {
      await cache.put(
        new Request(`/__z-reader-offline-books/book-${index}`),
        new Response('book', { headers: { 'X-Z-Reader-Size': '4' } }),
      );
    }
    const match = cache.match.getMockImplementation()!;
    cache.match.mockImplementation(async (request) => {
      await releaseReads.promise;
      return match(request);
    });

    const listing = listOfflineBooks('reader');
    try {
      await vi.waitFor(() => expect(cache.match).toHaveBeenCalledTimes(4));
    } finally {
      releaseReads.resolve();
      await listing;
    }
    expect((await listing).map((book) => book.bookId)).toEqual([
      'book-0', 'book-1', 'book-2', 'book-3', 'book-4', 'book-5',
    ]);
    expect(cache.match).toHaveBeenCalledTimes(6);
  });

  it('lists offline books sorted by savedAt desc, ignores partial downloads, and handles legacy entries', async () => {
    vi.useFakeTimers();
    const { cache } = installBookCache();

    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));
    await saveOfflineBook(
      'reader',
      { id: 'older', filename: 'older.epub', title: 'Older Book', author: 'Author A' } as Book,
      new Blob(['1234']),
    );

    vi.setSystemTime(new Date('2026-05-02T10:00:00.000Z'));
    await saveOfflineBook(
      'reader',
      { id: 'newer', filename: 'newer.epub', title: 'Newer Book', author: 'Author B' } as Book,
      new Blob(['12345678']),
    );

    // Partial download entry should be filtered out of listOfflineBooks
    const writer = await createPartialBookDownloadWriter('reader', 'partial-book', 100, 'application/epub+zip');
    await writer.append(new Blob(['partial-chunk']));

    // Legacy entry without X-Z-Reader-Title / Author / Size / Saved-At headers
    await cache.put(
      new Request('/__z-reader-offline-books/legacy-id'),
      new Response(new Blob(['legacy-bytes']), {
        headers: {
          'Content-Type': 'application/epub+zip',
          'X-Z-Reader-Filename': encodeURIComponent('Legacy Novel.epub'),
        },
      }),
    );

    // Legacy entry with no headers at all
    await cache.put(
      new Request('/__z-reader-offline-books/bare-id'),
      new Response(new Blob(['bare'])),
    );

    // Unrelated cache entry should be ignored
    await cache.put(new Request('/other-cache/ignored'), new Response('ignored'));

    const list = await listOfflineBooks('reader');
    expect(list.map((b) => b.bookId)).toEqual(['newer', 'older', 'bare-id', 'legacy-id']);

    expect(list[0]).toEqual({
      bookId: 'newer',
      filename: 'newer.epub',
      title: 'Newer Book',
      author: 'Author B',
      size: 8,
      savedAt: '2026-05-02T10:00:00.000Z',
    });

    // Legacy entries fall back gracefully
    const legacy = list.find((b) => b.bookId === 'legacy-id');
    expect(legacy).toEqual({
      bookId: 'legacy-id',
      filename: 'Legacy Novel.epub',
      title: 'Legacy Novel',
      author: '',
      size: 12,
      savedAt: '',
    });

    const bare = list.find((b) => b.bookId === 'bare-id');
    expect(bare).toEqual({
      bookId: 'bare-id',
      filename: 'bare-id.epub',
      title: 'bare-id',
      author: '',
      size: 4,
      savedAt: '',
    });
  });

  it('checks offline book existence with hasOfflineBook', async () => {
    installBookCache();
    await saveOfflineBook(
      'reader',
      { id: 'book-1', filename: 'book-1.epub', title: 'Book 1' } as Book,
      new Blob(['data']),
    );

    expect(await hasOfflineBook('reader', 'book-1')).toBe(true);
    expect(await hasOfflineBook('reader', 'missing')).toBe(false);
    expect(await hasOfflineBook('', 'book-1')).toBe(false);
    expect(await hasOfflineBook('reader', '')).toBe(false);
  });

  it('removes both the cached book and any partial download chunks on removeOfflineBook', async () => {
    installBookCache();
    await saveOfflineBook(
      'reader',
      { id: 'book-1', filename: 'book-1.epub', title: 'Book 1' } as Book,
      new Blob(['data']),
    );
    const writer = await createPartialBookDownloadWriter('reader', 'book-1', 100, 'application/epub+zip');
    await writer.append(new Blob(['chunk-1']));

    expect(await hasOfflineBook('reader', 'book-1')).toBe(true);
    expect(await getPartialBookDownload('reader', 'book-1')).not.toBeNull();

    await removeOfflineBook('reader', 'book-1');

    expect(await hasOfflineBook('reader', 'book-1')).toBe(false);
    expect(await getPartialBookDownload('reader', 'book-1')).toBeNull();
  });

  it('deletes the user cache on clearOfflineBooks and no-ops when userId is undefined', async () => {
    const { storage } = installBookCache();
    await saveOfflineBook(
      'reader',
      { id: 'book-1', filename: 'book-1.epub', title: 'Book 1' } as Book,
      new Blob(['data']),
    );

    await clearOfflineBooks(undefined);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(await hasOfflineBook('reader', 'book-1')).toBe(true);

    await clearOfflineBooks('reader');
    expect(storage.delete).toHaveBeenCalledWith('z-reader-offline-books-v1:reader');
    expect(await hasOfflineBook('reader', 'book-1')).toBe(false);
  });
});
