import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPartialBookDownloadWriter,
  getOfflineBook,
  getPartialBookDownload,
  saveOfflineBook,
} from '@/lib/offline-books';
import { installBookCache } from './book-cache-fixture';
import type { Book } from '@/lib/api';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

describe('offline book validation', () => {
  it('only returns a cached book when the requested content hash matches', async () => {
    installBookCache();
    const book = { id: 'book', filename: 'book.epub', content_hash: 'original' } as Book;
    await saveOfflineBook('reader', book, new Blob(['cached book']));

    expect(await getOfflineBook('reader', 'book', 'changed')).toBeNull();
    expect(await (await getOfflineBook('reader', 'book', 'original'))?.text()).toBe('cached book');
  });
});
