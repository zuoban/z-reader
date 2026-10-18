import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';

afterEach(() => vi.unstubAllGlobals());

it('sends category, uncategorized and cursor filters to the server', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ books: [] })));
  vi.stubGlobal('fetch', fetch);
  await api.listBooksPage('next', 50, 'author', { category: '科幻' });
  const list = new URL(fetch.mock.calls[0][0], 'http://localhost');
  expect(Object.fromEntries(list.searchParams)).toEqual({
    cursor: 'next', limit: '50', sort: 'author', category: '科幻',
  });
  await api.searchBooks('星', undefined, 50, 'title', { uncategorized: true });
  const search = new URL(fetch.mock.calls[1][0], 'http://localhost');
  expect(Object.fromEntries(search.searchParams)).toEqual({
    q: '星', limit: '50', sort: 'title', uncategorized: 'true',
  });
});

it('cancels an in-flight shelf query using the caller signal', async () => {
  let requestSignal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => {
    requestSignal = options.signal ?? undefined;
    return new Promise((_resolve, reject) => requestSignal?.addEventListener('abort',
      () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }));
  }));
  const controller = new AbortController();
  const request = api.listBooksPage(undefined, 50, 'title', { signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toThrow();
  expect(requestSignal?.aborted).toBe(true);
});

it('combines pending book IDs in a single status request and skips empty requests', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ books: [] })));
  vi.stubGlobal('fetch', fetch);
  await api.getBooksStatus([]);
  expect(fetch).not.toHaveBeenCalled();
  await api.getBooksStatus(['a', 'b']);
  expect(new URL(fetch.mock.calls[0][0], 'http://localhost').searchParams.get('book_ids'))
    .toBe('a,b');
  fetch.mockClear();
  await api.getBooksStatus(Array.from({ length: 501 }, (_, index) => String(index)));
  expect(fetch).toHaveBeenCalledTimes(2);
});
