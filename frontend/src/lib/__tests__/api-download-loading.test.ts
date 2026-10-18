import { describe, expect, it, vi } from 'vitest';

const { loaded, share } = vi.hoisted(() => ({
  loaded: vi.fn(),
  share: vi.fn(async () => new Blob(['downloaded book'])),
}));

vi.mock('@/lib/shared-book-download', () => {
  loaded();
  return {
    shareBookDownload: share,
    bookDownloadAborted: () => new DOMException('cancelled', 'AbortError'),
  };
});

import { api } from '@/lib/api';

describe('download module loading', () => {
  it('defers the download pipeline until a book file is requested', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('[]'));

    await api.listBooks();
    expect(loaded).not.toHaveBeenCalled();

    expect((await api.fetchBook('book')).size).toBeGreaterThan(0);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledTimes(1);
  });
});
