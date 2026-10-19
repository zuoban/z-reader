import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import { afterEach, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type { AddressInfo } from 'node:net';

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
  expect(await api.getBooksStatus([])).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  const ids = [randomUUID(), randomUUID()];
  await api.getBooksStatus(ids);
  expect(new URL(fetch.mock.calls[0][0], 'http://localhost').searchParams.get('book_ids'))
    .toBe(ids.join(','));
});

it.each([
  { count: 99, batches: [99] },
  { count: 100, batches: [100] },
  { count: 101, batches: [100, 1] },
  { count: 500, batches: [100, 100, 100, 100, 100] },
  { count: 501, batches: [100, 100, 100, 100, 100, 1] },
])('keeps status URLs below 4 KiB and merges all $count UUIDs', async ({ count, batches }) => {
  const ids = Array.from({ length: count }, () => randomUUID());
  const requests: URL[] = [];
  const requestedIds: string[][] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    const batch = url.searchParams.get('book_ids')!.split(',');
    requests.push(url);
    requestedIds.push(batch);
    return new Response(JSON.stringify({
      books: batch.map((id) => ({ id, processing_state: 'ready' })),
    }));
  }));

  const books = await api.getBooksStatus(ids);

  expect(requestedIds.map((batch) => batch.length)).toEqual(batches);
  expect(requestedIds.flat()).toEqual(ids);
  expect(books).toEqual(ids.map((id) => ({ id, processing_state: 'ready' })));
  for (const url of requests) {
    expect(url.pathname).toBe('/api/books/status');
    expect(Buffer.byteLength(url.pathname + url.search)).toBeLessThan(4 * 1024);
  }
});

it('refreshes 501 UUID book statuses through a server with a 16 KiB header limit', async () => {
  const ids = Array.from({ length: 501 }, () => randomUUID());
  const expectedBooks = ids.map((id) => ({ id, processing_state: 'ready' }));
  const requestedIds: string[][] = [];
  const server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    const batch = url.searchParams.get('book_ids')!.split(',');
    requestedIds.push(batch);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      books: batch.map((id) => ({ id, processing_state: 'ready' })),
    }));
  });
  const realFetch = globalThis.fetch;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    vi.stubGlobal('fetch', (input: string, options: RequestInit) => {
      const url = new URL(input, origin);
      return realFetch(`${origin}${url.pathname}${url.search}`, options);
    });

    await expect(api.getBooksStatus(ids)).resolves.toEqual(expectedBooks);
    expect(requestedIds.flat()).toEqual(ids);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
